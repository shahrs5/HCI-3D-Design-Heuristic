import { useEffect, useRef, useState } from 'react';
import { readFree, readScore, readYesNo, type Answer } from './answers';
import { beep, canListen, canSpeak, getRate, listen, say, setRate, stopSpeaking, type Listening } from './voice';
import { CONDITIONS, GROUPS, allItems, checklist, type AuditData } from './types';
import { addCompleted, clearProgress, freshData, listCompleted, loadProgress, loadSetup, newId, saveProgress, saveSetup, type Progress, type Setup } from './results';
import { download, itemsCsv, outsideCsv } from './csv';

type Mode = 'voice' | 'keyboard';
type Step =
  | { kind: 'intro' }
  | { kind: 'item'; id: string; text: string; n: number; part?: { k: number; title: string } }
  | { kind: 'verify' }
  | { kind: 'reason' }
  | { kind: 'other' };

const STEPS: Step[] = [
  { kind: 'intro' },
  ...checklist.flatMap((c, k) => c.items.map((it, i) => ({
    kind: 'item' as const, id: it.id, text: it.text,
    n: allItems.findIndex((a) => a.id === it.id) + 1,
    part: i === 0 ? { k: k + 1, title: c.title } : undefined,
  }))),
  { kind: 'verify' },
  { kind: 'reason' },
  { kind: 'other' },
];
const N = allItems.length;
const SHORT_LABELS = ['no problem', 'cosmetic problem only', 'minor problem', 'major problem', 'catastrophe, must be fixed first'];

const toolName = (t: string) => (t === CONDITIONS[0] ? 'OpenSCAD with ChatGPT' : t === CONDITIONS[1] ? 'OpenSCAD with Claude' : 'the 3D design tool');

const SCALE = 'Here is the scale. 0: not an accessibility problem. 1: a cosmetic problem only. 2: a minor problem, low priority. ' +
  '3: a major problem, high priority. 4: a catastrophe, it must be fixed first. If you are not sure, or it does not apply, say not sure. ' +
  'To decide, think about how often the problem happened, how hard it was to get around, and whether it kept bothering you.';

class Cancelled extends Error {}
/** Returned by getAnswer when voice failed and the page switched to typed answers. */
const SWITCHED = '\u0000switched';

