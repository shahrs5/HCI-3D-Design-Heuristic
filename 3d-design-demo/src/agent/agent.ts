// The rule-based "design agent": executes parsed intents against the model and writes replies
// that follow the heuristics: say what changed (H2.2), say when it did something different from
// what was asked or made an assumption (H2.4), and report problems accessibly (H4.1).

import { bounds, distanceBetween, holes, modelBounds, partSize, problems, relationText, solids, stackAbove, supportText, EPS, type Box3 } from '../model/geometry';
import { describeModel, describePart, overview, type Detail } from '../model/describe';
import { label, labelWithName, mm, SHAPE_NAMES, type Model, type Part, type SolidShape } from '../model/types';
import type { Coords, Dims, DimKey, Intent, Placement, Ref, Spot } from './parser';

export interface Reply {
  kind: 'change' | 'info' | 'error' | 'confirm' | 'action';
  text: string;
  notes: string[];
  warnings: string[];
  details: string[];
  model?: Model;
  touched?: number;
  historyLabel?: string;
}

export interface Ctx { model: Model; lastTouched: number | null; detail: Detail }

const MAX = 500;
const clone = (m: Model): Model => ({ ...m, parts: m.parts.map((p) => ({ ...p })) });
const r1 = (v: number) => Math.round(v * 10) / 10;

class AgentError extends Error {}
const fail = (msg: string): never => { throw new AgentError(msg); };

function partList(m: Model): string {
  const all = m.parts.map(labelWithName);
  return all.length ? `The model has: ${all.join(', ')}.` : 'The model is empty.';
}

function sizeSpoken(b: Box3 | null) {
  return b ? `${mm(b.maxX - b.minX)} by ${mm(b.maxY - b.minY)} by ${mm(b.maxZ - b.minZ)} mm` : 'empty';
}

// ---------- references ----------

interface Resolved { part: Part; note?: string }

function resolve(ref: Ref | null, ctx: Ctx, want: 'solid' | 'any' = 'any', role = 'part'): Resolved {
  const m = ctx.model;
  const pool = want === 'solid' ? solids(m) : m.parts;
  if (!m.parts.length) fail('The model is empty, so there is nothing to change yet. Try: add a box 40 by 30 by 10.');
  const last = m.parts.find((p) => p.id === ctx.lastTouched && (want === 'any' || p.kind === 'solid'));
  if (!ref || ref.kind === 'it') {
    if (pool.length === 1) return { part: pool[0] };
    if (last) return { part: last, note: ref ? undefined : `You didn't say which ${role}, so I used ${labelWithName(last)}, the one you worked on last.` };
    return fail(`Which ${role} do you mean? ${partList(m)} Say for example "part 1".`);
  }
  switch (ref.kind) {
    case 'solid': {
      const p = m.parts.find((q) => q.kind === 'solid' && q.num === ref.n);
      if (!p) fail(`There is no part ${ref.n}. ${partList(m)}`);
      return { part: p! };
    }
    case 'hole': {
      const p = m.parts.find((q) => q.kind === 'hole' && q.num === ref.n);
      if (!p) fail(`There is no hole ${ref.n}. ${partList(m)}`);
      if (want === 'solid') fail(`${label(p!)} is a hole. Please name a solid part.`);
      return { part: p! };
    }
    case 'name': {
      const p = pool.find((q) => q.name.toLowerCase() === ref.name.toLowerCase());
      if (!p) fail(`I couldn't find a part called ${ref.name}. ${partList(m)}`);
      return { part: p! };
    }
    case 'shape': {
      const matches = pool.filter((q) => q.shape === ref.shape);
      if (!matches.length) fail(`There is no ${ref.shape} in the model. ${partList(m)}`);
      const p = matches[matches.length - 1];
      return matches.length > 1
        ? { part: p, note: `There are ${matches.length} ${ref.shape === 'box' ? 'boxes' : ref.shape + 's'}; I used the newest one, ${labelWithName(p)}. Say for example "${label(matches[0]).toLowerCase()}" to pick another.` }
        : { part: p };
    }
    case 'first': return { part: pool[0] };
    case 'last': return { part: pool[pool.length - 1] };
    case 'all': fail('Please name one part for this command, for example "part 1".');
  }
  return fail('Which part do you mean?');
}

// ---------- placement ----------

function spotXY(spot: Spot | undefined, host: Part, sx: number, sy: number, inset = 0): { x: number; y: number } {
  const B = bounds(host);
  const x = spot?.col === 'left' ? B.minX + sx / 2 + inset : spot?.col === 'right' ? B.maxX - sx / 2 - inset : host.x;
  const y = spot?.row === 'front' ? B.minY + sy / 2 + inset : spot?.row === 'back' ? B.maxY - sy / 2 - inset : host.y;
  return { x, y };
}

