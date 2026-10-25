// Read-mostly panels: Model, History, Code, Outputs, Settings, Help.
import { useId } from 'react';
import { describeModel } from './model/describe';
import { holeText, holes, modelBounds, partSize, problems, solids, supportText } from './model/geometry';
import { labelWithName, mm, SHAPE_NAMES, type Model } from './model/types';
import { HELP } from './help';
import { EXAMPLES } from './examples';
import type { Settings } from './settings';
import type { Step } from './state';

export function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} tabIndex={-1}>{children}</h2>;
}

// ---------- Model ----------
export function ModelPanel({ model }: { model: Model }) {
  const lines = describeModel(model, 'standard');
  const pr = problems(model);
  const S = solids(model), H = holes(model);
  const b = modelBounds(model);
  return (
    <>
      <p className="lead">{lines[0]}</p>
      {S.length > 0 && (
        <>
          <h3>Description</h3>
          <ul className="desc">
            {lines.slice(1).filter((l) => !/^(Warning|Note):|^No printing problems/.test(l)).map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <h3>Problems</h3>
          {pr.length === 0 ? (
            <p>No printing problems found.</p>
          ) : (
            <ul className="problems">
              {pr.map((p, i) => (
                <li key={i} className={p.severity}>
                  <strong>{p.severity === 'warning' ? 'Warning:' : 'Note:'}</strong> {p.text}
                </li>
              ))}
            </ul>
          )}
          <div className="table-wrap">
            <table>
              <caption>Parts{H.length ? ' and holes' : ''} (sizes in millimetres)</caption>
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col">Shape</th>
                  <th scope="col">Size</th>
                  <th scope="col">Where</th>
                  <th scope="col">Centre x, y; bottom height</th>
                </tr>
              </thead>
              <tbody>
                {model.parts.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{labelWithName(p)}</th>
                    <td>{p.kind === 'hole' ? 'hole' : SHAPE_NAMES[p.shape]}</td>
                    <td>{partSize(p)}</td>
                    <td>{p.kind === 'hole' ? holeText(p, model) : supportText(p, model)}</td>
                    <td>x {mm(p.x)}, y {mm(p.y)}; {mm(p.z)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {b && <p className="hint">Overall: {mm(b.maxX - b.minX)} mm wide (left to right), {mm(b.maxY - b.minY)} mm deep (front to back), {mm(b.maxZ - b.minZ)} mm tall.</p>}
        </>
      )}
    </>
  );
}

// ---------- History ----------
export function HistoryPanel({ steps, index, onUndo, onRedo, onRevert }: {
  steps: Step[]; index: number; onUndo: () => void; onRedo: () => void; onRevert: (i: number) => void;
}) {
  const redoable = steps.length - 1 - index;
  return (
    <>
      <p>
        You are at step {index} of {steps.length - 1}.{' '}
        {redoable > 0 ? `${redoable} later step${redoable === 1 ? '' : 's'} can be redone.` : ''}
      </p>
      <div className="button-row">
        <button type="button" onClick={onUndo} aria-disabled={index === 0}>
          Undo{index > 0 ? `: ${steps[index].label}` : ''}
        </button>
        <button type="button" onClick={onRedo} aria-disabled={redoable === 0}>
          Redo{redoable > 0 ? `: ${steps[index + 1].label}` : ''}
        </button>
      </div>
      <ol className="history" start={0}>
        {steps.map((s, i) => (
          <li key={i} aria-current={i === index ? 'step' : undefined} className={i > index ? 'future' : undefined}>
            <span>
              Step {i}: {s.label}
              {s.command ? <span className="cmd"> (you said “{s.command}”)</span> : null}
              {i === index ? <strong> (current)</strong> : i > index ? ' (undone)' : ''}
            </span>
            {i !== index && (
              <button type="button" className="small" onClick={() => onRevert(i)}>
                Go to step {i}
              </button>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

// ---------- Code ----------
export function CodePanel({ code, onCopy, onDownload }: { code: string; onCopy: () => void; onDownload: () => void }) {
  const lines = code.trimEnd().split('\n').length;
  return (
    <>
      <p>OpenSCAD code for the current model. It updates after every change and has {lines} lines. The text box is read-only: use the arrow keys to read it line by line.</p>
      <label htmlFor="scad">OpenSCAD code (read-only)</label>
      <textarea id="scad" readOnly value={code} rows={Math.min(18, Math.max(6, lines + 1))} spellCheck={false} wrap="off" />
      <div className="button-row">
        <button type="button" onClick={onCopy}>Copy code</button>
        <button type="button" onClick={onDownload}>Download .scad file</button>
      </div>
    </>
  );
}

// ---------- Outputs ----------
export function OutputsPanel({ empty, onListen, onSTL, onText, onScad }: { empty: boolean; onListen: () => void; onSTL: () => void; onText: () => void; onScad: () => void }) {
  return (
    <>
      <p>Other ways to check or use the model besides the text description.</p>
      <h3>Listen to the shape</h3>
      <p>
        Plays the model's height from left to right in about 4 seconds. Higher pitch means taller; silence means empty space.
        A click marks the start (left ear) and the end (right ear). Headphones help.
      </p>
      <button type="button" onClick={onListen} aria-disabled={empty}>Play height profile</button>
      <h3>Files</h3>
      <div className="button-row">
        <button type="button" onClick={onSTL} aria-disabled={empty}>Download STL for 3D printing</button>
        <button type="button" onClick={onText} aria-disabled={empty}>Download text description</button>
        <button type="button" onClick={onScad}>Download OpenSCAD file</button>
      </div>
      <p className="hint">An STL file can be 3D printed to make a tactile copy of the model.</p>
    </>
  );
}

// ---------- Settings ----------
export function SettingsPanel({ settings, set, voiceSupported, onReset }: {
  settings: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K], label: string) => void; voiceSupported: boolean; onReset: () => void;
}) {
  const id = useId();
  const radio = <K extends keyof Settings>(key: K, legend: string, opts: [Settings[K], string, string?][]) => (
    <fieldset>
      <legend>{legend}</legend>
      {opts.map(([v, l, hint]) => (
        <div className="radio" key={String(v)}>
          <input type="radio" id={`${id}-${key}-${v}`} name={`${id}-${key}`} checked={settings[key] === v} onChange={() => set(key, v, `${legend}: ${l}`)} />
          <label htmlFor={`${id}-${key}-${v}`}>{l}{hint ? <span className="hint-inline"> – {hint}</span> : null}</label>
        </div>
      ))}
    </fieldset>
  );
  const check = <K extends keyof Settings>(key: K, l: string, hint?: string, disabled?: boolean) => (
    <div className="check">
      <input type="checkbox" id={`${id}-${key}`} checked={settings[key] as boolean} disabled={disabled} aria-describedby={hint ? `${id}-${key}-hint` : undefined}
        onChange={(e) => set(key, e.target.checked as Settings[K], `${l}: ${e.target.checked ? 'on' : 'off'}`)} />
      <label htmlFor={`${id}-${key}`}>{l}</label>
      {hint && <p className="hint" id={`${id}-${key}-hint`}>{hint}</p>}
    </div>
  );
  return (
    <>
      <p>Changes apply immediately and are saved in this browser.</p>
      {radio('detail', 'How much the agent says after a change', [
        ['brief', 'Brief', 'what changed'], ['standard', 'Standard', 'what changed, the new overall size, and any assumptions'], ['detailed', 'Detailed', 'also a full description of every part'],
      ])}
      {radio('focusAfterReply', 'After the agent replies, keyboard focus goes to', [['input', 'The command box', 'keep typing'], ['reply', 'The new reply', 'read it with arrow keys']])}
      {radio('pace', 'Agent pace', [['realistic', 'Realistic', 'about a second of working time you can stop'], ['instant', 'Instant']])}
      {check('soundCues', 'Sound cues when the agent starts, finishes, or hits a problem')}
      {check('speakReplies', 'Read replies aloud with the browser voice', 'For people not using a screen reader. Leave this off if you use one, or you will hear replies twice.')}
      {check('autoSendVoice', 'Send voice commands automatically', voiceSupported ? 'Turn off to check the words in the command box before pressing Enter.' : 'Voice input is not available in this browser.', !voiceSupported)}
      {check('previewLabels', 'Show part numbers on the visual preview')}
      <div className="field">
        <label htmlFor={`${id}-size`}>Text size</label>
        <select id={`${id}-size`} value={settings.textSize} onChange={(e) => set('textSize', Number(e.target.value) as Settings['textSize'], `Text size: ${e.target.value}%`)}>
          {[100, 125, 150, 200].map((v) => <option key={v} value={v}>{v}%</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-theme`}>Colours</label>
        <select id={`${id}-theme`} value={settings.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'], `Colours: ${e.target.selectedOptions[0].text}`)}>
          <option value="system">Follow my system (light or dark)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="contrast">High contrast (yellow on black)</option>
        </select>
      </div>
      <button type="button" onClick={onReset}>Reset all settings</button>
    </>
  );
}

// ---------- Help ----------
export function HelpPanel({ onTry }: { onTry: (cmd: string) => void }) {
  return (
    <>
      <p>
        Topics below. You can also say “help” followed by a topic, for example “help holes”. Use “Put in command box” to try an example: it fills the
        command box without sending, so you can check it first.
      </p>
      <nav aria-label="Help topics">
        <ul className="inline-list">
          {HELP.map((h) => <li key={h.id}><a href={`#help-${h.id}`}>{h.title}</a></li>)}
        </ul>
      </nav>
      {HELP.map((h) => (
        <section key={h.id} aria-labelledby={`help-${h.id}`}>
          <h3 id={`help-${h.id}`} tabIndex={-1}>{h.title}</h3>
          {h.text.map((t, i) => <p key={i}>{t}</p>)}
          {h.examples.length > 0 && (
            <>
              <p className="examples-title">Examples:</p>
              <ul className="examples">
                {h.examples.map((e) => (
                  <li key={e}>
                    <code>{e}</code>{' '}
                    <button type="button" className="small" onClick={() => onTry(e)} aria-label={`Put "${e}" in command box`}>Put in command box</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
      <section aria-labelledby="help-examples">
        <h3 id="help-examples" tabIndex={-1}>Example models</h3>
        <ul>
          {EXAMPLES.map((e) => (
            <li key={e.id}>
              <strong>{e.title}</strong>: {e.description}{' '}
              <button type="button" className="small" onClick={() => onTry(`load the ${e.id} example`)} aria-label={`Put "load the ${e.id} example" in command box`}>Put in command box</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