export default function Eval() {
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [phase, setPhase] = useState<'start' | 'running' | 'paused' | 'done'>('start');
  const [mode, setMode] = useState<Mode>('voice');
  const [prompt, setPrompt] = useState('');
  const [heard, setHeard] = useState('');
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState('');
  const [typed, setTyped] = useState('');
  const [pos, setPos] = useState(0);
  const [saved, setSaved] = useState<Progress | null>(loadProgress);
  const [lastDone, setLastDone] = useState<AuditData | null>(null);

  const runId = useRef(0);
  const dataRef = useRef<AuditData>(freshData(setup));
  const progRef = useRef<Progress | null>(null);
  const modeRef = useRef<Mode>('voice');
  const typedResolver = useRef<((s: string) => void) | null>(null);
  const listenRef = useRef<Listening | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);

  const updSetup = (p: Partial<Setup>) => setSetupState((s) => { const n = { ...s, ...p }; saveSetup(n); return n; });

  useEffect(() => { document.title = 'Rate the 3D design tool'; }, []);
  useEffect(() => { if (phase === 'done' || phase === 'start') h1.current?.focus(); }, [phase]);

  // ---------- talking & listening ----------
  const check = (id: number) => { if (id !== runId.current) throw new Cancelled(); };

  // Keyboard mode: short confirmations are queued and read together with the next question,
  // so a new announcement never cuts off the previous one.
  const queued = useRef('');
  /** Shows (and in voice mode speaks) a message. `question` marks text that waits for an answer. */
  const tell = async (id: number, text: string, question = false) => {
    check(id);
    if (modeRef.current === 'voice') { setPrompt(text); await say(text); check(id); return; }
    if (!question) { queued.current = `${queued.current}${text} `; setPrompt(queued.current.trim()); return; }
    const full = `${queued.current}${text}`.trim();
    queued.current = '';
    setPrompt(full);
    setLive('');
    await new Promise((r) => setTimeout(r, 60));
    setLive(full);
    check(id);
  };

  /** Waits for one answer: spoken (voice mode) or typed (both modes). */
  const getAnswer = async (id: number): Promise<string> => {
    const typedP = new Promise<string>((r) => { typedResolver.current = r; });
    inputRef.current?.focus();
    if (modeRef.current === 'voice' && canListen()) {
      beep('listen');
      setListening(true);
      setHeard('');
      const l = listen((partial) => setHeard(partial));
      listenRef.current = l;
      const winner = await Promise.race([l.result.then((r) => ({ from: 'voice' as const, ...r })), typedP.then((text) => ({ from: 'typed' as const, text, error: undefined }))]);
      setListening(false);
      l.cancel();
      listenRef.current = null;
      typedResolver.current = null;
      check(id);
      if (winner.from === 'voice' && winner.error && /not-allowed|service-not-allowed|audio-capture|network|could-not-start/.test(winner.error)) {
        modeRef.current = 'keyboard';
        setMode('keyboard');
        await tell(id, winner.error === 'network'
          ? 'Voice answers need an internet connection, which is not working. Please type your answers in the answer box instead, then press Enter.'
          : 'I cannot use the microphone. Please type your answers in the answer box instead, then press Enter.');
        return SWITCHED;
      }
      if (winner.text) { beep('heard'); setHeard(winner.text); }
      return winner.text;
    }
    const text = await typedP;
    typedResolver.current = null;
    check(id);
    return text;
  };

  const keyboardHint = (kind: 'score' | 'yesno' | 'free') =>
    modeRef.current === 'keyboard'
      ? kind === 'score' ? ' Type 0 to 4, or n for not sure, then press Enter.' : kind === 'yesno' ? ' Type y for yes, n for no, or ? for not sure, then press Enter.' : ' Type your answer and press Enter, or just press Enter to skip.'
      : '';

  /** Asks until a usable answer comes back. Handles repeat, explain, faster, slower, silence. */
  const ask = async (id: number, question: string, reader: (s: string) => Answer, kind: 'score' | 'yesno' | 'free', retry: string): Promise<Answer> => {
    let text = question + keyboardHint(kind);
    let silences = 0;
    for (;;) {
      await tell(id, text, true);
      const raw = await getAnswer(id);
      if (raw === SWITCHED) { text = question + keyboardHint(kind); continue; }
      const a = reader(raw);
      if (a.kind === 'silence') {
        if (kind === 'free' && modeRef.current === 'keyboard') return { kind: 'command', command: 'next' };
        silences++;
        if (silences >= 3) return { kind: 'command', command: 'pause' };
        text = `Sorry, I didn't hear anything. ${retry}${keyboardHint(kind)}`;
        continue;
      }
      silences = 0;
      if (a.kind === 'command') {
        if (a.command === 'repeat') { text = question + keyboardHint(kind); continue; }
        if (a.command === 'explain') { await tell(id, SCALE); text = retry + keyboardHint(kind); continue; }
        if (a.command === 'faster' || a.command === 'slower') { setRate(getRate() + (a.command === 'faster' ? 0.2 : -0.2)); await tell(id, `OK, ${a.command}.`); text = retry; continue; }
      }
      if (a.kind === 'text' && kind !== 'free') { text = `I heard: ${a.text}. ${retry}${keyboardHint(kind)}`; continue; }
      return a;
    }
  };

  const persist = (p: number) => {
    const prog: Progress = { ...(progRef.current as Progress), pos: p, mode: modeRef.current, data: dataRef.current };
    progRef.current = prog;
    saveProgress(prog);
  };

  // ---------- the script ----------
  const run = async (from: number) => {
    const id = ++runId.current;
    setPhase('running');
    let p = from;
    try {
      while (p < STEPS.length) {
        setPos(p);
        persist(p);
        const step = STEPS[p];
        const d = dataRef.current;
        if (step.kind === 'intro') {
          await tell(id,
            `Thank you for helping us. You just used ${toolName(d.condition)} to make a 3D model. ` +
            `Now I will read you ${N} short statements about that tool, one at a time. For each one, tell me how big a problem it was for you, from 0 to 4. ` +
            `0 means no problem, and 4 means a catastrophe that must be fixed first. If you are not sure, say not sure. ` +
            (modeRef.current === 'voice'
              ? 'Answer after the beep. You can say repeat, explain, go back, slower, faster, or pause at any time. Let\'s start.'
              : 'Type your answer in the answer box and press Enter. You can type r to repeat, e to explain the scale, or b to go back. Let\'s start.'));
          p++;
          continue;
        }
        if (step.kind === 'item') {
          const lead = step.part ? `Part ${step.part.k} of 5: ${step.part.title}. ` : '';
          const a = await ask(id, `${lead}Statement ${step.n} of ${N}. ${step.text} What would you rate it, 0 to 4?`, readScore, 'score', 'Please say a number from 0 to 4, or say not sure.');
          if (a.kind === 'command' && a.command === 'back') {
            if (step.n === 1) await tell(id, 'This is the first statement, so there is nothing to go back to.');
            else { p--; await tell(id, 'Going back.'); }
            continue;
          }
          if (a.kind === 'command' && a.command === 'pause') { await pause(id); return; }
          if (a.kind === 'na') {
            d.items[step.id] = { severity: null, unclear: true, comment: '' };
            await tell(id, 'Not sure. Noted.');
          } else if (a.kind === 'score') {
            d.items[step.id] = { severity: a.value, unclear: false, comment: d.items[step.id]?.comment ?? '' };
            if (a.value >= 2) {
              const c = await ask(id, `${a.value}, ${SHORT_LABELS[a.value]}. Would you like to say why? Go ahead, or say next.`, readFree, 'free', 'Tell me why, or say next.');
              if (c.kind === 'command' && c.command === 'pause') { persist(p); await pause(id); return; }
              if (c.kind === 'command' && c.command === 'back') { continue; }
              if (c.kind === 'text') { d.items[step.id].comment = c.text; await tell(id, 'Thank you.'); }
            } else {
              await tell(id, `${a.value}, ${SHORT_LABELS[a.value]}.`);
            }
          }
          p++;
          continue;
        }
        if (step.kind === 'verify') {
          const a = await ask(id, 'Two last questions. Did the final model match what you asked for? Say yes, no, or not sure.', readYesNo, 'yesno', 'Please say yes, no, or not sure.');
          if (a.kind === 'command' && a.command === 'back') { p--; continue; }
          if (a.kind === 'command' && a.command === 'pause') { await pause(id); return; }
          d.verification.answer = a.kind === 'yes' ? 'Correct' : a.kind === 'no' ? 'Incorrect' : 'Could not tell';
          p++;
          continue;
        }
        if (step.kind === 'reason') {
          const a = await ask(id, 'How did you decide? Tell me in your own words.', readFree, 'free', 'Tell me how you decided, or say next.');
          if (a.kind === 'command' && a.command === 'back') { p--; continue; }
          if (a.kind === 'command' && a.command === 'pause') { await pause(id); return; }
          d.verification.reason = a.kind === 'text' ? a.text : '';
          p++;
          continue;
        }
        if (step.kind === 'other') {
          let q = 'Was there any other problem that we did not ask about? Tell me about it, or say no.';
          for (;;) {
            const a = await ask(id, q, readFree, 'free', 'Tell me about the problem, or say no.');
            if (a.kind === 'command' && a.command === 'back') { p--; break; }
            if (a.kind === 'command' && a.command === 'pause') { await pause(id); return; }
            if (a.kind !== 'text') { p++; break; }
            const sev = await ask(id, 'How big a problem was that, from 0 to 4?', readScore, 'score', 'Please say a number from 0 to 4.');
            d.outside.push({ key: newId(), text: a.text, tag: 'Other', severity: sev.kind === 'score' ? sev.value : null });
            q = 'Got it. Anything else? Tell me, or say no.';
          }
          continue;
        }
      }
      // ---------- finished ----------
      const prog = progRef.current!;
      addCompleted({ id: prog.id, startedAt: prog.startedAt, finishedAt: new Date().toISOString(), mode: modeRef.current, data: dataRef.current });
      clearProgress();
      setSaved(null);
      setLastDone(dataRef.current);
      setPhase('done');
      queued.current = '';
      if (modeRef.current === 'voice') await tell(id, 'That is everything. Thank you very much! Your answers are saved. Please tell the researcher that you have finished.');
    } catch (e) {
      if (!(e instanceof Cancelled)) throw e;
    }
  };

  const pause = async (id: number) => {
    setPhase('paused');
    await tell(id, 'Paused. When you are ready, press Enter to continue.', true);
  };

  const stopEverything = () => {
    runId.current++;
    stopSpeaking();
    listenRef.current?.cancel();
    listenRef.current = null;
    setListening(false);
    typedResolver.current = null;
  };

  const begin = (m: Mode, resume?: Progress) => {
    stopEverything();
    modeRef.current = m;
    setMode(m);
    if (resume) {
      progRef.current = { ...resume, mode: m };
      dataRef.current = resume.data;
    } else {
      const fresh = freshData(setup);
      dataRef.current = fresh;
      progRef.current = { id: newId(), startedAt: new Date().toISOString(), pos: 0, mode: m, data: fresh };
    }
    if (m === 'voice' && canSpeak()) window.speechSynthesis.getVoices();
    void run(resume ? resume.pos : 0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pauseNow = () => { stopEverything(); setPhase('paused'); setPrompt('Paused. Press Enter or the Continue button to carry on.'); setLive('Paused. Press Enter or the Continue button to carry on.'); };
  const resume = () => { stopEverything(); void run(pos); requestAnimationFrame(() => inputRef.current?.focus()); };

  // Escape pauses at any time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'running') { e.preventDefault(); pauseNow(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => () => stopEverything(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === 'paused') { setTyped(''); resume(); return; }
    const r = typedResolver.current;
    if (r) { r(typed); setTyped(''); }
  };

  // ---------- screens ----------
  if (phase === 'start') {
    const voiceOk = canSpeak() && canListen();
    return (
      <>
        <h1 ref={h1} tabIndex={-1}>Rate the 3D design tool</h1>
        <p className="lead">
          This page will tell you about the tool you just used, read you {N} short statements about it, and ask what you would rate each one, from 0 to 4.
          You can answer by speaking or by typing. It takes about 10 minutes.
        </p>
        {saved && (
          <div className="resume">
            <p>An evaluation was stopped part-way, at {saved.pos <= 1 ? 'the start' : STEPS[saved.pos]?.kind === 'item' ? `statement ${(STEPS[saved.pos] as { n: number }).n} of ${N}` : 'the last questions'}.</p>
            <button type="button" className="big primary" onClick={() => begin(saved.mode, saved)}>Continue where it stopped</button>
          </div>
        )}
        <div className="start-buttons">
          <button type="button" className="big primary" onClick={() => begin('voice')} aria-describedby="voice-desc">
            Start: the page talks and listens
          </button>
          <p id="voice-desc" className="hint">
            The page reads everything aloud and you answer out loud after a beep. {voiceOk ? 'Headphones help, so the microphone does not hear your screen reader. If your screen reader is talking too, you can pause it (NVDA: Insert+S, VoiceOver: Control).' : 'Voice answers need Chrome, Edge or Safari; in this browser you can type your answers instead.'}
          </p>
          <button type="button" className="big" onClick={() => begin('keyboard')} aria-describedby="kb-desc">
            Start with my screen reader and keyboard
          </button>
          <p id="kb-desc" className="hint">Your screen reader reads each question. Type your answer and press Enter.</p>
        </div>

        <details className="researcher">
          <summary>For the researcher: participant and tool (optional)</summary>
          <p>Filled in once before handing over; remembered on this computer.</p>
          <div className="field">
            <label htmlFor="participant">Participant code</label>
            <input id="participant" type="text" value={setup.participant} onChange={(e) => updSetup({ participant: e.target.value })} autoComplete="off" />
          </div>
          <fieldset>
            <legend>Tool they used</legend>
            {[...CONDITIONS, ''].map((c) => (
              <div className="radio" key={c || 'none'}>
                <input type="radio" id={`tool-${c || 'none'}`} name="tool" checked={setup.tool === c} onChange={() => updSetup({ tool: c })} />
                <label htmlFor={`tool-${c || 'none'}`}>{c || 'Not set'}</label>
              </div>
            ))}
          </fieldset>
          <fieldset>
            <legend>Group</legend>
            {[...GROUPS, ''].map((g) => (
              <div className="radio" key={g || 'none'}>
                <input type="radio" id={`group-${g || 'none'}`} name="group" checked={setup.group === g} onChange={() => updSetup({ group: g })} />
                <label htmlFor={`group-${g || 'none'}`}>{g || 'Not set'}</label>
              </div>
            ))}
          </fieldset>
          <Results />
        </details>
      </>
    );
  }

  if (phase === 'done' && lastDone) {
    const rated = allItems.filter((i) => lastDone.items[i.id]?.severity !== null && lastDone.items[i.id]?.severity !== undefined).length;
    return (
      <>
        <h1 ref={h1} tabIndex={-1}>Thank you, you are finished</h1>
        <p className="lead">Your answers are saved on this computer. Please tell the researcher that you have finished.</p>
        <p>{rated} of {N} statements rated, {N - rated} marked not sure, {lastDone.outside.length} other problem{lastDone.outside.length === 1 ? '' : 's'} described.</p>
        <details className="researcher">
          <summary>For the researcher: results</summary>
          <Results />
          <button type="button" onClick={() => { setLastDone(null); setPhase('start'); }}>Back to the start page for the next person</button>
        </details>
      </>
    );
  }

  const step = STEPS[pos];
  const progress = step?.kind === 'item' ? `Statement ${step.n} of ${N}` : step?.kind === 'intro' ? 'Introduction' : 'Last questions';
  return (
    <>
      <h1 ref={h1} tabIndex={-1} className="visually-hidden">Rate the 3D design tool</h1>
      <p className="progress">{progress}</p>
      <div className="prompt">{prompt}</div>
      {mode === 'voice' && (
        <p className={`listening ${listening ? 'on' : ''}`} aria-hidden="true">
          {listening ? `● Listening… ${heard ? `“${heard}”` : ''}` : heard ? `Heard: “${heard}”` : 'Speaking…'}
        </p>
      )}
      <form onSubmit={submitTyped} className="answer-form">
        <label htmlFor="answer">{phase === 'paused' ? 'Paused. Press Enter to continue' : 'Your answer'}</label>
        <input id="answer" ref={inputRef} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        <button type="submit" className="primary">{phase === 'paused' ? 'Continue' : 'Answer'}</button>
      </form>
      {phase === 'running' && (
        <div className="controls">
          <button type="button" onClick={pauseNow}>Pause (Escape)</button>
        </div>
      )}
      {/* Keyboard mode: questions are announced to the screen reader. Voice mode: the page speaks itself. */}
      <div className="visually-hidden" aria-live={mode === 'keyboard' ? 'assertive' : 'off'} aria-atomic="true" id="live-region">{live}</div>
    </>
  );
}

function Results() {
  const all = listCompleted();
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = all.map((c) => ({ id: c.id, data: c.data }));
  return (
    <>
      <p>{all.length} finished evaluation{all.length === 1 ? '' : 's'} saved on this computer.</p>
      <div className="button-row">
        <button type="button" aria-disabled={!all.length} onClick={() => all.length && download(`ratings_${stamp}.csv`, itemsCsv(rows), 'text/csv')}>Download ratings (CSV)</button>
        <button type="button" aria-disabled={!all.length} onClick={() => all.length && download(`verification_and_other_problems_${stamp}.csv`, outsideCsv(rows), 'text/csv')}>Download verification and other problems (CSV)</button>
        <button type="button" aria-disabled={!all.length} onClick={() => all.length && download(`all_evaluations_${stamp}.json`, JSON.stringify(all, null, 2), 'application/json')}>Download everything (JSON)</button>
      </div>
      <p className="hint">Download after each session to be safe: clearing the browser's data deletes them.</p>
    </>
  );
}