const spotWords = (s?: Spot) => (!s || (!s.row && !s.col) ? 'centred' : s.row && s.col ? `at the ${s.row}-${s.col} corner` : `at the ${s.row || s.col} edge`);

/** Position for a part of size sx,sy,sz placed relative to another part. Returns description too. */
function placeRelative(place: Placement, size: { sx: number; sy: number; sz: number }, ctx: Ctx, notes: string[], selfId?: number) {
  if (!place.ref) fail(`${place.side === 'on' ? 'On top of' : 'Next to'} which part? ${partList(ctx.model)}`);
  const r = resolve(place.ref, ctx, 'solid');
  if (r.note) notes.push(r.note);
  const R = r.part;
  if (R.id === selfId) fail(`A part can't be placed relative to itself.`);
  const B = bounds(R);
  let x = R.x, y = R.y, z = R.z;
  let where = '';
  switch (place.side) {
    case 'on': {
      ({ x, y } = spotXY(place.spot, R, size.sx, size.sy));
      z = B.maxZ;
      where = `on top of ${labelWithName(R)}, ${spotWords(place.spot)}`;
      if (size.sx > R.sx + EPS || size.sy > R.sy + EPS) notes.push(`It is larger than the top of ${labelWithName(R)}, so it overhangs the edges.`);
      if (R.shape === 'sphere' || R.shape === 'cone') notes.push(`${labelWithName(R)} is a ${R.shape}, which has no flat top, so the new part only touches it at one point.`);
      break;
    }
    case 'under': z = B.minZ - size.sz; where = `directly under ${labelWithName(R)}`; break;
    case 'left': x = B.minX - size.sx / 2; where = `to the left of ${labelWithName(R)}, touching it`; break;
    case 'right': x = B.maxX + size.sx / 2; where = `to the right of ${labelWithName(R)}, touching it`; break;
    case 'front': y = B.minY - size.sy / 2; where = `in front of ${labelWithName(R)}, touching it`; break;
    case 'back': y = B.maxY + size.sy / 2; where = `behind ${labelWithName(R)}, touching it`; break;
  }
  return { x, y, z, where };
}

/** If anything is below the plate after placing "under", lift the whole model. */
function liftToPlate(m: Model, notes: string[]) {
  const minZ = Math.min(...solids(m).map((p) => p.z));
  if (minZ < -EPS) {
    for (const p of m.parts) p.z = r1(p.z - minZ);
    notes.push(`That would have gone below the build plate, so I raised the whole model by ${mm(-minZ)} mm.`);
  }
}

// ---------- sizes ----------

function missingNote(names: string[], v: number) {
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return `You didn't give the ${list}, so I used ${mm(v)} mm${names.length > 1 ? ' for each' : ''}.`;
}

function sizeFor(shape: SolidShape, d: Dims & { pair?: boolean }, notes: string[]) {
  const DEF = 20;
  const miss: string[] = [];
  const pick = (name: string, ...vals: (number | undefined)[]) => {
    const v = vals.find((x) => x !== undefined);
    if (v === undefined) { miss.push(name); return DEF; }
    return v;
  };
  let sx: number, sy: number, sz: number, topD: number | undefined;
  if (shape === 'box') {
    if (d.single !== undefined && d.w === undefined && d.h === undefined) notes.push(`You gave one size, so I made it a ${mm(d.single)} mm cube.`);
    sx = pick('width', d.w, d.all, d.single, d.diam);
    sy = pick('depth', d.d, d.all, d.single, d.diam);
    sz = pick('height', d.h, d.all, d.single);
  } else if (shape === 'sphere') {
    sx = sy = sz = pick('diameter', d.diam, d.single, d.all, d.w, d.h);
  } else {
    if (d.pair && d.diam === undefined && d.h === undefined) {
      notes.push(`I read "${mm(d.w!)} by ${mm(d.d!)}" as ${mm(d.w!)} mm across and ${mm(d.d!)} mm tall.`);
      d = { ...d, diam: d.w, h: d.d, w: undefined, d: undefined };
    }
    sx = sy = pick('diameter', d.diam, d.w, d.single, d.all, d.d);
    sz = pick('height', d.h, d.all);
    if (shape === 'cone') topD = d.topD ?? 0;
  }
  const n = missingNote(miss, DEF);
  if (n) notes.push(n);
  for (const v of [sx, sy, sz]) if (!(v > 0) || v > MAX) fail(`Sizes must be between 0.1 and ${MAX} mm. I got ${mm(v)} mm.`);
  if (topD !== undefined && topD >= sx) fail(`The top of a cone must be narrower than its base (${mm(sx)} mm).`);
  return { sx: r1(sx), sy: r1(sy), sz: r1(sz), topD };
}

