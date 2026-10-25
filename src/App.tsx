import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parse, type Intent } from './agent/parser';
import { run, type Reply } from './agent/agent';
import { describeModel, overview } from './model/describe';
import { modelBounds, sizeText, solids } from './model/geometry';
import { emptyModel, mm, type Model } from './model/types';
import { toScad } from './model/scad';
import { modelToSTL } from './mesh';
import { cue, playProfile } from './audio';
import { speak, speechInputSupported, startListening, stopSpeaking } from './speech';
import { findExample, EXAMPLES } from './examples';
import { findHelp, HELP } from './help';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';
import { loadProject, saveProject, type Msg, type Project } from './state';
import Preview, { VIEW_NAMES, type View } from './Preview';
import CommandBuilder from './CommandBuilder';
import { CodePanel, HelpPanel, HistoryPanel, ModelPanel, OutputsPanel, SectionHeading, SettingsPanel } from './Panels';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SECTIONS: [string, string][] = [
  ['conversation', 'Conversation'], ['model', 'Model'], ['preview', 'Visual preview'], ['history', 'Edit history'],
  ['code', 'OpenSCAD code'], ['outputs', 'Other outputs'], ['settings', 'Settings'], ['help', 'Help'],
];
const EDIT_TYPES = new Set<Intent['type']>(['add', 'hole', 'move', 'resize', 'delete', 'rename']);

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The text that is announced (and optionally spoken) for a reply, honouring the detail level. */
export function spokenText(m: Pick<Msg, 'text' | 'kind' | 'notes' | 'warnings' | 'details' | 'examples'>, detail: Settings['detail']): string {
  const parts: string[] = [];
  let text = m.text;
  if (detail === 'brief' && m.kind === 'change') text = text.replace(/\s*Overall size (?:is now|is unchanged|:)[\s\S]*$/, '');
  parts.push(m.kind === 'error' ? `Problem: ${text}` : text);
  for (const n of m.notes ?? []) parts.push(`Note: ${n}`);
  for (const w of m.warnings ?? []) parts.push(`Warning: ${w}`);
  if (m.kind !== 'change' || detail === 'detailed') parts.push(...(m.details ?? []));
  if (m.examples?.length) parts.push(`Examples: ${m.examples.join('; ')}.`);
  return parts.join(' ');
}

