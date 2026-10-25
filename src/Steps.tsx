// Shared form building blocks for the participant flow and the operator console.
import {
  CONDITIONS, GROUPS, GUIDING_QUESTIONS, LIMITS, SEVERITY_LABELS, TAGS, VERIFICATION_ANSWERS,
  checklist, type AuditData, type ItemAnswer, type OutsideIssue,
} from './types';
import { InlineError, type FieldError } from './ErrorSummary';

export const domId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

export type Errs = { errors: FieldError[] };
export const errFor = (errors: FieldError[], id: string) => errors.find((e) => e.id === id)?.message;

export function RadioGroup(props: {
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

export function TextField(props: {
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

export const severityOptions = SEVERITY_LABELS.map((l, i) => ({ value: String(i), label: `${i}: ${l}` }));

export function SetupStep({ data, update, errors }: { data: AuditData; update: (p: Partial<AuditData>) => void } & Errs) {
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

export function ScaleAndQuestions() {
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

export function HeuristicStep({ cat, data, setItem, errors }: {
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

export function OutsideStep({ data, errors, setIssue, add, remove }: {
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

export function VerifyStep({ data, update, errors }: { data: AuditData; update: (p: Partial<AuditData>) => void } & Errs) {
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

export function ReviewStep({ data, goto, firstH, outside, verify }: { data: AuditData; goto: (s: number) => void; firstH: number; outside: number; verify: number }) {
  const sevText = (s: number | null) => (s === null ? 'Not answered' : `${s}: ${SEVERITY_LABELS[s]}`);
  return (
    <>
      <p>Check your answers. Use the Change buttons to go back to a step. When you are ready, choose Submit at the end of the page.</p>
      <h2>Verification</h2>
      <dl className="summary">
        <div><dt>Did the final model match what you asked for?</dt><dd>{data.verification.answer}</dd></div>
        <div><dt>How did you decide?</dt><dd>{data.verification.reason || 'No answer'}</dd></div>
      </dl>
      <button type="button" onClick={() => goto(verify)}>Change verification answer</button>

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
          <button type="button" onClick={() => goto(firstH + ci)}>Change {c.heuristic} answers</button>
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
      <button type="button" onClick={() => goto(outside)}>Change outside-framework issues</button>


    </>
  );
}