// ---------- change summary ----------

function finishChange(before: Model, after: Model, text: string, notes: string[], touched: number | undefined, historyLabel: string, detail: Detail): Reply {
  const b0 = modelBounds(before), b1 = modelBounds(after);
  const s0 = sizeSpoken(b0), s1 = sizeSpoken(b1);
  const sizeLine = !b1 ? 'The model is now empty.' : s0 === s1 ? `Overall size is unchanged: ${s1}.` : b0 ? `Overall size is now ${s1} (before: ${s0}).` : `Overall size: ${s1}.`;
  const p0 = new Set(problems(before).map((p) => p.text));
  const p1 = problems(after);
  const fresh = p1.filter((p) => !p0.has(p.text));
  const warnings = fresh.filter((p) => p.severity === 'warning').map((p) => p.text);
  for (const p of fresh.filter((x) => x.severity === 'info')) notes.push(p.text);
  const fixed = problems(before).filter((p) => p.severity === 'warning' && !p1.some((q) => q.text === p.text)).map((p) => p.text);
  for (const f of fixed) notes.push(`Fixed: this resolved an earlier problem (${f.replace(/\.$/, '')}).`);
  const details = detail === 'detailed' ? describeModel(after, 'standard').slice(1) : [];
  return { kind: 'change', text: `${text} ${sizeLine}`, notes, warnings, details, model: after, touched, historyLabel };
}

// ---------- main ----------

