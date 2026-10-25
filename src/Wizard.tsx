import { useEffect, useRef, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  CONDITIONS, GROUPS, GUIDING_QUESTIONS, LIMITS, SEVERITY_LABELS, TAGS, VERIFICATION_ANSWERS,
  checklist, isAnswered, type AuditData, type ItemAnswer, type OutsideIssue,
} from './types';
import { clear, load, save } from './storage';
import { db, ensureAnonymousUser, firebaseConfigured } from './firebase';
import { useAnnounce } from './Announcer';
import { ErrorSummary, InlineError, type FieldError } from './ErrorSummary';
import { download, itemsCsv, outsideCsv } from './csv';

const STEP_TITLES = [
  'Session setup',
  ...checklist.map((c) => `${c.heuristic} ${c.title}`),
  'Issues outside the framework',
  'Verification question',
  'Review and submit',
];
const TOTAL = STEP_TITLES.length;
const FIRST_H = 1;
const OUTSIDE = FIRST_H + checklist.length;
const VERIFY = OUTSIDE + 1;
const REVIEW = VERIFY + 1;

const domId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');
const newKey = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Payload stored in Firestore (must match firestore.rules). */
function toPayload(d: AuditData, uid: string) {
  const items: Record<string, ItemAnswer> = {};
  for (const c of checklist)
    for (const i of c.items) {
      const a = d.items[i.id];
      items[i.id] = { severity: a?.unclear ? null : a?.severity ?? null, unclear: !!a?.unclear, comment: a?.comment ?? '' };
    }
  return {
    schemaVersion: 1,
    uid,
    auditor: d.auditor.trim(),
    group: d.group,
    condition: d.condition,
    screenReader: d.screenReader.trim(),
    items,
    outside: d.outside.map((o) => ({ text: o.text.trim(), tag: o.tag, severity: o.severity })),
    verification: { answer: d.verification.answer, reason: d.verification.reason.trim() },
    submittedAt: serverTimestamp(),
  };
}

function validate(step: number, d: AuditData): FieldError[] {
  const e: FieldError[] = [];
  if (step === 0) {
    if (!d.auditor.trim()) e.push({ id: 'auditor', message: 'Enter an auditor code, for example P1' });
    if (!d.group) e.push({ id: 'group-0', message: 'Choose a group' });
    if (!d.condition) e.push({ id: 'condition-0', message: 'Choose a condition' });
    if (!d.screenReader.trim()) e.push({ id: 'screenReader', message: 'Enter the screen reader used' });
  } else if (step >= FIRST_H && step < OUTSIDE) {
    for (const item of checklist[step - FIRST_H].items)
      if (!isAnswered(d.items[item.id]))
        e.push({ id: `sev-${domId(item.id)}-0`, message: `Choose a severity or Unclear / N/A for ${item.id}` });
  } else if (step === OUTSIDE) {
    d.outside.forEach((o, n) => {
      if (!o.text.trim()) e.push({ id: `issue-${o.key}-text`, message: `Describe issue ${n + 1}, or remove it` });
      if (!o.tag) e.push({ id: `issue-${o.key}-tag`, message: `Choose a tag for issue ${n + 1}` });
      if (o.severity === null) e.push({ id: `issue-${o.key}-sev-0`, message: `Choose a severity for issue ${n + 1}` });
    });
  } else if (step === VERIFY) {
    if (!d.verification.answer) e.push({ id: 'verify-0', message: 'Choose whether the final model matched what you asked for' });
  }
  return e;
}

