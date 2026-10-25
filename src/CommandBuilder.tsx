// Builds a command from form fields, for people who prefer not to compose free text.
// It only writes text into the command box (or sends it), so it uses exactly the same
// pipeline and grammar as typing and speech.
import { useId, useState } from 'react';
import { label, type Model } from './model/types';

type Action = 'add' | 'hole' | 'move' | 'resize';
const SPOTS: [string, string][] = [
  ['', 'Centre'], ['front edge', 'Front edge'], ['back edge', 'Back edge'], ['left edge', 'Left edge'], ['right edge', 'Right edge'],
  ['front-left corner', 'Front-left corner'], ['front-right corner', 'Front-right corner'], ['back-left corner', 'Back-left corner'], ['back-right corner', 'Back-right corner'],
];

export default function CommandBuilder({ model, onPut, onSend }: { model: Model; onPut: (c: string) => void; onSend: (c: string) => void }) {
  const id = useId();
  const solids = model.parts.filter((p) => p.kind === 'solid');
  const all = model.parts;
  const [action, setAction] = useState<Action>('add');
  const [shape, setShape] = useState('box');
  const [w, setW] = useState('40');
  const [d, setD] = useState('30');
  const [h, setH] = useState('10');
  const [diam, setDiam] = useState('10');
  const [place, setPlace] = useState('');
  const [ref, setRef] = useState('');
  const [spot, setSpot] = useState('');
  const [name, setName] = useState('');
  const [depth, setDepth] = useState('');
  const [dir, setDir] = useState('left');
  const [dist, setDist] = useState('10');
  const [dim, setDim] = useState('height');
  const [value, setValue] = useState('20');

  const refText = (v: string) => v || (solids[0] ? `part ${solids[0].num}` : '');
  const num = (v: string) => v.trim().replace(/[^\d.]/g, '');

  let cmd = '';
  if (action === 'add') {
    const size = shape === 'box' ? `${num(w)} by ${num(d)} by ${num(h)}` : shape === 'sphere' ? `${num(diam)} wide` : `${num(diam)} wide and ${num(h)} tall`;
    const where = place && solids.length ? ` ${place} ${refText(ref)}${place === 'on top of' && spot ? ` at the ${spot}` : ''}` : '';
    cmd = `add a ${shape} ${size}${name.trim() ? ` called ${name.trim().toLowerCase()}` : ''}${where}`;
  } else if (action === 'hole') {
    cmd = `add a hole ${num(diam)} wide${num(depth) ? ` and ${num(depth)} deep` : ''} ${num(depth) ? 'in' : 'through'} ${refText(ref)}${spot ? ` at the ${spot}` : ''}`;
  } else if (action === 'move') {
    cmd = `move ${refText(ref) || 'it'} ${dir} by ${num(dist)}`;
  } else {
    cmd = `set the ${dim} of ${refText(ref) || 'it'} to ${num(value)}`;
  }
  cmd = cmd.replace(/\s+/g, ' ').trim();
  const needsPart = action !== 'add' && !solids.length;

  const text = (fid: string, l: string, v: string, set: (s: string) => void, hint?: string) => (
    <div className="field small-field">
      <label htmlFor={`${id}-${fid}`}>{l}</label>
      <input id={`${id}-${fid}`} type="text" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} aria-describedby={hint ? `${id}-${fid}-h` : undefined} autoComplete="off" />
      {hint && <p className="hint" id={`${id}-${fid}-h`}>{hint}</p>}
    </div>
  );
  const select = (fid: string, l: string, v: string, set: (s: string) => void, opts: [string, string][]) => (
    <div className="field small-field">
      <label htmlFor={`${id}-${fid}`}>{l}</label>
      <select id={`${id}-${fid}`} value={v} onChange={(e) => set(e.target.value)}>
        {opts.map(([ov, ol]) => <option key={ov} value={ov}>{ol}</option>)}
      </select>
    </div>
  );
  const partOpts = (list: typeof all): [string, string][] => list.map((p) => [`${p.kind === 'hole' ? 'hole' : 'part'} ${p.num}`, `${label(p)}${p.name ? ` (${p.name})` : ''}, ${p.shape}`]);

  return (
    <details className="builder">
      <summary>Build a command step by step</summary>
      <p>Choose options; the command appears below. You can put it in the command box to check it, or send it straight away.</p>
      <fieldset>
        <legend>What do you want to do?</legend>
        {([['add', 'Add a shape'], ['hole', 'Add a hole'], ['move', 'Move a part'], ['resize', 'Change a size']] as [Action, string][]).map(([v, l]) => (
          <div className="radio" key={v}>
            <input type="radio" id={`${id}-a-${v}`} name={`${id}-action`} checked={action === v} onChange={() => setAction(v)} />
            <label htmlFor={`${id}-a-${v}`}>{l}</label>
          </div>
        ))}
      </fieldset>
      <div className="builder-fields">
        {action === 'add' && (
          <>
            {select('shape', 'Shape', shape, setShape, [['box', 'Box'], ['cylinder', 'Cylinder'], ['sphere', 'Sphere'], ['cone', 'Cone (pointed)']])}
            {shape === 'box' ? (
              <>{text('w', 'Width (mm, left to right)', w, setW)}{text('d', 'Depth (mm, front to back)', d, setD)}{text('h', 'Height (mm)', h, setH)}</>
            ) : (
              <>{text('diam', 'Diameter (mm)', diam, setDiam)}{shape !== 'sphere' && text('h2', 'Height (mm)', h, setH)}</>
            )}
            {solids.length > 0 && select('place', 'Where', place, setPlace, [['', 'Next to the model, on the build plate'], ['on top of', 'On top of a part'], ['to the left of', 'To the left of a part'], ['to the right of', 'To the right of a part'], ['in front of', 'In front of a part'], ['behind', 'Behind a part']])}
            {place && solids.length > 0 && select('ref', 'Which part', refText(ref), setRef, partOpts(solids))}
            {place === 'on top of' && solids.length > 0 && select('spot', 'Where on top', spot, setSpot, SPOTS)}
            {text('name', 'Name (optional)', name, setName, 'A word to refer to it later, such as base or lid.')}
          </>
        )}
        {action === 'hole' && solids.length > 0 && (
          <>
            {select('ref', 'In which part', refText(ref), setRef, partOpts(solids))}
            {text('hd', 'Hole diameter (mm)', diam, setDiam)}
            {text('depth', 'Depth (mm)', depth, setDepth, 'Leave empty for a hole that goes all the way through.')}
            {select('spot', 'Position on the top', spot, setSpot, SPOTS)}
          </>
        )}
        {action === 'move' && solids.length > 0 && (
          <>
            {select('ref', 'Which part', refText(ref), setRef, partOpts(all))}
            {select('dir', 'Direction', dir, setDir, [['left', 'Left'], ['right', 'Right'], ['forward', 'Forward (towards the front)'], ['back', 'Back'], ['up', 'Up'], ['down', 'Down']])}
            {text('dist', 'Distance (mm)', dist, setDist)}
          </>
        )}
        {action === 'resize' && solids.length > 0 && (
          <>
            {select('ref', 'Which part', refText(ref), setRef, partOpts(all))}
            {select('dim', 'Size to change', dim, setDim, [['width', 'Width'], ['depth', 'Depth'], ['height', 'Height'], ['diameter', 'Diameter']])}
            {text('value', 'New value (mm)', value, setValue)}
          </>
        )}
      </div>
      {needsPart ? (
        <p>Add a shape first; then you can choose a part here.</p>
      ) : (
        <>
          <p className="built-command">
            Command: <code id={`${id}-cmd`}>{cmd}</code>
          </p>
          <div className="button-row">
            <button type="button" onClick={() => onPut(cmd)} aria-describedby={`${id}-cmd`}>Put in command box</button>
            <button type="button" onClick={() => onSend(cmd)} aria-describedby={`${id}-cmd`}>Send now</button>
          </div>
        </>
      )}
    </details>
  );
}