export function run(intent: Intent, ctx: Ctx, parseNotes: string[] = []): Reply {
  const notes = [...parseNotes];
  const info = (text: string, details: string[] = []): Reply => ({ kind: 'info', text, notes, warnings: [], details });
  try {
    const m = ctx.model;
    switch (intent.type) {
      case 'add': {
        const size = sizeFor(intent.shape, intent.dims as Dims & { pair?: boolean }, notes);
        const next = clone(m);
        const part: Part = { id: next.nextId++, kind: 'solid', num: next.nextSolidNum++, name: '', shape: intent.shape, ...size, x: 0, y: 0, z: 0 };
        if (intent.name) part.name = validName(intent.name, next);
        let where: string;
        if (intent.place) {
          const p = placeRelative(intent.place, size, ctx, notes);
          Object.assign(part, { x: r1(p.x), y: r1(p.y), z: r1(p.z) });
          where = p.where;
        } else if (intent.coords) {
          const c = intent.coords;
          Object.assign(part, { x: c.x ?? 0, y: c.y ?? 0, z: c.z ?? 0 });
          where = `with its centre at x ${mm(part.x)}, y ${mm(part.y)} and its bottom at height ${mm(part.z)}`;
        } else if (!solids(m).length) {
          where = 'in the centre of the build plate';
        } else {
          const B = modelBounds(m)!;
          Object.assign(part, { x: r1(B.maxX + size.sx / 2), y: r1((B.minY + B.maxY) / 2), z: 0 });
          where = 'on the build plate, to the right of the model, touching it';
          notes.push("You didn't say where to put it, so I placed it to the right of the model. Say for example \"move it on top of part 1\" to change that.");
        }
        next.parts.push(part);
        if (intent.place?.side === 'under') liftToPlate(next, notes);
        const named = part.name ? `, named ${part.name}` : '';
        return finishChange(m, next, `Added ${label(part)}${named}: a ${SHAPE_NAMES[part.shape]}, ${partSize(part)}, ${where}.`, notes, part.id, `Add ${label(part)} (${part.shape})`, ctx.detail);
      }

      case 'hole': {
        const hostR = resolve(intent.target, ctx, 'solid', 'part to put the hole in');
        if (hostR.note) notes.push(hostR.note);
        const host = hostR.part;
        let diam = intent.diam;
        if (diam === undefined) { diam = 5; notes.push("You didn't give a size, so I made the hole 5 mm wide."); }
        if (!(diam > 0) || diam > MAX) fail(`Hole size must be between 0.1 and ${MAX} mm.`);
        const narrow = Math.min(host.sx, host.sy);
        if (diam >= narrow) fail(`A ${mm(diam)} mm hole is as wide as ${labelWithName(host)} (${mm(narrow)} mm), so it would cut it in two. Try a smaller hole, for example ${mm(Math.max(1, Math.floor(narrow / 3)))} mm.`);
        const next = clone(m);
        const wall = Math.max(0, Math.min(3, (narrow - diam) / 4));
        let { x, y } = spotXY(intent.spot, host, diam, diam, wall);
        if (intent.coords) { x = intent.coords.x ?? host.x; y = intent.coords.y ?? host.y; }
        let through = true, z = host.z - 0.5, sz = host.sz + 1;
        if (intent.depth !== undefined) {
          if (intent.depth >= host.sz) notes.push(`${labelWithName(host)} is only ${mm(host.sz)} mm tall, so a ${mm(intent.depth)} mm deep hole goes all the way through.`);
          else { through = false; z = host.z + host.sz - intent.depth; sz = intent.depth + 0.5; }
        }
        if (host.shape === 'sphere' || host.shape === 'cone') notes.push(`${labelWithName(host)} is a ${host.shape}; the hole goes straight down through it from the top.`);
        const h: Part = { id: next.nextId++, kind: 'hole', num: next.nextHoleNum++, name: '', shape: 'hole', sx: r1(diam), sy: r1(diam), sz: r1(sz), x: r1(x), y: r1(y), z: r1(z), holeOf: host.id, through };
        next.parts.push(h);
        const where = intent.coords ? `at x ${mm(h.x)}, y ${mm(h.y)}` : spotWords(intent.spot) === 'centred' ? 'at its centre' : spotWords(intent.spot);
        const depthText = through ? 'all the way through' : `${mm(intent.depth!)} mm deep into`;
        return finishChange(m, next, `Added ${label(h)}: ${mm(diam)} mm wide, ${depthText} ${labelWithName(host)}, ${where}.`, notes, h.id, `Add ${label(h)}`, ctx.detail);
      }

      case 'move': return move(intent, ctx, notes);
      case 'resize': return resize(intent, ctx, notes);

      case 'delete': {
        if (intent.target?.kind === 'all') return { kind: 'confirm', text: 'Do you want to delete everything and start a new model? Say yes or no.', notes, warnings: [], details: [] };
        const r = resolve(intent.target, ctx);
        if (r.note) notes.push(r.note);
        const p = r.part;
        const next = clone(m);
        const own = p.kind === 'solid' ? next.parts.filter((h) => h.holeOf === p.id) : [];
        next.parts = next.parts.filter((q) => q.id !== p.id && !own.some((h) => h.id === q.id));
        if (own.length) notes.push(`Its ${own.map(label).join(' and ')} ${own.length === 1 ? 'was' : 'were'} removed too.`);
        const rest = solids(next);
        return finishChange(m, next, `Deleted ${labelWithName(p)} (the ${p.shape}).`, notes, rest[rest.length - 1]?.id, `Delete ${label(p)}`, ctx.detail);
      }

      case 'rename': {
        const r = resolve(intent.target, ctx);
        if (r.note) notes.push(r.note);
        const next = clone(m);
        const p = next.parts.find((q) => q.id === r.part.id)!;
        const old = labelWithName(p);
        p.name = validName(intent.name, next, p.id);
        return { kind: 'change', text: `Renamed ${old} to ${p.name}. You can now say "${p.name}" instead of "${label(p).toLowerCase()}".`, notes, warnings: [], details: [], model: next, touched: p.id, historyLabel: `Rename ${label(p)}` };
      }

      case 'describe': {
        if (intent.target) {
          const r = resolve(intent.target, ctx);
          if (r.note) notes.push(r.note);
          const lines = [describePart(r.part, m, intent.detail ?? (ctx.detail === 'brief' ? 'standard' : ctx.detail))];
          if (r.part.kind === 'solid') {
            const own = holes(m).filter((h) => h.holeOf === r.part.id);
            if (own.length) lines.push(`It has ${own.map((h) => `${label(h)} (${mm(h.sx)} mm)`).join(', ')}.`);
          }
          return { ...info(lines[0], lines.slice(1)), touched: r.part.id };
        }
        const lines = describeModel(m, intent.detail ?? ctx.detail);
        return info(lines[0], lines.slice(1));
      }

      case 'list': {
        if (!m.parts.length) return info('The model is empty.');
        return info(overview(m), m.parts.map((p) => `${labelWithName(p)}: ${p.kind === 'hole' ? 'hole' : SHAPE_NAMES[p.shape]}, ${partSize(p)}.`));
      }

      case 'size': {
        if (!intent.target || intent.target.kind === 'all' || intent.target.kind === 'it') {
          const b = modelBounds(m);
          if (!b) return info('The model is empty.');
          return info(`The whole model is ${mm(b.maxX - b.minX)} mm wide, ${mm(b.maxY - b.minY)} mm deep and ${mm(b.maxZ - b.minZ)} mm tall.`);
        }
        const r = resolve(intent.target, ctx);
        if (r.note) notes.push(r.note);
        return { ...info(`${labelWithName(r.part)} is ${partSize(r.part)}.`), touched: r.part.id };
      }

      case 'where': {
        const r = resolve(intent.target, ctx);
        if (r.note) notes.push(r.note);
        const p = r.part;
        const t = p.kind === 'hole' ? describePart(p, m, 'standard') : `${labelWithName(p)} is ${supportText(p, m)}.`;
        return { ...info(t, [`Its centre is at x ${mm(p.x)}, y ${mm(p.y)}; its bottom is at height ${mm(p.z)} mm.`]), touched: p.id };
      }

      case 'relation':
      case 'distance': {
        const a = resolve(intent.a, ctx), b = resolve(intent.b, ctx);
        for (const r of [a, b]) if (r.note) notes.push(r.note);
        if (a.part.id === b.part.id) fail('Those are the same part. Name two different parts.');
        const rel = a.part.kind === 'solid' && b.part.kind === 'solid' ? relationText(a.part, b.part) : null;
        const d = distanceBetween(a.part, b.part);
        const gapText = d.gap <= EPS ? 'They touch or overlap.' : `The gap between them is ${mm(d.gap)} mm${[d.gx && `${mm(d.gx)} left-right`, d.gy && `${mm(d.gy)} front-back`, d.gz && `${mm(d.gz)} up-down`].filter(Boolean).length > 1 ? ` (${[d.gx && `${mm(d.gx)} mm left to right`, d.gy && `${mm(d.gy)} mm front to back`, d.gz && `${mm(d.gz)} mm up and down`].filter(Boolean).join(', ')})` : ''}.`;
        const head = intent.type === 'relation'
          ? (rel ? `Yes: ${labelWithName(a.part)} is ${rel}.` : `No: ${labelWithName(a.part)} does not touch ${labelWithName(b.part)}.`)
          : gapText;
        const more = intent.type === 'relation' ? (rel ? [] : [gapText]) : [`Their centres are ${mm(d.centre)} mm apart.`];
        return info(head, more);
      }

      case 'check': {
        if (!solids(m).length) return info('The model is empty, so there is nothing to check.');
        const pr = problems(m);
        if (!pr.length) return info('No problems found. Every part rests on the build plate or on another part, and every hole has solid walls around it.');
        return { kind: 'info', text: `I found ${pr.length} possible problem${pr.length === 1 ? '' : 's'}.`, notes, warnings: pr.filter((p) => p.severity === 'warning').map((p) => p.text), details: pr.filter((p) => p.severity === 'info').map((p) => p.text) };
      }

      case 'unknown':
        return { kind: 'error', text: `Sorry, I didn't understand that. You could try: ${intent.suggestions.map((s) => `"${s}"`).join(', or ')}. Say "help" for all commands.`, notes, warnings: [], details: [] };

      default:
        return { kind: 'action', text: '', notes, warnings: [], details: [] };
    }
  } catch (e) {
    if (e instanceof AgentError) return { kind: 'error', text: e.message, notes, warnings: [], details: [] };
    throw e;
  }
}

