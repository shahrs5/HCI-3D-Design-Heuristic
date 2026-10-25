// Operator console: create sessions, follow progress live, take notes, record measurements, export.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { ADMIN_EMAILS, firebaseConfigured, signInWithGoogle, signOutUser, watchAuth } from './firebase';
import { useAnnounce } from './Announcer';
import { ErrorSummary, type FieldError } from './ErrorSummary';
import { RadioGroup, TextField, errFor } from './Steps';
import {
  CONDITIONS, GROUPS, LIMITS, SEVERITY_LABELS, STATUS_TEXT, checklist, emptyPrivate, fmtDuration, fmtTime, fromSession,
  type Measurement, type PrivateDoc, type SessionDoc,
} from './types';
import {
  createSession, deleteSession, getPrivate, listAll, savePrivate, unlockSession, updateSessionAsOperator, watchAllSessions, watchSession,
} from './session';
import { download, fullJson, itemsCsv, measurementsCsv, notesCsv, outsideCsv, sessionsCsv, type FullRecord } from './csv';
import { navigate } from './nav';

const LAST_TASK_KEY = 'hci-console-last-task';
const newKey = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const statusText = (s: SessionDoc) => (s.schemaVersion === 3 ? STATUS_TEXT[s.status] : 'Old format (before the operator console)');
const participantUrl = (code: string) => `${window.location.origin}/s/${code}`;

// ---------- sign-in gate ----------
function useAdminUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!firebaseConfigured) { setReady(true); return; }
    return watchAuth((u) => { setUser(u); setReady(true); });
  }, []);
  const allowed = !!user && !user.isAnonymous && ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());
  return { user, ready, allowed };
}

