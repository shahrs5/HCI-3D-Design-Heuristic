import { useEffect, useRef, useState } from 'react';
import { checklist, fmtDuration, fmtTime, isAnswered, toResponses, type AuditData, type ItemAnswer, type OutsideIssue, type SessionDoc } from './types';
import { clear, load, save } from './storage';
import { firebaseConfigured } from './firebase';
import { finishTask, joinSession, startTask, submitResponses, watchSession, type JoinResult } from './session';
import { useAnnounce } from './Announcer';
import { ErrorSummary, type FieldError } from './ErrorSummary';
import { HeuristicStep, OutsideStep, ReviewStep, VerifyStep, domId } from './Steps';
import { navigate } from './nav';

const STEP_TITLES = [
  'Your task',
  'Doing the task',
  'Verification question',
  ...checklist.map((c) => `${c.heuristic} ${c.title}`),
  'Problems outside the checklist',
  'Review and submit',
];
const TOTAL = STEP_TITLES.length;
const WELCOME = 0, DOING = 1, VERIFY = 2, FIRST_H = 3;
const OUTSIDE = FIRST_H + checklist.length;
const REVIEW = OUTSIDE + 1;
const newKey = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function validate(step: number, d: AuditData): FieldError[] {
  const e: FieldError[] = [];
  if (step >= FIRST_H && step < OUTSIDE) {
    for (const item of checklist[step - FIRST_H].items)
      if (!isAnswered(d.items[item.id])) e.push({ id: `sev-${domId(item.id)}-0`, message: `Choose a severity or Unclear / N/A for ${item.id}` });
  } else if (step === OUTSIDE) {
    d.outside.forEach((o, n) => {
      if (!o.text.trim()) e.push({ id: `issue-${o.key}-text`, message: `Describe problem ${n + 1}, or remove it` });
      if (!o.tag) e.push({ id: `issue-${o.key}-tag`, message: `Choose a tag for problem ${n + 1}` });
      if (o.severity === null) e.push({ id: `issue-${o.key}-sev-0`, message: `Choose a severity for problem ${n + 1}` });
    });
  } else if (step === VERIFY) {
    if (!d.verification.answer) e.push({ id: 'verify-0', message: 'Choose whether the final model matched what you asked for' });
  }
  return e;
}