const RESERVED = /^(?:part|hole|it|this|that|everything|all|model|step|the|a|an)\b/;
function validName(raw: string, m: Model, selfId?: number): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 30) fail('Names must be 1 to 30 characters.');
  if (RESERVED.test(name) || /^\d/.test(name)) fail(`"${name}" can't be used as a name because it sounds like a command word. Try a word like base, lid or handle.`);
  if (/^(?:box|cube|cylinder|sphere|cone|ball|plate|peg|rod|tube)s?$/.test(name)) fail(`"${name}" is a shape word, which would be confusing. Try a word like base, lid or handle.`);
  if (m.parts.some((p) => p.id !== selfId && p.name.toLowerCase() === name.toLowerCase())) fail(`Another part is already called ${name}.`);
  return name;
}

// ---------- move ----------

function move(intent: Extract<Intent, { type: 'move' }>, ctx: Ctx, notes: string[]): Reply {
  const m = ctx.model;
  const next = clone(m);
  const byId = (id: number) => next.parts.find((p) => p.id === id)!;

  if (intent.target?.kind === 'all') {
    if (!intent.dir) fail('I can move the whole model left, right, forward, back, up or down. For example: move everything left by 10.');
    const amount = intent.dir!.amount ?? 10;
    if (intent.dir!.amount === undefined) notes.push("You didn't say how far, so I moved it 10 mm.");
    let delta = amount * intent.dir!.sign;
    if (intent.dir!.axis === 'z' && delta < 0) {
      const minZ = Math.min(...solids(m).map((p) => p.z));
      if (minZ + delta < -EPS) { delta = -minZ; notes.push(`The model can't go below the build plate, so I moved it down ${mm(-delta)} mm instead of ${mm(amount)}.`); }
    }
    for (const p of next.parts) (p as unknown as Record<string, number>)[intent.dir!.axis] = r1((p as unknown as Record<string, number>)[intent.dir!.axis] + delta);
    return finishChange(m, next, `Moved the whole model ${intent.dir!.word} by ${mm(Math.abs(delta))} mm.`, notes, ctx.lastTouched ?? undefined, 'Move whole model', ctx.detail);
  }

  const r = resolve(intent.target, ctx);
  if (r.note) notes.push(r.note);
  const target = r.part;
  // Things that move along: the part's holes, and everything stacked on it.
  const group = target.kind === 'solid' ? stackAbove(m, target) : [target];
  const groupIds = new Set(group.map((p) => p.id));
  for (const h of holes(m)) if (h.holeOf !== undefined && groupIds.has(h.holeOf)) groupIds.add(h.id);
  const shift = (dx: number, dy: number, dz: number) => { for (const id of groupIds) { const p = byId(id); p.x = r1(p.x + dx); p.y = r1(p.y + dy); p.z = r1(p.z + dz); } };
  const riders = group.filter((p) => p.id !== target.id);
  const riderNote = () => { if (riders.length) notes.push(`${riders.map(labelWithName).join(' and ')} ${riders.length === 1 ? 'sits' : 'sit'} on it, so ${riders.length === 1 ? 'it' : 'they'} moved too.`); };

  let text: string;
  if (intent.dir) {
    let amount = intent.dir.amount;
    if (amount === undefined) { amount = 10; notes.push("You didn't say how far, so I moved it 10 mm."); }
    let d = amount * intent.dir.sign;
    if (intent.dir.axis === 'z' && d < 0 && target.kind === 'solid') {
      if (target.z + d < -EPS) { const nd = -target.z; notes.push(nd === 0 ? `${labelWithName(target)} is already on the build plate, so it can't go lower.` : `It can't go below the build plate, so I moved it down ${mm(-nd)} mm instead of ${mm(amount)}.`); d = nd; }
    }
    if (d === 0) return { kind: 'info', text: 'Nothing changed.', notes, warnings: [], details: [] };
    shift(intent.dir.axis === 'x' ? d : 0, intent.dir.axis === 'y' ? d : 0, intent.dir.axis === 'z' ? d : 0);
    const dirWord = { x: d < 0 ? 'left' : 'right', y: d < 0 ? 'forward (towards the front)' : 'back', z: d < 0 ? 'down' : 'up' }[intent.dir.axis];
    text = `Moved ${labelWithName(target)} ${dirWord} by ${mm(Math.abs(d))} mm.`;
  } else if (intent.place) {
    if (target.kind === 'hole') fail('To move a hole, say a direction, for example: move hole 1 left by 5.');
    if (intent.place.ref && group.length > 1) {
      const rr = resolve(intent.place.ref, ctx, 'solid');
      if (group.some((p) => p.id === rr.part.id && p.id !== target.id)) fail(`${labelWithName(rr.part)} is sitting on ${labelWithName(target)}, so I can't put ${labelWithName(target)} on it.`);
    }
    const p = placeRelative(intent.place, target, ctx, notes, target.id);
    shift(p.x - target.x, p.y - target.y, p.z - target.z);
    if (intent.place.side === 'under') liftToPlate(next, notes);
    text = `Moved ${labelWithName(target)} ${p.where}.`;
  } else if (intent.coords) {
    const c: Coords = intent.coords;
    shift((c.x ?? target.x) - target.x, (c.y ?? target.y) - target.y, (c.z ?? target.z) - target.z);
    const t = byId(target.id);
    text = `Moved ${labelWithName(target)} so its centre is at x ${mm(t.x)}, y ${mm(t.y)}, with its bottom at height ${mm(t.z)} mm.`;
  } else if (intent.centre !== undefined) {
    if (intent.centre === null || intent.centre.kind === 'all') {
      shift(-target.x, -target.y, 0);
      text = `Centred ${labelWithName(target)} on the build plate.`;
    } else {
      const rr = resolve(intent.centre, ctx, 'solid');
      if (rr.part.id === target.id) fail('A part cannot be centred on itself.');
      shift(rr.part.x - target.x, rr.part.y - target.y, 0);
      text = `Centred ${labelWithName(target)} on ${labelWithName(rr.part)} (left to right and front to back; its height did not change).`;
    }
  } else {
    return fail('Where should it go? For example: move part 2 left by 10, or move part 2 on top of part 1.');
  }
  riderNote();
  return finishChange(m, next, text, notes, target.id, `Move ${label(target)}`, ctx.detail);
}