function Gate({ title, children }: { title: string; children: (user: User) => React.ReactNode }) {
  const announce = useAnnounce();
  const { user, ready, allowed } = useAdminUser();
  const [error, setError] = useState('');
  useEffect(() => { document.title = `${title} – Operator console`; }, [title]);
  const signIn = async () => {
    setError('');
    try { await signInWithGoogle(); announce('Signed in.'); }
    catch (e) { setError(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`); }
  };
  return (
    <>
      <p className="console-bar">
        <span>Operator console</span>
        {user && !user.isAnonymous && (
          <span>
            {user.email}{' '}
            <button type="button" className="small" onClick={() => signOutUser().then(() => announce('Signed out.'))}>Sign out</button>
          </span>
        )}
      </p>
      {!firebaseConfigured && <p className="field-error"><strong>Error:</strong> Firebase is not configured.</p>}
      {error && <p className="field-error" role="alert"><strong>Error:</strong> {error}</p>}
      {ready && firebaseConfigured && (!user || user.isAnonymous) && (
        <>
          <h1 tabIndex={-1}>{title}</h1>
          <p>This page is for the researcher running the session. Sign in with an approved Google account.</p>
          <p>If you are a participant, <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>go to the participant page</a> instead.</p>
          <button type="button" className="primary" onClick={signIn}>Sign in with Google</button>
        </>
      )}
      {user && !user.isAnonymous && !allowed && (
        <>
          <h1 tabIndex={-1}>{title}</h1>
          <p className="field-error"><strong>Error:</strong> {user.email} is not on the operator list.</p>
        </>
      )}
      {allowed && user && children(user)}
    </>
  );
}

// ---------- sessions page ----------
export function ConsoleHome() {
  return <Gate title="Sessions">{() => <Home />}</Gate>;
}

function Home() {
  const announce = useAnnounce();
  const [rows, setRows] = useState<{ code: string; data: SessionDoc }[] | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => watchAllSessions(setRows, (e) => setLoadError(e.message)), []);

  const exportAll = async (kind: 'sessions' | 'items' | 'outside' | 'notes' | 'measurements' | 'json') => {
    announce('Preparing the download.');
    try {
      const all = await listAll();
      const full: FullRecord[] = await Promise.all(all.map(async (r) => ({ code: r.code, session: r.data, priv: r.data.schemaVersion === 3 ? await getPrivate(r.code) : emptyPrivate() })));
      const done = full.filter((r) => r.session.status === 'submitted' || r.session.schemaVersion === 2).map((r) => ({ id: r.code, data: fromSession(r.session) }));
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === 'sessions') download(`sessions_${stamp}.csv`, sessionsCsv(full), 'text/csv');
      if (kind === 'items') download(`items_${stamp}.csv`, itemsCsv(done), 'text/csv');
      if (kind === 'outside') download(`outside_verification_${stamp}.csv`, outsideCsv(done), 'text/csv');
      if (kind === 'notes') download(`notes_${stamp}.csv`, notesCsv(full), 'text/csv');
      if (kind === 'measurements') download(`measurements_${stamp}.csv`, measurementsCsv(full), 'text/csv');
      if (kind === 'json') download(`all_data_${stamp}.json`, fullJson(full), 'application/json');
      announce('Download ready.');
    } catch (e) {
      announce(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <>
      <h1 tabIndex={-1}>Sessions</h1>
      <NewSession />
      <h2>All sessions</h2>
      {loadError && <p className="field-error"><strong>Error:</strong> {loadError}</p>}
      {!rows ? <p>Loading…</p> : rows.length === 0 ? <p>No sessions yet.</p> : (
        <div className="table-wrap" role="region" aria-label="Sessions table" tabIndex={0}>
          <table>
            <caption>{rows.length} sessions, newest first. Updates live.</caption>
            <thead>
              <tr>
                <th scope="col">Code</th><th scope="col">Auditor</th><th scope="col">Group</th><th scope="col">Condition</th>
                <th scope="col">Status</th><th scope="col">Task time</th><th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ code, data: s }) => (
                <tr key={code}>
                  <th scope="row"><a href={`/console/${code}`} onClick={(e) => { e.preventDefault(); navigate(`/console/${code}`); }} className="mono">{code}</a></th>
                  <td>{s.auditor}</td>
                  <td>{s.group}</td>
                  <td>{s.condition}</td>
                  <td>{statusText(s)}</td>
                  <td>{s.taskStartedAt && s.taskEndedAt ? fmtDuration(s.taskEndedAt.toMillis() - s.taskStartedAt.toMillis()) : ''}</td>
                  <td>{s.createdAt ? s.createdAt.toDate().toLocaleString() : s.submittedAt ? s.submittedAt.toDate().toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Export all data</h2>
      <p>Item and outside-problem files include submitted sessions only. Notes, measurements and transcripts are never shown to participants.</p>
      <div className="button-row">
        <button type="button" onClick={() => exportAll('sessions')}>Sessions CSV (timing, status, verdicts)</button>
        <button type="button" onClick={() => exportAll('items')}>Items CSV (20 ratings per session)</button>
        <button type="button" onClick={() => exportAll('outside')}>Outside-problems and verification CSV</button>
        <button type="button" onClick={() => exportAll('notes')}>Notes CSV</button>
        <button type="button" onClick={() => exportAll('measurements')}>Measurements CSV</button>
        <button type="button" onClick={() => exportAll('json')}>Everything (JSON, includes transcripts)</button>
      </div>
    </>
  );
}

interface SessionFields { auditor: string; group: string; condition: string; screenReader: string; task: string }
function validateFields(f: SessionFields): FieldError[] {
  const e: FieldError[] = [];
  if (!f.auditor.trim()) e.push({ id: 'auditor', message: 'Enter an auditor code, for example P1' });
  if (!f.group) e.push({ id: 'group-0', message: 'Choose a group' });
  if (!f.condition) e.push({ id: 'condition-0', message: 'Choose a condition' });
  return e;
}

function SessionFieldsForm({ f, set, errors, idPrefix = '' }: { f: SessionFields; set: (p: Partial<SessionFields>) => void; errors: FieldError[]; idPrefix?: string }) {
  return (
    <>
      <TextField id={`${idPrefix}auditor`} label="Auditor code" hint="Not a name. For example P1." value={f.auditor} maxLength={LIMITS.short} onChange={(v) => set({ auditor: v })} error={errFor(errors, `${idPrefix}auditor`)} />
      <RadioGroup name={`${idPrefix}group`} legend="Group" options={GROUPS.map((g) => ({ value: g, label: g }))} value={f.group} onChange={(v) => set({ group: v })} error={errFor(errors, `${idPrefix}group-0`)} />
      <RadioGroup name={`${idPrefix}condition`} legend="Condition" options={CONDITIONS.map((g) => ({ value: g, label: g }))} value={f.condition} onChange={(v) => set({ condition: v })} error={errFor(errors, `${idPrefix}condition-0`)} />
      <TextField id={`${idPrefix}screenReader`} label="Screen reader and browser (optional)" hint="For example NVDA 2025.1 with Firefox." value={f.screenReader} maxLength={LIMITS.screenReader} onChange={(v) => set({ screenReader: v })} />
      <TextField id={`${idPrefix}task`} label="Task the participant will see" hint="Shown on the participant's first page. Remembered for the next session." value={f.task} maxLength={4000} multiline onChange={(v) => set({ task: v })} />
    </>
  );
}

function NewSession() {
  const announce = useAnnounce();
  const [f, setF] = useState<SessionFields>(() => {
    let task = '';
    try { task = localStorage.getItem(LAST_TASK_KEY) ?? ''; } catch { /* ignore */ }
    return { auditor: '', group: '', condition: '', screenReader: '', task };
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const summary = useRef<HTMLDivElement>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateFields(f);
    setErrors(errs);
    if (errs.length) { announce(`${errs.length} problems. ${errs.map((x) => x.message).join('. ')}.`); requestAnimationFrame(() => summary.current?.focus()); return; }
    setBusy(true); setError('');
    try {
      try { localStorage.setItem(LAST_TASK_KEY, f.task); } catch { /* ignore */ }
      const code = await createSession({ auditor: f.auditor.trim(), group: f.group, condition: f.condition, screenReader: f.screenReader.trim(), task: f.task.trim() });
      announce(`Session ${code.split('').join(' ')} created.`);
      navigate(`/console/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };
  return (
    <details className="new-session" open>
      <summary>New session</summary>
      <ErrorSummary ref={summary} errors={errors} />
      <form noValidate onSubmit={submit}>
        <SessionFieldsForm f={f} set={(p) => setF((x) => ({ ...x, ...p }))} errors={errors} />
        {error && <p className="field-error" role="alert"><strong>Error:</strong> {error}</p>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create session'}</button>
      </form>
    </details>
  );
}

// ---------- single session page ----------
export function ConsoleSession({ code }: { code: string }) {
  return <Gate title={`Session ${code}`}>{() => <SessionPage code={code} />}</Gate>;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function SessionPage({ code }: { code: string }) {
  const announce = useAnnounce();
  const [s, setS] = useState<SessionDoc | null | undefined>(undefined);
  const [priv, setPriv] = useState<PrivateDoc | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [err, setErr] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const prevStatus = useRef<string | null>(null);
  const now = useNow();

  useEffect(() => watchSession(code, setS, (e) => setErr(e.message)), [code]);
  useEffect(() => { getPrivate(code).then(setPriv, (e) => setErr(e.message)); }, [code]);

  // Tell the operator when the participant moves on (they may be looking elsewhere).
  useEffect(() => {
    if (!s) return;
    if (prevStatus.current && prevStatus.current !== s.status) announce(`Participant update: ${STATUS_TEXT[s.status]}.`);
    prevStatus.current = s.status;
  }, [s?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Local-first editing with a debounced save; the operator is the only writer of this document. */
  const change = (patch: Partial<PrivateDoc>, immediate = false) => {
    setPriv((p) => {
      const next = { ...(p ?? emptyPrivate()), ...patch };
      window.clearTimeout(timer.current);
      setSaveState('saving');
      timer.current = window.setTimeout(() => {
        savePrivate(code, next).then(() => setSaveState('saved'), (e) => { setSaveState('error'); setErr(`Could not save: ${e.message}`); });
      }, immediate ? 0 : 800);
      return next;
    });
  };

  const started = s?.taskStartedAt?.toMillis();
  const ended = s?.taskEndedAt?.toMillis();
  const elapsedAt = (t: number) => (started && t >= started ? fmtDuration(t - started) : started ? 'before the task' : 'before the task');

  if (s === undefined || !priv) return <><h1 tabIndex={-1}>Session {code}</h1><p>Loading…</p>{err && <p className="field-error"><strong>Error:</strong> {err}</p>}</>;
  if (s === null) return <><h1 tabIndex={-1}>Session {code}</h1><p>This session does not exist (it may have been deleted).</p><BackLink /></>;

  const legacy = s.schemaVersion !== 3;
  return (
    <>
      <BackLink />
      <h1 tabIndex={-1}>Session <span className="mono">{code}</span>: {s.auditor}</h1>
      <p>{s.group}. {s.condition}.{s.screenReader ? ` ${s.screenReader}.` : ''}</p>
      <p className="save-state" aria-live="off"><strong>Notes and measurements:</strong> {saveState === 'saved' ? 'all changes saved' : saveState === 'saving' ? 'saving…' : 'not saved – check the connection'}</p>
      {err && <p className="field-error" role="alert"><strong>Error:</strong> {err}</p>}

      <nav aria-label="On this page" className="jump">
        <ul>
          {[['link', 'Participant link'], ['progress', 'Progress'], ['recording', 'Recording'], ['notes', 'Notes'], ['transcript', 'Transcript'], ['model', 'Final model'], ['answers', 'Participant answers'], ['manage', 'Manage']].map(([id, l]) => (
            <li key={id}><a href={`#${id}`}>{l}</a></li>
          ))}
        </ul>
      </nav>

      {!legacy && (
        <section id="link" aria-labelledby="link-title" className="panel">
          <h2 id="link-title">Participant link</h2>
          <p>Session code: <strong className="code-big mono" aria-label={code.split('').join(' ')}>{code}</strong></p>
          <p>Link: <a href={participantUrl(code)} target="_blank" rel="noreferrer" className="mono">{participantUrl(code)}</a></p>
          <div className="button-row">
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(participantUrl(code)).then(() => announce('Link copied.'), () => announce('Could not copy. Select the link text instead.')); }}>Copy link</button>
          </div>
          <p className="hint">Or ask them to open {window.location.host} and type the code. Open the link on the participant's computer, not this one, so your notes stay off their screen reader.</p>
        </section>
      )}

      <section id="progress" aria-labelledby="progress-title" className="panel">
        <h2 id="progress-title">Progress (live)</h2>
        <p className="status-big"><strong>{statusText(s)}</strong></p>
        <dl className="summary two-col">
          <div><dt>Joined</dt><dd>{fmtTime(s.joinedAt) || 'not yet'}</dd></div>
          <div><dt>Task started</dt><dd>{fmtTime(s.taskStartedAt) || 'not yet'}</dd></div>
          <div><dt>Task finished</dt><dd>{fmtTime(s.taskEndedAt) || 'not yet'}</dd></div>
          <div><dt>Task time</dt><dd>{started ? fmtDuration((ended ?? now) - started) + (ended ? '' : ' so far') : ''}</dd></div>
          <div><dt>Submitted</dt><dd>{fmtTime(s.submittedAt) || 'not yet'}</dd></div>
        </dl>
      </section>

      <section id="recording" aria-labelledby="recording-title" className="panel">
        <h2 id="recording-title">Recording</h2>
        <p>Mark when you start and stop your recording (for example OBS or a phone), so the recording can be lined up with the task times.</p>
        <div className="button-row">
          <button type="button" onClick={() => { change({ marks: [...priv.marks, { at: Date.now(), kind: 'recording_started' }] }, true); announce('Recording start marked.'); }}>Mark recording started</button>
          <button type="button" onClick={() => { change({ marks: [...priv.marks, { at: Date.now(), kind: 'recording_stopped' }] }, true); announce('Recording stop marked.'); }}>Mark recording stopped</button>
        </div>
        {priv.marks.length > 0 && (
          <ul>{priv.marks.map((m, i) => <li key={i}>{m.kind === 'recording_started' ? 'Recording started' : 'Recording stopped'} at {fmtTime(m.at)} ({elapsedAt(m.at)})</li>)}</ul>
        )}
      </section>

      <Notes priv={priv} change={change} elapsedAt={elapsedAt} />

      <section id="transcript" aria-labelledby="transcript-title" className="panel">
        <h2 id="transcript-title">AI chat transcript</h2>
        <TextField id="transcript-text" label="Paste the full ChatGPT or Claude conversation" hint="Saved automatically." value={priv.transcript} maxLength={200000} multiline onChange={(v) => change({ transcript: v })} />
        <p className="hint">{priv.transcript.length.toLocaleString()} characters.</p>
      </section>

      <FinalModel priv={priv} change={change} />

      <section id="answers" aria-labelledby="answers-title" className="panel">
        <h2 id="answers-title">Participant answers</h2>
        {s.status === 'submitted' || legacy ? <Answers s={s} /> : <p>Not submitted yet. Answers appear here when the participant submits.</p>}
      </section>

      <Manage code={code} s={s} priv={priv} />
    </>
  );
}

function BackLink() {
  return <p><a href="/console" onClick={(e) => { e.preventDefault(); navigate('/console'); }}>← All sessions</a></p>;
}

function Notes({ priv, change, elapsedAt }: { priv: PrivateDoc; change: (p: Partial<PrivateDoc>, immediate?: boolean) => void; elapsedAt: (t: number) => string }) {
  const announce = useAnnounce();
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) { announce('Type a note first.'); return; }
    change({ notes: [...priv.notes, { at: Date.now(), text: text.trim() }] }, true);
    setText('');
    announce('Note added.');
  };
  return (
    <section id="notes" aria-labelledby="notes-title" className="panel">
      <h2 id="notes-title">Notes</h2>
      <p>Each note is stamped with the time and how far into the task it was taken. Press Control and Enter to add.</p>
      <label htmlFor="note-text">New note</label>
      <textarea id="note-text" rows={3} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); } }} />
      <div className="button-row"><button type="button" className="primary" onClick={add}>Add note</button></div>
      {priv.notes.length === 0 ? <p>No notes yet.</p> : (
        <ol className="notes-list" reversed>
          {[...priv.notes].map((n, i) => ({ n, i })).reverse().map(({ n, i }) => (
            <li key={n.at + '-' + i}>
              <p><strong>{fmtTime(n.at)}</strong> ({elapsedAt(n.at)}): {n.text}</p>
              <button type="button" className="small" onClick={() => { if (window.confirm('Delete this note?')) { change({ notes: priv.notes.filter((_, j) => j !== i) }, true); announce('Note deleted.'); } }}>
                Delete note from {fmtTime(n.at)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FinalModel({ priv, change }: { priv: PrivateDoc; change: (p: Partial<PrivateDoc>, immediate?: boolean) => void }) {
  const announce = useAnnounce();
  const setRow = (key: string, patch: Partial<Measurement>) => change({ measurements: priv.measurements.map((m) => (m.key === key ? { ...m, ...patch } : m)) });
  return (
    <section id="model" aria-labelledby="model-title" className="panel">
      <h2 id="model-title">Final model</h2>
      <p>After the session, open the final model and record what you measure against what the task asked for.</p>
      <h3>Measurements</h3>
      {priv.measurements.length === 0 && <p>No measurements yet.</p>}
      {priv.measurements.map((m, n) => (
        <fieldset key={m.key} className="measure">
          <legend>Measurement {n + 1}{m.what ? `: ${m.what}` : ''}</legend>
          <div className="measure-fields">
            <TextField id={`m-${m.key}-what`} label="What" hint="For example: overall width, hole diameter" value={m.what} maxLength={200} onChange={(v) => setRow(m.key, { what: v })} />
            <TextField id={`m-${m.key}-expected`} label="Expected" value={m.expected} maxLength={100} onChange={(v) => setRow(m.key, { expected: v })} />
            <TextField id={`m-${m.key}-measured`} label="Measured" value={m.measured} maxLength={100} onChange={(v) => setRow(m.key, { measured: v })} />
            <TextField id={`m-${m.key}-unit`} label="Unit" value={m.unit} maxLength={20} onChange={(v) => setRow(m.key, { unit: v })} />
            <div className="field">
              <label htmlFor={`m-${m.key}-matches`}>Matches?</label>
              <select id={`m-${m.key}-matches`} value={m.matches} onChange={(e) => setRow(m.key, { matches: e.target.value as Measurement['matches'] })}>
                <option value="">Not decided</option><option>Yes</option><option>Partly</option><option>No</option>
              </select>
            </div>
          </div>
          <button type="button" className="small" onClick={() => { change({ measurements: priv.measurements.filter((x) => x.key !== m.key) }, true); announce(`Measurement ${n + 1} removed.`); requestAnimationFrame(() => document.getElementById('add-measure')?.focus()); }}>
            Remove measurement {n + 1}
          </button>
        </fieldset>
      ))}
      <button type="button" id="add-measure" onClick={() => {
        const key = newKey();
        change({ measurements: [...priv.measurements, { key, what: '', expected: '', measured: '', unit: 'mm', matches: '' }] }, true);
        announce(`Measurement ${priv.measurements.length + 1} added.`);
        requestAnimationFrame(() => document.getElementById(`m-${key}-what`)?.focus());
      }}>Add measurement</button>

      <RadioGroup name="verdict" legend="Your verdict: does the final model match the task?" options={['Correct', 'Partly correct', 'Incorrect'].map((v) => ({ value: v, label: v }))}
        value={priv.verdict} onChange={(v) => change({ verdict: v as PrivateDoc['verdict'] }, true)} />
      <TextField id="final-code" label="Final OpenSCAD code (optional)" value={priv.finalCode} maxLength={100000} multiline onChange={(v) => change({ finalCode: v })} />
      <TextField id="summary" label="Overall observations" value={priv.summary} maxLength={10000} multiline onChange={(v) => change({ summary: v })} />
    </section>
  );
}

function Answers({ s }: { s: SessionDoc }) {
  const d = useMemo(() => fromSession(s), [s]);
  const sev = (id: string) => { const a = d.items[id]; return a.unclear ? 'Unclear / N/A' : a.severity === null ? '' : `${a.severity}: ${SEVERITY_LABELS[a.severity]}`; };
  return (
    <>
      <dl className="summary">
        <div><dt>Did the final model match what they asked for?</dt><dd>{d.verification.answer}</dd></div>
        <div><dt>How did they decide?</dt><dd>{d.verification.reason || 'No answer'}</dd></div>
      </dl>
      <div className="table-wrap" role="region" aria-label="Ratings table" tabIndex={0}>
        <table>
          <caption>Ratings for the 20 checklist items</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Severity</th><th scope="col">Comment</th></tr></thead>
          <tbody>
            {checklist.flatMap((c) => c.items).map((i) => (
              <tr key={i.id}><th scope="row">{i.id}: {i.text}</th><td>{sev(i.id)}</td><td>{d.items[i.id].comment}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Problems outside the checklist</h3>
      {d.outside.length === 0 ? <p>None.</p> : <ol>{d.outside.map((o) => <li key={o.key}>{o.text} (Tag: {o.tag}. Severity: {o.severity}.)</li>)}</ol>}
    </>
  );
}

function Manage({ code, s, priv }: { code: string; s: SessionDoc; priv: PrivateDoc }) {
  const announce = useAnnounce();
  const [edit, setEdit] = useState<SessionFields>({ auditor: s.auditor, group: s.group, condition: s.condition, screenReader: s.screenReader ?? '', task: s.task ?? '' });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const legacy = s.schemaVersion !== 3;
  const rec: FullRecord[] = [{ code, session: s, priv }];
  const done = s.status === 'submitted' || legacy ? [{ id: code, data: fromSession(s) }] : [];
  return (
    <section id="manage" aria-labelledby="manage-title" className="panel">
      <h2 id="manage-title">Manage</h2>
      <h3>Download this session</h3>
      <div className="button-row">
        <button type="button" onClick={() => download(`session_${code}.json`, fullJson(rec), 'application/json')}>Everything (JSON)</button>
        <button type="button" onClick={() => download(`items_${code}.csv`, itemsCsv(done), 'text/csv')} aria-disabled={!done.length}>Items CSV</button>
        <button type="button" onClick={() => download(`notes_${code}.csv`, notesCsv(rec), 'text/csv')}>Notes CSV</button>
      </div>
      {!legacy && (
        <>
          <h3>Participant device</h3>
          <p>{s.participantUid ? 'The session is locked to the browser that opened it.' : 'No browser has opened the session yet.'} If the participant needs to switch computer or browser, unlock it; their answers in progress stay in the old browser.</p>
          <button type="button" aria-disabled={!s.participantUid || s.status === 'submitted'} onClick={() => {
            if (!s.participantUid || s.status === 'submitted') { announce('Nothing to unlock.'); return; }
            void unlockSession(code, s).then(() => announce('Unlocked. The participant can now open the link in another browser.'), (e) => announce(`Could not unlock: ${e.message}`));
          }}>Unlock for another browser</button>

          <details>
            <summary>Edit session details</summary>
            <form noValidate onSubmit={(e) => {
              e.preventDefault();
              const errs = validateFields(edit).map((x) => ({ ...x, id: `edit-${x.id}` }));
              setErrors(errs);
              if (errs.length) { announce(errs.map((x) => x.message).join('. ')); return; }
              void updateSessionAsOperator(code, { auditor: edit.auditor.trim(), group: edit.group, condition: edit.condition, screenReader: edit.screenReader.trim(), task: edit.task.trim() })
                .then(() => announce('Session details saved. The participant sees the new task text straight away.'), (e2) => announce(`Could not save: ${e2.message}`));
            }}>
              <SessionFieldsForm f={edit} set={(p) => setEdit((x) => ({ ...x, ...p }))} errors={errors} idPrefix="edit-" />
              <button type="submit">Save details</button>
            </form>
          </details>
        </>
      )}
      <h3>Delete</h3>
      <p>Deletes the session, the participant's answers, your notes, measurements and transcript. This cannot be undone.</p>
      <button type="button" className="danger" onClick={() => {
        if (window.prompt(`Type the session code ${code} to delete it permanently.`)?.toUpperCase().trim() !== code) { announce('Not deleted.'); return; }
        void deleteSession(code).then(() => { announce('Session deleted.'); navigate('/console'); }, (e) => announce(`Could not delete: ${e.message}`));
      }}>Delete this session</button>
    </section>
  );
}