export default function Participant({ code }: { code: string }) {
  const announce = useAnnounce();
  const initial = useRef(load(code));
  const [join, setJoin] = useState<JoinResult | null>(null);
  const [session, setSession] = useState<SessionDoc | null | undefined>(undefined);
  const [step, setStep] = useState(initial.current.step);
  const [data, setData] = useState<AuditData>(initial.current.data);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const h1 = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const lastFocusKey = useRef<string>('');
  const prevTask = useRef<string | null>(null);

  // Join (claims the session for this browser) and then watch it live.
  useEffect(() => {
    if (!firebaseConfigured) { setJoin({ ok: false, reason: 'error', message: 'The app is not connected to the database.' }); return; }
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const r = await joinSession(code);
      if (cancelled) return;
      setJoin(r);
      if (r.ok) unsub = watchSession(code, setSession, (e) => setJoin({ ok: false, reason: 'error', message: e.message }));
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [code]);

  useEffect(() => { if (session?.status !== 'submitted') save(code, { step, data }); }, [code, step, data, session?.status]);

  // Keep the step consistent with what the server knows.
  useEffect(() => {
    if (!session) return;
    if (session.status === 'submitted') { clear(code); return; }
    if (session.taskEndedAt && step < VERIFY) setStep(VERIFY);
    else if (session.taskStartedAt && !session.taskEndedAt && step === WELCOME) setStep(DOING);
    else if (!session.taskStartedAt && step > WELCOME) setStep(WELCOME);
    if (prevTask.current !== null && prevTask.current !== session.task) announce('The researcher updated the task text.');
    prevTask.current = session.task;
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitted = session?.status === 'submitted';
  const title = !join ? 'Opening the session' : !join.ok ? 'This session cannot be opened' : session === undefined ? 'Opening the session' : session === null ? 'Session not found' : submitted ? 'Thank you, you are done' : STEP_TITLES[step];
  const stepLabel = join?.ok && session && !submitted ? `Step ${step + 1} of ${TOTAL}` : '';

  // Move focus to the heading and announce on every screen change.
  useEffect(() => {
    document.title = `${stepLabel ? stepLabel + ': ' : ''}${title} – Accessibility audit`;
    const k = `${title}|${stepLabel}`;
    if (lastFocusKey.current === '') { lastFocusKey.current = k; return; }
    if (lastFocusKey.current === k) return;
    lastFocusKey.current = k;
    h1.current?.focus();
    announce(stepLabel ? `${stepLabel}: ${title}` : title);
  }, [title, stepLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<AuditData>) => setData((d) => ({ ...d, ...patch }));
  const setItem = (id: string, patch: Partial<ItemAnswer>) =>
    setData((d) => ({ ...d, items: { ...d.items, [id]: { ...(d.items[id] ?? { severity: null, unclear: false, comment: '' }), ...patch } } }));
  const setIssue = (key: string, patch: Partial<OutsideIssue>) =>
    setData((d) => ({ ...d, outside: d.outside.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));

  const goto = (s: number) => { setErrors([]); setActionError(''); setStep(s); window.scrollTo(0, 0); };

  const showErrors = (e: FieldError[]) => {
    setErrors(e);
    announce(`${e.length === 1 ? 'There is 1 problem' : `There are ${e.length} problems`} on this page. ${e.map((x) => x.message).join('. ')}.`);
    requestAnimationFrame(() => summary.current?.focus());
  };

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true); setActionError('');
    try { await fn(); if (okMsg) announce(okMsg); return true; }
    catch (e) {
      const msg = `That did not work: ${e instanceof Error ? e.message : String(e)} Your answers are still saved in this browser. Try again, or ask the researcher.`;
      setActionError(msg); announce(msg);
      return false;
    } finally { setBusy(false); }
  };

  const next = async () => {
    if (step === WELCOME) {
      if (session?.taskStartedAt) { goto(DOING); return; }
      if (await act(() => startTask(code))) goto(DOING);
      return;
    }
    if (step === DOING) {
      if (!window.confirm('Have you finished the task? After this you cannot go back to it.')) return;
      if (await act(() => finishTask(code))) goto(VERIFY);
      return;
    }
    if (step === REVIEW) {
      for (let s = VERIFY; s < REVIEW; s++) {
        const e = validate(s, data);
        if (e.length) { announce(`${STEP_TITLES[s]} has unanswered questions. Going there now.`); goto(s); setErrors(e); return; }
      }
      announce('Submitting, please wait.');
      await act(() => submitResponses(code, toResponses(data)));
      return;
    }
    const e = validate(step, data);
    if (e.length) { showErrors(e); return; }
    goto(step + 1);
  };

  // ---------- render ----------
  let body: React.ReactNode;
  if (!join || (join.ok && session === undefined)) {
    body = <p>Connecting…</p>;
  } else if (!join.ok) {
    body = (
      <>
        {join.reason === 'not-found' && <p>There is no session with the code <strong className="mono">{code}</strong>. Check the code with the researcher.</p>}
        {join.reason === 'locked' && <p>Session <strong className="mono">{code}</strong> is already open in another browser or on another computer. Ask the researcher to unlock it, then choose Try again.</p>}
        {join.reason === 'legacy' && <p>Code <strong className="mono">{code}</strong> belongs to an older version of this study and cannot be opened here.</p>}
        {join.reason === 'error' && <p className="field-error"><strong>Error:</strong> {join.message}</p>}
        <div className="button-row">
          <button type="button" className="primary" onClick={() => window.location.reload()}>Try again</button>
          <button type="button" onClick={() => navigate('/')}>Enter a different code</button>
        </div>
      </>
    );
  } else if (session === null) {
    body = (
      <>
        <p>There is no session with the code <strong className="mono">{code}</strong>. It may have been deleted. Check the code with the researcher.</p>
        <button type="button" onClick={() => navigate('/')}>Enter a different code</button>
      </>
    );
  } else if (submitted) {
    body = (
      <>
        <p className="success">Your answers have been saved. Please tell the researcher that you have finished.</p>
        <p>You can close this page now.</p>
      </>
    );
  } else if (step === WELCOME) {
    body = (
      <>
        <p>Welcome, and thank you for taking part. Session code <strong className="mono">{code}</strong>.</p>
        <h2>What happens</h2>
        <ol>
          <li>Read the task below. When you are ready, choose <strong>Start the task</strong>.</li>
          <li>Do the task in your other window, using {session!.condition.replace(/^[AB]: /, '')}. Nobody will type for you.</li>
          <li>Come back to this page and choose <strong>I have finished the task</strong>.</li>
          <li>Answer one question about the result, then rate 20 statements about the tool, in 5 short pages.</li>
          <li>Check your answers and submit.</li>
        </ol>
        <p>This page talks to you through your screen reader; the researcher will not read anything out. Your answers are saved as you go, so you can safely reload the page.</p>
        <TaskBox task={session!.task} />
      </>
    );
  } else if (step === DOING) {
    body = <Doing session={session!} announce={announce} />;
  } else if (step === VERIFY) {
    body = <VerifyStep data={data} update={update} errors={errors} />;
  } else if (step < OUTSIDE) {
    body = <HeuristicStep key={step} cat={checklist[step - FIRST_H]} data={data} setItem={setItem} errors={errors} />;
  } else if (step === OUTSIDE) {
    body = (
      <OutsideStep
        data={data}
        errors={errors}
        setIssue={setIssue}
        add={() => {
          const key = newKey();
          setData((d) => ({ ...d, outside: [...d.outside, { key, text: '', tag: '', severity: null }] }));
          announce(`Problem ${data.outside.length + 1} added.`);
          requestAnimationFrame(() => document.getElementById(`issue-${key}-text`)?.focus());
        }}
        remove={(key, n) => {
          setData((d) => ({ ...d, outside: d.outside.filter((o) => o.key !== key) }));
          setErrors([]);
          announce(`Problem ${n} removed. ${data.outside.length - 1} remaining.`);
          requestAnimationFrame(() => document.getElementById('add-issue')?.focus());
        }}
      />
    );
  } else {
    body = <ReviewStep data={data} goto={goto} firstH={FIRST_H} outside={OUTSIDE} verify={VERIFY} />;
  }

  const showNav = join?.ok && session && !submitted;
  const primaryLabel = step === WELCOME ? (session?.taskStartedAt ? 'Continue' : 'Start the task') : step === DOING ? 'I have finished the task' : step === REVIEW ? (busy ? 'Submitting…' : 'Submit') : 'Next';
  const canGoBack = step === DOING || step > VERIFY;

  return (
    <>
      {stepLabel && <p className="progress">{stepLabel}</p>}
      <h1 ref={h1} tabIndex={-1}>{title}</h1>
      <ErrorSummary ref={summary} errors={errors} />
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (showNav && !busy) void next(); }}>
        {body}
        {showNav && (
          <>
            {actionError && <p className="field-error" role="alert"><strong>Error:</strong> {actionError}</p>}
            <div className="nav-row">
              {canGoBack && <button type="button" onClick={() => goto(step - 1)}>Back</button>}
              <button type="submit" className="primary" disabled={busy} aria-disabled={busy}>{primaryLabel}</button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

function TaskBox({ task }: { task: string }) {
  return (
    <section className="task" aria-labelledby="task-title">
      <h2 id="task-title">The task</h2>
      {task.trim() ? task.split(/\n+/).map((p, i) => <p key={i}>{p}</p>) : <p>The researcher will tell you the task.</p>}
    </section>
  );
}

function Doing({ session, announce }: { session: SessionDoc; announce: (m: string) => void }) {
  const started = session.taskStartedAt?.toMillis();
  return (
    <>
      <p>You started the task at {fmtTime(session.taskStartedAt)}.</p>
      <p>
        Work in your other window now. Take as long as you need. When you have finished, come back to this page and choose
        <strong> I have finished the task</strong> at the end of the page.
      </p>
      <TaskBox task={session.task} />
      <h2>Time</h2>
      <p>The time is not read out automatically, so it does not interrupt you.</p>
      <button type="button" onClick={() => announce(started ? `You have been working for ${fmtDuration(Date.now() - started)}.` : 'The start time is not available yet.')}>
        How long have I been working?
      </button>
    </>
  );
}