// ---------- resize ----------

function resize(intent: Extract<Intent, { type: 'resize' }>, ctx: Ctx, notes: string[]): Reply {
  const m = ctx.model;
  if (intent.target?.kind === 'all') {
    const k = intent.delta?.scale ?? (intent.delta?.percent ? 1 + (intent.delta.sign * intent.delta.percent) / 100 : undefined);
    if (!k) fail('I can scale the whole model by a factor, for example: make everything twice as big, or scale everything by 1.5.');
    const factor = intent.delta!.sign < 0 && intent.delta!.scale ? (intent.delta!.scale > 1 ? 1 / intent.delta!.scale : intent.delta!.scale) : k!;
    const next = clone(m);
    const B = modelBounds(m)!;
    const cx = (B.minX + B.maxX) / 2, cy = (B.minY + B.maxY) / 2;
    for (const p of next.parts) {
      p.sx = r1(p.sx * factor); p.sy = r1(p.sy * factor); p.sz = r1(p.sz * factor);
      if (p.topD) p.topD = r1(p.topD * factor);
      p.x = r1(cx + (p.x - cx) * factor); p.y = r1(cy + (p.y - cy) * factor); p.z = r1(p.z * factor);
    }
    if (next.parts.some((p) => p.sx > MAX || p.sz > MAX || p.sx < 0.1)) fail(`That would make parts larger than ${MAX} mm or smaller than 0.1 mm.`);
    return finishChange(m, next, `Scaled the whole model by ${mm(factor)}.`, notes, ctx.lastTouched ?? undefined, 'Scale whole model', ctx.detail);
  }
  const r = resolve(intent.target, ctx);
  if (r.note) notes.push(r.note);
  const old = r.part;
  const next = clone(m);
  const p = next.parts.find((q) => q.id === old.id)!;
  const round = p.shape !== 'box';
  const changes: string[] = [];

  const setDim = (key: DimKey, v: number) => {
    if (!(v >= 0.1) || v > MAX) fail(`Sizes must be between 0.1 and ${MAX} mm; that would make it ${mm(v)} mm.`);
    v = r1(v);
    if (key === 'all') {
      const f = v / Math.max(p.sx, p.sy, p.sz);
      p.sx = r1(p.sx * f); p.sy = r1(p.sy * f); p.sz = r1(p.sz * f);
      return;
    }
    if (p.shape === 'sphere') { p.sx = p.sy = p.sz = v; return; }
    if (p.shape === 'hole') {
      if (key === 'h' || key === 'd') {
        const host = next.parts.find((x) => x.id === p.holeOf);
        if (host && v >= host.sz) { p.through = true; p.z = r1(host.z - 0.5); p.sz = r1(host.sz + 1); notes.push(`${labelWithName(host)} is ${mm(host.sz)} mm tall, so the hole now goes all the way through.`); }
        else { p.through = false; p.sz = r1(v + 0.5); }
        return;
      }
      p.sx = p.sy = v; return;
    }
    if (round && (key === 'w' || key === 'd' || key === 'diam')) {
      if (key !== 'diam') notes.push(`${labelWithName(p)} is round, so I changed its diameter.`);
      p.sx = p.sy = v; return;
    }
    if (key === 'w') p.sx = v; else if (key === 'd') p.sy = v; else if (key === 'h') p.sz = v; else { p.sx = p.sy = v; }
  };
  const holeDepth = () => { const host = next.parts.find((x) => x.id === p.holeOf); return p.through && host ? host.sz : p.sz - 0.5; };
  const get = (key: DimKey) => (p.shape === 'hole' && (key === 'h' || key === 'd') ? holeDepth() : key === 'w' || key === 'diam' ? p.sx : key === 'd' ? p.sy : key === 'h' ? p.sz : Math.max(p.sx, p.sy, p.sz));
  const dimName = (key: DimKey) => (p.shape === 'hole' && (key === 'h' || key === 'd') ? 'depth' : round && (key === 'w' || key === 'd' || key === 'diam') ? 'diameter' : { w: 'width', d: 'depth', h: 'height', diam: 'diameter', all: 'size' }[key]);

  if (intent.set) {
    const s = intent.set;
    const entries: [DimKey, number | undefined][] = [['w', s.w], ['d', s.d], ['h', s.h], ['diam', s.diam], ['all', s.all]];
    let any = false;
    for (const [k, v] of entries) if (v !== undefined) { const before = get(k); setDim(k, v); changes.push(`${dimName(k)} from ${mm(before)} to ${mm(get(k))} mm`); any = true; }
    if (!any && s.single !== undefined) fail('Which size should I change? For example: make part 1 50 wide, or set the height of part 1 to 30.');
  } else if (intent.delta) {
    const dl = intent.delta;
    const keys: DimKey[] = dl.key === 'all' ? (p.shape === 'box' ? ['w', 'd', 'h'] : p.shape === 'sphere' ? ['diam'] : ['diam', 'h']) : [dl.key];
    if (dl.amount === undefined && dl.scale === undefined && dl.percent === undefined) notes.push(`You didn't say how much, so I changed it by 20%.`);
    for (const k of keys) {
      const before = get(k);
      let v: number;
      if (dl.scale !== undefined) v = dl.sign < 0 ? (dl.scale > 1 ? before / dl.scale : before * dl.scale) : before * dl.scale;
      else if (dl.percent !== undefined) v = before * (1 + (dl.sign * dl.percent) / 100);
      else if (dl.amount !== undefined) v = before + dl.sign * dl.amount;
      else v = before * (dl.sign > 0 ? 1.2 : 0.8);
      if (v < 0.1) fail(`That would make the ${dimName(k)} ${mm(v)} mm, which is too small. It is ${mm(before)} mm now.`);
      setDim(k, v);
      changes.push(`${dimName(k)} from ${mm(before)} to ${mm(get(k))} mm`);
    }
  }
  if (!changes.length) fail('What should change? For example: make part 1 taller by 5, or make part 1 50 wide.');
  if (p.shape === 'cone' && p.topD !== undefined && p.topD >= p.sx) { p.topD = 0; notes.push('The cone top was wider than its new base, so I made it pointed.'); }

  // Keep things consistent: parts resting on top move with the new height; holes refit.
  const dz = p.sz - old.sz;
  if (p.kind === 'solid') {
    if (Math.abs(dz) > EPS) {
      const riders = stackAbove(m, old).filter((q) => q.id !== old.id);
      const riderIds = new Set(riders.map((q) => q.id));
      for (const h of holes(m)) if (h.holeOf !== undefined && riderIds.has(h.holeOf)) riderIds.add(h.id);
      for (const id of riderIds) { const q = next.parts.find((x) => x.id === id)!; q.z = r1(q.z + dz); }
      if (riders.length) notes.push(`${riders.map(labelWithName).join(' and ')} ${riders.length === 1 ? 'sits' : 'sit'} on top, so I moved ${riders.length === 1 ? 'it' : 'them'} ${dz > 0 ? 'up' : 'down'} ${mm(Math.abs(dz))} mm to keep ${riders.length === 1 ? 'it' : 'them'} resting on it.`);
    }
    for (const h of next.parts.filter((x) => x.holeOf === p.id)) {
      if (h.through) { h.z = r1(p.z - 0.5); h.sz = r1(p.sz + 1); }
      else { h.z = r1(h.z + dz); if (h.z < p.z) { h.z = r1(p.z - 0.5); h.sz = r1(p.sz + 1); h.through = true; notes.push(`${label(h)} is now deeper than the part, so it goes all the way through.`); } }
      if (h.sx >= Math.min(p.sx, p.sy)) notes.push(`${label(h)} (${mm(h.sx)} mm) is now as wide as the part; it would split it.`);
    }
  } else if (p.kind === 'hole') {
    const host = next.parts.find((x) => x.id === p.holeOf);
    if (host && !p.through) { p.z = r1(host.z + host.sz - p.sz + 0.5); if (p.z <= host.z) { p.through = true; p.z = r1(host.z - 0.5); p.sz = r1(host.sz + 1); notes.push(`${label(p)} is now deeper than ${labelWithName(host)}, so it goes all the way through.`); } }
  }
  return finishChange(m, next, `Changed ${labelWithName(p)}: ${changes.join('; ')}.`, notes, p.id, `Resize ${label(p)}`, ctx.detail);
}