export default function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<{ state: 'idle' | 'working' | 'listening'; text: string }>({ state: 'idle', text: 'Ready' });
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const [view, setView] = useState<View>('iso');
  const [zoom, setZoom] = useState(1);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const cancelRef = useRef(false);
  const workingRef = useRef(false);
  const stopListenRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const focusReplyId = useRef<number | null>(null);
  const voiceSupported = useMemo(speechInputSupported, []);

  const model = project.steps[project.index].model;

  useEffect(() => saveProject(project), [project]);
  useEffect(() => saveSettings(settings), [settings]);

  const theme: 'light' | 'dark' | 'contrast' = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.fontSize = `${1.125 * settings.textSize}%`;
  }, [theme, settings.textSize]);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq?.addEventListener('change', fn);
    return () => mq?.removeEventListener('change', fn);
  }, []);

  // ---------- announcements ----------
  const announce = useCallback((text: string, urgent = false) => {
    const set = urgent ? setAssertive : setPolite;
    set('');
    setTimeout(() => set(text), 60);
    if (settingsRef.current.speakReplies) speak(text);
  }, []);

  const addMessages = useCallback((msgs: Omit<Msg, 'id'>[], patch?: Partial<Project>): number => {
    const p = projectRef.current;
    const withIds = msgs.map((m, i) => ({ ...m, id: p.nextMsgId + i }));
    const next = { ...p, ...patch, messages: [...p.messages, ...withIds], nextMsgId: p.nextMsgId + msgs.length };
    projectRef.current = next;
    setProject(next);
    return withIds[withIds.length - 1]?.id ?? -1;
  }, []);

  /** Posts an agent reply: adds it to the log, announces it, plays a cue and manages focus. */
  const reply = useCallback((m: Omit<Msg, 'id' | 'from'>, patch?: Partial<Project>, source?: Msg['source']) => {
    const msg = { ...m, from: 'agent' as const };
    const id = addMessages([msg], patch);
    announce(spokenText(msg, settingsRef.current.detail), m.kind === 'error');
    if (settingsRef.current.soundCues) cue(m.kind === 'error' ? 'error' : 'done');
    if (settingsRef.current.focusAfterReply === 'reply') focusReplyId.current = id;
    else if (source === 'typed' || source === 'voice') inputRef.current?.focus();
  }, [addMessages, announce]);

  useEffect(() => {
    if (focusReplyId.current === null) return;
    const el = document.getElementById(`msg-${focusReplyId.current}`);
    focusReplyId.current = null;
    el?.focus();
  }, [project.messages.length]);

  // Keep the newest message in view for sighted users.
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [project.messages.length]);

  // ---------- working simulation (H2.1 status, H3.4 interrupt) ----------
  const work = useCallback(async (labels: string[]) => {
    const pace = settingsRef.current.pace;
    workingRef.current = true;
    cancelRef.current = false;
    if (pace === 'realistic') {
      announce('Working on it.');
      if (settingsRef.current.soundCues) cue('start');
    }
    for (let i = 0; i < labels.length; i++) {
      setStatus({ state: 'working', text: `Working: ${labels[i]} (${i + 1} of ${labels.length})` });
      if (pace === 'realistic') await sleep(450);
      if (cancelRef.current) break;
    }
    workingRef.current = false;
    setStatus({ state: 'idle', text: cancelRef.current ? 'Stopped' : 'Ready' });
    return !cancelRef.current;
  }, [announce]);

  const stop = useCallback((source?: Msg['source']) => {
    if (stopListenRef.current) { stopListenRef.current(); stopListenRef.current = null; }
    stopSpeaking();
    if (workingRef.current) {
      cancelRef.current = true;
      if (settingsRef.current.soundCues) cue('stop');
      reply({ kind: 'info', text: 'Stopped. I did not change the model.' }, undefined, source);
      return true;
    }
    return false;
  }, [reply]);

  // ---------- history helpers ----------
  const commit = (p: Project, next: Model, label: string, command: string, touched?: number | null): Partial<Project> => ({
    steps: [...p.steps.slice(0, p.index + 1), { model: next, label, command }],
    index: p.index + 1,
    lastTouched: touched === undefined ? p.lastTouched : touched,
  });
  const sizeNow = (m: Model) => (solids(m).length ? `The model is now ${sizeText(modelBounds(m))}.` : 'The model is now empty.');

  // ---------- main pipeline ----------
  const handle = useCallback(async (raw: string, source: Msg['source'] = 'typed') => {
    const text = raw.trim();
    if (!text) { announce('The command box is empty. Type a command first, for example: add a box 40 by 30 by 10.', true); return; }
    const parsedFirst = parse(text, []);
    if (parsedFirst.intent.type === 'stop') {
      addMessages([{ from: 'user', text, source }]);
      if (!stop(source)) reply({ kind: 'info', text: 'Nothing is running right now.' }, undefined, source);
      return;
    }
    addMessages([{ from: 'user', text, source }]);
    if (workingRef.current) { reply({ kind: 'error', text: 'I am still working on your last request. Say stop, press Escape, or use the Stop button to cancel it.' }, undefined, source); return; }
    const p0 = projectRef.current;
    const m0 = p0.steps[p0.index].model;
    const parsed = parse(text, m0.parts.map((x) => x.name).filter(Boolean));
    let intent = parsed.intent;
    if (intent.type === 'delete' && intent.target?.kind === 'all') intent = { type: 'new' };
    const S = settingsRef.current;

    switch (intent.type) {
      case 'undo':
      case 'redo': {
        const n = intent.type === 'undo' ? -Math.min(intent.times, p0.index) : Math.min(intent.times, p0.steps.length - 1 - p0.index);
        if (n === 0) { reply({ kind: 'error', text: intent.type === 'undo' ? 'There is nothing to undo.' : 'There is nothing to redo.' }, undefined, source); return; }
        if (!(await work(['Going through the history']))) return;
        const p = projectRef.current;
        const target = p.index + n;
        const labels = n < 0 ? p.steps.slice(target + 1, p.index + 1).map((s) => s.label).reverse() : p.steps.slice(p.index + 1, target + 1).map((s) => s.label);
        const m = p.steps[target].model;
        reply({ kind: 'change', text: `${intent.type === 'undo' ? 'Undid' : 'Redid'} ${labels.length === 1 ? 'one step' : `${labels.length} steps`}: ${labels.join('; ')}. You are now at step ${target}. ${sizeNow(m)}` }, { index: target, lastTouched: (solids(m).slice(-1)[0]?.id ?? null) }, source);
        return;
      }
      case 'revert': {
        if (intent.step < 0 || intent.step >= p0.steps.length) { reply({ kind: 'error', text: `There is no step ${intent.step}. The history has steps 0 to ${p0.steps.length - 1}.` }, undefined, source); return; }
        if (intent.step === p0.index) { reply({ kind: 'info', text: `You are already at step ${intent.step}.` }, undefined, source); return; }
        if (!(await work(['Going through the history']))) return;
        const m = p0.steps[intent.step].model;
        reply({ kind: 'change', text: `Went to step ${intent.step}: ${p0.steps[intent.step].label}. ${sizeNow(m)}`, notes: intent.step < p0.index ? ['Later steps are kept and can be redone, until you make a new change.'] : [] }, { index: intent.step, lastTouched: (solids(m).slice(-1)[0]?.id ?? null) }, source);
        return;
      }
      case 'history': {
        reply({ kind: 'info', text: `The history has ${p0.steps.length - 1} change${p0.steps.length === 2 ? '' : 's'}; you are at step ${p0.index}.`, details: p0.steps.map((s, i) => `Step ${i}: ${s.label}${i === p0.index ? ' (current)' : i > p0.index ? ' (undone)' : ''}.`) }, undefined, source);
        return;
      }
      case 'help': {
        const t = findHelp(intent.topic);
        if (t) reply({ kind: 'help', text: `${t.title}. ${t.text.join(' ')}`, examples: t.examples }, undefined, source);
        else reply({ kind: 'help', text: `${intent.topic ? `I have no help on "${intent.topic}". ` : ''}Help topics: ${HELP.map((h) => h.title).join(', ')}. Say "help" and a topic, for example "help holes". The Help section at the end of the page has everything.`, examples: ['add a box 40 by 30 by 10', 'describe the model', 'undo'] }, undefined, source);
        return;
      }
      case 'repeat': {
        const last = [...p0.messages].reverse().find((m) => m.from === 'agent');
        if (last) announce(spokenText(last, S.detail)); else announce('There is nothing to repeat yet.');
        return;
      }
      case 'confirm':
      case 'deny':
        reply({ kind: 'info', text: 'There is nothing waiting for a yes or no right now.' }, undefined, source);
        return;
      case 'detail': {
        const level = intent.level;
        setSettings((s) => ({ ...s, detail: level }));
        settingsRef.current = { ...settingsRef.current, detail: level };
        reply({ kind: 'info', text: level === 'brief' ? 'OK, I will keep replies brief. Say "more detail" to change that.' : level === 'detailed' ? 'OK, I will give detailed replies, including a full description after each change.' : 'OK, standard detail.' }, undefined, source);
        return;
      }
      case 'export': {
        if (intent.format !== 'scad' && !solids(m0).length) { reply({ kind: 'error', text: 'The model is empty, so there is nothing to export yet.' }, undefined, source); return; }
        if (intent.format === 'stl') { const buf = modelToSTL(m0); if (buf) download('model.stl', buf, 'model/stl'); reply({ kind: 'info', text: 'Downloaded model.stl, a file for 3D printing. Check your downloads folder.' }, undefined, source); }
        else if (intent.format === 'scad') { download('model.scad', toScad(m0), 'text/plain'); reply({ kind: 'info', text: 'Downloaded model.scad, the OpenSCAD code. Check your downloads folder.' }, undefined, source); }
        else { download('model-description.txt', describeModel(m0, 'detailed').join('\n'), 'text/plain'); reply({ kind: 'info', text: 'Downloaded model-description.txt, the full text description. Check your downloads folder.' }, undefined, source); }
        return;
      }
      case 'listen': {
        if (!solids(m0).length) { reply({ kind: 'error', text: 'The model is empty, so there is nothing to play.' }, undefined, source); return; }
        reply({ kind: 'info', text: 'Playing the height profile from left to right in a moment: higher pitch means taller, silence means a gap. A click marks the start and the end.' }, undefined, source);
        setTimeout(() => playProfile(m0), S.speakReplies ? 6500 : 3500);
        return;
      }
      case 'new': {
        if (!m0.parts.length) { reply({ kind: 'info', text: 'The model is already empty.' }, undefined, source); return; }
        if (!(await work(['Clearing the model']))) return;
        reply({ kind: 'change', text: 'Started a new, empty model.', notes: ['The old model is still in the edit history: say undo to get it back.'] }, commit(projectRef.current, emptyModel(), 'Start a new model', text, null), source);
        return;
      }
      case 'example': {
        const ex = findExample(intent.name);
        if (!ex) { reply({ kind: 'info', text: `${intent.name ? `I don't have an example called "${intent.name}". ` : ''}Examples: ${EXAMPLES.map((e) => `${e.title}: ${e.description}`).join(' ')}`, examples: EXAMPLES.map((e) => `load the ${e.id} example`) }, undefined, source); return; }
        if (!(await work(ex.commands.map((c, i) => `step ${i + 1} of ${ex.commands.length}: ${c}`)))) return;
        const p = projectRef.current;
        let m = emptyModel();
        let last: number | null = null;
        const steps = [...p.steps.slice(0, p.index + 1)];
        if (m0.parts.length) steps.push({ model: m, label: 'Start a new model', command: text });
        for (const c of ex.commands) {
          const pr = parse(c, m.parts.map((x) => x.name).filter(Boolean));
          const r = run(pr.intent, { model: m, lastTouched: last, detail: 'standard' }, pr.notes);
          if (r.model) { m = r.model; last = r.touched ?? last; steps.push({ model: m, label: r.historyLabel ?? c, command: c }); }
        }
        reply({
          kind: 'change',
          text: `Loaded the ${ex.title} example. ${ex.description} It took ${ex.commands.length} steps, which are in the edit history. ${overview(m)}`,
          details: describeModel(m, 'standard').slice(1),
          notes: m0.parts.length ? ['Your previous model is still in the edit history.'] : [],
        }, { steps, index: steps.length - 1, lastTouched: last }, source);
        return;
      }
    }

    // Model edits and questions are handled by the agent.
    if (EDIT_TYPES.has(intent.type) && !(await work(['Reading your request', 'Updating the model', 'Checking the result']))) return;
    const cur = projectRef.current;
    const ctx = { model: cur.steps[cur.index].model, lastTouched: cur.lastTouched, detail: settingsRef.current.detail };
    const r: Reply = run(intent, ctx, parsed.notes);
    const msg = { kind: r.kind, text: r.text, notes: r.notes, warnings: r.warnings, details: r.details };
    if (r.model) reply(msg, commit(cur, r.model, r.historyLabel ?? text, text, r.touched), source);
    else reply(msg, r.touched !== undefined ? { lastTouched: r.touched } : undefined, source);
  }, [addMessages, announce, reply, stop, work]);

  const send = (cmd: string, source: Msg['source']) => { void handle(cmd, source); };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (workingRef.current || stopListenRef.current)) { e.preventDefault(); stop(); return; }
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stop]);

  // ---------- voice ----------
  const toggleListen = () => {
    if (!voiceSupported) { announce('Voice input is not available in this browser. It works in Chrome, Edge and Safari. You can type commands instead.', true); return; }
    if (stopListenRef.current) { stopListenRef.current(); return; }
    if (settings.soundCues) cue('listen');
    setStatus({ state: 'listening', text: 'Listening… say one command, then pause' });
    announce('Listening.');
    try {
      stopListenRef.current = startListening({
        onInterim: (t) => setInput(t),
        onFinal: (t) => {
          if (settingsRef.current.autoSendVoice) { setInput(''); void handle(t, 'voice'); }
          else { setInput(t); announce(`Heard: ${t}. Press Enter to send, or edit it first.`); inputRef.current?.focus(); }
        },
        onError: (msg) => announce(msg, true),
        onEnd: () => { stopListenRef.current = null; setStatus((s) => (s.state === 'listening' ? { state: 'idle', text: 'Ready' } : s)); },
      });
    } catch {
      stopListenRef.current = null;
      setStatus({ state: 'idle', text: 'Ready' });
      announce('Voice input could not start.', true);
    }
  };

  // ---------- settings ----------
  const setSetting = <K extends keyof Settings>(k: K, v: Settings[K], label: string) => {
    setSettings((s) => ({ ...s, [k]: v }));
    settingsRef.current = { ...settingsRef.current, [k]: v };
    announce(`Saved. ${label}.`);
  };

  const putInBox = (cmd: string) => {
    setInput(cmd);
    inputRef.current?.focus();
    announce(`Put in the command box: ${cmd}. Press Enter to send.`);
  };

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(`${id}-title`);
    el?.focus();
    el?.scrollIntoView({ block: 'start' });
  };

  const working = status.state === 'working';
  const listening = status.state === 'listening';
  const code = useMemo(() => toScad(model), [model]);
  const S = solids(model);
  const empty = !S.length;
  const b = modelBounds(model);

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <h1>3D Design Agent <span className="tag">demo</span></h1>
          <p className="status-line">
            <span className={`status-dot ${status.state}`} aria-hidden="true" />
            <span><strong>Agent:</strong> {status.text}</span>
            <span className="sep" aria-hidden="true">|</span>
            <span><strong>Model:</strong> {empty || !b ? 'empty' : `${S.length} part${S.length === 1 ? '' : 's'}, ${mm(b.maxX - b.minX)} by ${mm(b.maxY - b.minY)} by ${mm(b.maxZ - b.minZ)} mm`}</span>
            <span className="sep" aria-hidden="true">|</span>
            <span><strong>Step:</strong> {project.index}</span>
          </p>
        </div>
        <nav aria-label="Jump to section" className="jump">
          <ul>
            {SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`} onClick={jump(id)}>{label}</a></li>)}
          </ul>
        </nav>
      </header>

      <main>
        <div className="col col-left">
          <section id="conversation" aria-labelledby="conversation-title" className="panel">
            <SectionHeading id="conversation-title">Conversation</SectionHeading>
            <ol className="log" ref={logRef} aria-label="Messages, oldest first" tabIndex={0}>
              {project.messages.map((m) => (
                <li key={m.id} id={`msg-${m.id}`} tabIndex={-1} className={`msg ${m.from} ${m.kind ?? ''}`}>
                  <p className="who">{m.from === 'user' ? (m.source === 'voice' ? 'You said:' : 'You:') : m.kind === 'error' ? 'Agent, problem:' : 'Agent:'}</p>
                  <p>{m.text}</p>
                  {m.notes && m.notes.length > 0 && <ul className="notes">{m.notes.map((n, i) => <li key={i}><strong>Note:</strong> {n}</li>)}</ul>}
                  {m.warnings && m.warnings.length > 0 && <ul className="warnings">{m.warnings.map((n, i) => <li key={i}><strong>Warning:</strong> {n}</li>)}</ul>}
                  {m.details && m.details.length > 0 && <ul className="details">{m.details.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                  {m.examples && m.examples.length > 0 && (
                    <ul className="examples">
                      {m.examples.map((e) => (
                        <li key={e}><code>{e}</code> <button type="button" className="small" onClick={() => putInBox(e)} aria-label={`Put "${e}" in command box`}>Put in command box</button></li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>

            <form className="command" onSubmit={(e) => { e.preventDefault(); const t = input; setInput(''); send(t, 'typed'); }}>
              <label htmlFor="command-input">Command</label>
              <p id="command-hint" className="hint">For example: add a box 40 by 30 by 10. Press Enter to send. Press slash (/) anywhere to come back here.</p>
              <div className="command-row">
                <input
                  id="command-input"
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  aria-describedby="command-hint"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="send"
                />
                <button type="submit" className="primary">Send</button>
              </div>
              <div className="button-row">
                <button type="button" onClick={toggleListen} aria-pressed={listening} aria-describedby={voiceSupported ? undefined : 'voice-unavailable'}>
                  {listening ? 'Stop listening' : 'Speak a command'}
                </button>
                <button type="button" onClick={() => { if (!stop('button')) announce('Nothing is running right now.'); }} aria-disabled={!working} className={working ? 'danger' : undefined}>
                  Stop agent (Escape)
                </button>
              </div>
              {!voiceSupported && <p id="voice-unavailable" className="hint">Voice input is not available in this browser (it works in Chrome, Edge and Safari).</p>}
            </form>

            <div role="group" aria-labelledby="quick-title" className="quick">
              <h3 id="quick-title">Quick commands</h3>
              <div className="button-row">
                {[['Describe the model', 'describe the model'], ['List parts', 'list parts'], ['Check for problems', 'check for problems'], ['Undo', 'undo'], ['Help', 'help']].map(([l, c]) => (
                  <button type="button" key={c} onClick={() => send(c, 'button')}>{l}</button>
                ))}
                <button type="button" onClick={() => send('repeat', 'button')}>Repeat last reply</button>
              </div>
            </div>

            <CommandBuilder model={model} onPut={putInBox} onSend={(c) => send(c, 'builder')} />
          </section>
        </div>

        <div className="col col-right">
          <section id="model" aria-labelledby="model-title" className="panel">
            <SectionHeading id="model-title">Model</SectionHeading>
            <ModelPanel model={model} />
          </section>

          <section id="preview" aria-labelledby="preview-title" className="panel">
            <SectionHeading id="preview-title">Visual preview</SectionHeading>
            <div className="button-row" role="group" aria-label="View">
              {(Object.keys(VIEW_NAMES) as View[]).map((v) => (
                <button type="button" key={v} aria-pressed={view === v} onClick={() => { setView(v); announce(`${VIEW_NAMES[v]} view.`); }}>{VIEW_NAMES[v]}</button>
              ))}
            </div>
            <div className="button-row" role="group" aria-label="Zoom">
              <button type="button" onClick={() => { const z = Math.min(4, zoom * 1.4); setZoom(z); announce(`Zoom ${Math.round(z * 100)}%.`); }}>Zoom in</button>
              <button type="button" onClick={() => { const z = Math.max(0.4, zoom / 1.4); setZoom(z); announce(`Zoom ${Math.round(z * 100)}%.`); }}>Zoom out</button>
              <button type="button" onClick={() => { setZoom(1); announce('Zoom reset to 100%.'); }}>Reset zoom</button>
            </div>
            <Preview model={model} view={view} zoom={zoom} showLabels={settings.previewLabels} theme={theme} />
          </section>

          <section id="history" aria-labelledby="history-title" className="panel">
            <SectionHeading id="history-title">Edit history</SectionHeading>
            <HistoryPanel steps={project.steps} index={project.index} onUndo={() => send('undo', 'button')} onRedo={() => send('redo', 'button')} onRevert={(i) => send(`go back to step ${i}`, 'button')} />
          </section>

          <section id="code" aria-labelledby="code-title" className="panel">
            <SectionHeading id="code-title">OpenSCAD code</SectionHeading>
            <CodePanel
              code={code}
              onCopy={() => { void navigator.clipboard?.writeText(code).then(() => announce('Code copied to the clipboard.'), () => announce('Could not copy. Select the text in the code box and copy it instead.', true)); }}
              onDownload={() => send('download the code', 'button')}
            />
          </section>

          <section id="outputs" aria-labelledby="outputs-title" className="panel">
            <SectionHeading id="outputs-title">Other outputs</SectionHeading>
            <OutputsPanel empty={empty} onListen={() => send('listen to the shape', 'button')} onSTL={() => send('export stl', 'button')} onText={() => send('download the description', 'button')} onScad={() => send('download the code', 'button')} />
          </section>
        </div>

        <section id="settings" aria-labelledby="settings-title" className="panel wide">
          <SectionHeading id="settings-title">Settings</SectionHeading>
          <SettingsPanel settings={settings} set={setSetting} voiceSupported={voiceSupported} onReset={() => { setSettings({ ...DEFAULT_SETTINGS }); settingsRef.current = { ...DEFAULT_SETTINGS }; announce('All settings reset.'); }} />
        </section>

        <section id="help" aria-labelledby="help-title" className="panel wide">
          <SectionHeading id="help-title">Help</SectionHeading>
          <HelpPanel onTry={putInBox} />
        </section>
      </main>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true" id="announcer">{polite}</div>
      <div className="visually-hidden" aria-live="assertive" aria-atomic="true" id="alerts">{assertive}</div>
    </>
  );
}