export default function Wizard() {
  const announce = useAnnounce();
  const initial = useRef(load());
  const [step, setStep] = useState(initial.current.step);
  const [data, setData] = useState<AuditData>(initial.current.data);
  const [submittedId, setSubmittedId] = useState<string | null>(initial.current.submittedId);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const h1 = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => save({ step, data, submittedId }), [step, data, submittedId]);

  const title = submittedId ? 'Session submitted' : STEP_TITLES[step];
  const stepLabel = submittedId ? '' : `Step ${step + 1} of ${TOTAL}`;

  useEffect(() => {
    document.title = `${stepLabel ? stepLabel + ': ' : ''}${title} – Accessibility heuristic audit`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    h1.current?.focus();
    announce(stepLabel ? `${stepLabel}: ${title}` : title);
  }, [step, submittedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<AuditData>) => setData((d) => ({ ...d, ...patch }));
  const setItem = (id: string, patch: Partial<ItemAnswer>) =>
    setData((d) => {
      const prev = d.items[id] ?? { severity: null, unclear: false, comment: '' };
      return { ...d, items: { ...d.items, [id]: { ...prev, ...patch } } };
    });
  const setIssue = (key: string, patch: Partial<OutsideIssue>) =>
    setData((d) => ({ ...d, outside: d.outside.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));

  const goto = (s: number) => {
    setErrors([]);
    setSubmitError('');
    setStep(s);
    window.scrollTo(0, 0);
  };

  const next = () => {
    const e = validate(step, data);
    setErrors(e);
    if (e.length) {
      announce(`${e.length === 1 ? 'There is 1 problem' : `There are ${e.length} problems`} on this page. ${e.map((x) => x.message).join('. ')}.`);
      // Wait for the summary to render, then move focus to it.
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    goto(step + 1);
  };

  const submit = async () => {
    for (let s = 0; s < REVIEW; s++) {
      if (validate(s, data).length) {
        announce(`${STEP_TITLES[s]} has unanswered questions. Going there now.`);
        goto(s);
        setErrors(validate(s, data));
        return;
      }
    }
    if (!firebaseConfigured) {
      setSubmitError('The app is not connected to the database. Download the JSON file and send it to the research team.');
      announce('Submission failed. The app is not connected to the database.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    announce('Submitting, please wait.');
    try {
      const user = await ensureAnonymousUser();
      const ref = doc(collection(db(), 'sessions'));
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('The server did not respond within 20 seconds. Check your connection.')), 20000));
      await Promise.race([setDoc(ref, toPayload(data, user.uid)), timeout]);
      setSubmittedId(ref.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(`Submission failed: ${msg} Your answers are still saved in this browser. Try again, or download the JSON file.`);
      announce('Submission failed. See the error message above the Submit button.');
    } finally {
      setSubmitting(false);
    }
  };

  const startNew = () => {
    if (!window.confirm('Start a new session? This clears all answers stored in this browser.')) return;
    clear();
    setData({ auditor: '', group: '', condition: '', screenReader: '', items: {}, outside: [], verification: { answer: '', reason: '' } });
    setSubmittedId(null);
    setErrors([]);
    setStep(0);
    if (step === 0) {
      h1.current?.focus();
      announce(`Answers cleared. Step 1 of ${TOTAL}: ${STEP_TITLES[0]}`);
    }
  };

  const sessionLabel = submittedId ?? 'unsubmitted';
  const fileBase = `audit_${data.auditor.trim() || 'auditor'}_${sessionLabel}`.replace(/[^A-Za-z0-9_-]/g, '_');
  const downloads = (
    <div className="button-row">
      <button type="button" onClick={() => download(`${fileBase}_items.csv`, itemsCsv([{ id: sessionLabel, data }]), 'text/csv')}>
        Download items CSV
      </button>
      <button type="button" onClick={() => download(`${fileBase}_outside_verification.csv`, outsideCsv([{ id: sessionLabel, data }]), 'text/csv')}>
        Download outside-framework and verification CSV
      </button>
      <button type="button" onClick={() => download(`${fileBase}.json`, JSON.stringify({ session_id: sessionLabel, ...data }, null, 2), 'application/json')}>
        Download JSON
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (submittedId) {
    body = (
      <>
        <p className="success">
          Thank you. Your answers were saved. Session ID: <strong className="mono">{submittedId}</strong>
        </p>
        <h2>Download a copy</h2>
        {downloads}
        <h2>Next auditor</h2>
        <p>Starting a new session clears this session's answers from this browser. The submitted copy stays in the database.</p>
        <button type="button" onClick={startNew}>Start new session</button>
      </>
    );
  } else if (step === 0) {
    body = <SetupStep data={data} update={update} errors={errors} />;
  } else if (step < OUTSIDE) {
    body = <HeuristicStep cat={checklist[step - FIRST_H]} data={data} setItem={setItem} errors={errors} />;
  } else if (step === OUTSIDE) {
    body = (
      <OutsideStep
        data={data}
        errors={errors}
        setIssue={setIssue}
        add={() => {
          const key = newKey();
          setData((d) => ({ ...d, outside: [...d.outside, { key, text: '', tag: '', severity: null }] }));
          announce(`Issue ${data.outside.length + 1} added.`);
          requestAnimationFrame(() => document.getElementById(`issue-${key}-text`)?.focus());
        }}
        remove={(key, n) => {
          setData((d) => ({ ...d, outside: d.outside.filter((o) => o.key !== key) }));
          setErrors([]);
          announce(`Issue ${n} removed. ${data.outside.length - 1} issues remain.`);
          requestAnimationFrame(() => document.getElementById('add-issue')?.focus());
        }}
      />
    );
  } else if (step === VERIFY) {
    body = <VerifyStep data={data} update={update} errors={errors} />;
  } else {
    body = <ReviewStep data={data} goto={goto} />;
  }

  return (
    <>
      {stepLabel && <p className="progress">{stepLabel}</p>}
      <h1 ref={h1} tabIndex={-1}>{title}</h1>
      <ErrorSummary ref={summary} errors={errors} />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (submittedId) return;
          if (step === REVIEW) void submit();
          else next();
        }}
      >
        {body}
        {!submittedId && (
          <>
            {step === REVIEW && (
              <>
                {submitError && (
                  <p className="field-error" id="submit-error">
                    <strong>Error:</strong> {submitError}
                  </p>
                )}
                <h2>Backup copy</h2>
                <p>Optional: download your answers before submitting.</p>
                {downloads}
              </>
            )}
            <div className="nav-row">
              {step > 0 && (
                <button type="button" onClick={() => goto(step - 1)}>
                  Back
                </button>
              )}
              <button type="submit" className="primary" disabled={submitting} aria-disabled={submitting}>
                {step === REVIEW ? (submitting ? 'Submitting…' : 'Submit') : 'Next'}
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

type Errs = { errors: FieldError[] };
const errFor = (errors: FieldError[], id: string) => errors.find((e) => e.id === id)?.message;

function RadioGroup(props: {
  name: string;
  legend: React.ReactNode;
  options: { value: string; label: string; separate?: boolean }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  legendClass?: string;
}) {
  const { name, legend, options, value, onChange, error, hint, legendClass } = props;
  const errId = `${name}-error`;
  const hintId = `${name}-hint`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset className={error ? 'has-error' : undefined} aria-describedby={describedBy}>
      <legend className={legendClass}>{legend}</legend>
      {hint && <p id={hintId} className="hint">{hint}</p>}
      <InlineError id={errId} message={error} />
      <div className="radios">
        {options.map((o, i) => (
          <div className={`radio${o.separate ? ' separate' : ''}`} key={o.value}>
            <input
              type="radio"
              id={`${name}-${i}`}
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <label htmlFor={`${name}-${i}`}>{o.label}</label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function TextField(props: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string;
  hint?: string; maxLength: number; multiline?: boolean; autoComplete?: string;
}) {
  const { id, label, value, onChange, error, hint, maxLength, multiline } = props;
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id, value, maxLength, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
  };
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
      <InlineError id={`${id}-error`} message={error} />
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" autoComplete={props.autoComplete ?? 'off'} spellCheck={false} {...common} />}
    </div>
  );
}

const severityOptions = SEVERITY_LABELS.map((l, i) => ({ value: String(i), label: `${i}: ${l}` }));

function SetupStep({ data, update, errors }: { data: AuditData; update: (p: Partial<AuditData>) => void } & Errs) {
  return (
    <>
      <p>Do not enter your name or any other personal information.</p>
      <TextField
        id="auditor"
        label="Auditor code"
        hint="The code you were given, for example P1."
        value={data.auditor}
        maxLength={LIMITS.short}
        onChange={(v) => update({ auditor: v })}
        error={errFor(errors, 'auditor')}
      />
      <RadioGroup
        name="group"
        legend="Group"
        options={GROUPS.map((g) => ({ value: g, label: g }))}
        value={data.group}
        onChange={(v) => update({ group: v })}
        error={errFor(errors, 'group-0')}
      />
      <RadioGroup
        name="condition"
        legend="Condition"
        options={CONDITIONS.map((g) => ({ value: g, label: g }))}
        value={data.condition}
        onChange={(v) => update({ condition: v })}
        error={errFor(errors, 'condition-0')}
      />
      <TextField
        id="screenReader"
        label="Screen reader used"
        hint="Name and version if known, for example NVDA 2025.1 with Firefox."
        value={data.screenReader}
        maxLength={LIMITS.screenReader}
        onChange={(v) => update({ screenReader: v })}
        error={errFor(errors, 'screenReader')}
      />
    </>
  );
}

function ScaleAndQuestions() {
  return (
    <>
      <h2>Severity scale</h2>
      <ul className="scale">
        {SEVERITY_LABELS.map((l, i) => (
          <li key={l}>
            <strong>{i}</strong>: {l}
          </li>
        ))}
        <li>
          <strong>Unclear / N/A</strong>: the item does not apply, or you cannot judge it
        </li>
      </ul>
      <details>
        <summary>Guiding questions for choosing a severity</summary>
        <dl>
          {GUIDING_QUESTIONS.map((q) => (
            <div key={q.name}>
              <dt>{q.name}</dt>
              <dd>{q.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}

function HeuristicStep({ cat, data, setItem, errors }: {
  cat: (typeof checklist)[number]; data: AuditData; setItem: (id: string, p: Partial<ItemAnswer>) => void;
} & Errs) {
  const options = [...severityOptions, { value: 'na', label: 'Unclear / N/A', separate: true }];
  return (
    <>
      <ScaleAndQuestions />
      <p>Answer every item: choose a severity from 0 to 4, or Unclear / N/A.</p>
      {cat.items.map((item) => {
        const a = data.items[item.id];
        const name = `sev-${domId(item.id)}`;
        const value = a?.unclear ? 'na' : a?.severity != null ? String(a.severity) : '';
        return (
          <section className="item" key={item.id} aria-labelledby={`${name}-heading`}>
            <h2 id={`${name}-heading`} className="item-heading">
              {item.id}: {item.text}
            </h2>
            <RadioGroup
              name={name}
              legend={`Severity for ${item.id}`}
              options={options}
              value={value}
              onChange={(v) => setItem(item.id, v === 'na' ? { severity: null, unclear: true } : { severity: Number(v), unclear: false })}
              error={errFor(errors, `${name}-0`)}
            />
            <TextField
              id={`comment-${domId(item.id)}`}
              label={`Comment on ${item.id} (optional)`}
              value={a?.comment ?? ''}
              maxLength={LIMITS.comment}
              multiline
              onChange={(v) => setItem(item.id, { comment: v })}
            />
          </section>
        );
      })}
    </>
  );
}

function OutsideStep({ data, errors, setIssue, add, remove }: {
  data: AuditData; setIssue: (k: string, p: Partial<OutsideIssue>) => void; add: () => void; remove: (k: string, n: number) => void;
} & Errs) {
  return (
    <>
      <p>
        Add any accessibility problem you met that does not fit heuristics H1 to H5. This step is optional: if you have
        nothing to add, choose Next.
      </p>
      <p>{data.outside.length === 1 ? '1 issue added.' : `${data.outside.length} issues added.`}</p>
      {data.outside.map((o, n) => (
        <section className="item" key={o.key} aria-labelledby={`issue-${o.key}-heading`}>
          <h2 id={`issue-${o.key}-heading`} className="item-heading">Issue {n + 1}</h2>
          <TextField
            id={`issue-${o.key}-text`}
            label={`Description of issue ${n + 1}`}
            value={o.text}
            maxLength={LIMITS.issue}
            multiline
            onChange={(v) => setIssue(o.key, { text: v })}
            error={errFor(errors, `issue-${o.key}-text`)}
          />
          <div className={`field${errFor(errors, `issue-${o.key}-tag`) ? ' has-error' : ''}`}>
            <label htmlFor={`issue-${o.key}-tag`}>Tag for issue {n + 1}</label>
            <InlineError id={`issue-${o.key}-tag-error`} message={errFor(errors, `issue-${o.key}-tag`)} />
            <select
              id={`issue-${o.key}-tag`}
              value={o.tag}
              aria-describedby={errFor(errors, `issue-${o.key}-tag`) ? `issue-${o.key}-tag-error` : undefined}
              aria-invalid={errFor(errors, `issue-${o.key}-tag`) ? true : undefined}
              onChange={(e) => setIssue(o.key, { tag: e.target.value })}
            >
              <option value="">Choose a tag</option>
              {TAGS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <RadioGroup
            name={`issue-${o.key}-sev`}
            legend={`Severity for issue ${n + 1}`}
            options={severityOptions}
            value={o.severity === null ? '' : String(o.severity)}
            onChange={(v) => setIssue(o.key, { severity: Number(v) })}
            error={errFor(errors, `issue-${o.key}-sev-0`)}
          />
          <button type="button" onClick={() => remove(o.key, n + 1)}>
            Remove issue {n + 1}
          </button>
        </section>
      ))}
      {data.outside.length < LIMITS.maxIssues ? (
        <button type="button" id="add-issue" onClick={add}>
          {data.outside.length ? 'Add another issue' : 'Add an issue'}
        </button>
      ) : (
        <p>You have reached the maximum of {LIMITS.maxIssues} issues.</p>
      )}
    </>
  );
}

function VerifyStep({ data, update, errors }: { data: AuditData; update: (p: Partial<AuditData>) => void } & Errs) {
  return (
    <>
      <RadioGroup
        name="verify"
        legend="Did you believe the final model matched what you asked for?"
        legendClass="legend-large"
        options={VERIFICATION_ANSWERS.map((a) => ({ value: a, label: a }))}
        value={data.verification.answer}
        onChange={(v) => update({ verification: { ...data.verification, answer: v } })}
        error={errFor(errors, 'verify-0')}
      />
      <TextField
        id="verify-reason"
        label="How did you decide?"
        value={data.verification.reason}
        maxLength={LIMITS.reason}
        multiline
        onChange={(v) => update({ verification: { ...data.verification, reason: v } })}
      />
    </>
  );
}

function ReviewStep({ data, goto }: { data: AuditData; goto: (s: number) => void }) {
  const sevText = (s: number | null) => (s === null ? 'Not answered' : `${s}: ${SEVERITY_LABELS[s]}`);
  return (
    <>
      <p>Check your answers. Use the Change buttons to go back to a step. When you are ready, choose Submit at the end of the page.</p>
      <h2>Session setup</h2>
      <dl className="summary">
        <div><dt>Auditor code</dt><dd>{data.auditor}</dd></div>
        <div><dt>Group</dt><dd>{data.group}</dd></div>
        <div><dt>Condition</dt><dd>{data.condition}</dd></div>
        <div><dt>Screen reader</dt><dd>{data.screenReader}</dd></div>
      </dl>
      <button type="button" onClick={() => goto(0)}>Change session setup</button>

      {checklist.map((c, ci) => (
        <div key={c.id}>
          <h2>{c.heuristic} {c.title}</h2>
          <table>
            <caption className="visually-hidden">{c.heuristic} answers</caption>
            <thead>
              <tr><th scope="col">Item</th><th scope="col">Severity</th><th scope="col">Comment</th></tr>
            </thead>
            <tbody>
              {c.items.map((i) => {
                const a = data.items[i.id];
                return (
                  <tr key={i.id}>
                    <th scope="row">{i.id}: {i.text}</th>
                    <td>{a?.unclear ? 'Unclear / N/A' : sevText(a?.severity ?? null)}</td>
                    <td>{a?.comment || 'None'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" onClick={() => goto(FIRST_H + ci)}>Change {c.heuristic} answers</button>
        </div>
      ))}

      <h2>Issues outside the framework</h2>
      {data.outside.length === 0 ? (
        <p>None added.</p>
      ) : (
        <ol>
          {data.outside.map((o) => (
            <li key={o.key}>
              <p>{o.text}</p>
              <p>Tag: {o.tag}. Severity: {sevText(o.severity)}.</p>
            </li>
          ))}
        </ol>
      )}
      <button type="button" onClick={() => goto(OUTSIDE)}>Change outside-framework issues</button>

      <h2>Verification</h2>
      <dl className="summary">
        <div><dt>Did the final model match what you asked for?</dt><dd>{data.verification.answer}</dd></div>
        <div><dt>How did you decide?</dt><dd>{data.verification.reason || 'No answer'}</dd></div>
      </dl>
      <button type="button" onClick={() => goto(VERIFY)}>Change verification answer</button>
    </>
  );
}
