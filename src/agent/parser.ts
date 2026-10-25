// Rule-based command parser. Turns a typed or spoken sentence into an Intent.
// There is no LLM: the grammar is deliberately small and documented in the Help section.

import type { SolidShape } from '../model/types';

export type Ref =
  | { kind: 'solid'; n: number }
  | { kind: 'hole'; n: number }
  | { kind: 'name'; name: string }
  | { kind: 'shape'; shape: SolidShape | 'hole' }
  | { kind: 'it' }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'all' };

export type Side = 'on' | 'under' | 'left' | 'right' | 'front' | 'back';
export interface Spot { row: 'front' | 'back' | ''; col: 'left' | 'right' | '' }
export interface Placement { side: Side; ref: Ref | null; spot?: Spot }
export interface Coords { x?: number; y?: number; z?: number }

export interface Dims {
  w?: number; d?: number; h?: number; diam?: number; topD?: number; all?: number; single?: number;
}
export type DimKey = 'w' | 'd' | 'h' | 'diam' | 'all';

export type Intent =
  | { type: 'add'; shape: SolidShape; dims: Dims; place?: Placement; coords?: Coords; name?: string }
  | { type: 'hole'; diam?: number; depth?: number; target: Ref | null; spot?: Spot; coords?: Coords }
  | { type: 'move'; target: Ref | null; dir?: { axis: 'x' | 'y' | 'z'; sign: 1 | -1; amount?: number; word: string }; place?: Placement; coords?: Coords; centre?: Ref | null }
  | { type: 'resize'; target: Ref | null; set?: Dims; delta?: { key: DimKey; amount?: number; percent?: number; scale?: number; sign: 1 | -1; word: string } }
  | { type: 'delete'; target: Ref | null }
  | { type: 'rename'; target: Ref | null; name: string }
  | { type: 'describe'; target: Ref | null; detail?: 'brief' | 'standard' | 'detailed' }
  | { type: 'list' }
  | { type: 'size'; target: Ref | null }
  | { type: 'where'; target: Ref | null }
  | { type: 'relation'; a: Ref | null; b: Ref | null }
  | { type: 'distance'; a: Ref | null; b: Ref | null }
  | { type: 'check' }
  | { type: 'undo'; times: number }
  | { type: 'redo'; times: number }
  | { type: 'revert'; step: number }
  | { type: 'history' }
  | { type: 'help'; topic: string }
  | { type: 'repeat' }
  | { type: 'new' }
  | { type: 'confirm' }
  | { type: 'deny' }
  | { type: 'example'; name: string }
  | { type: 'export'; format: 'stl' | 'scad' | 'text' }
  | { type: 'listen' }
  | { type: 'detail'; level: 'brief' | 'standard' | 'detailed' }
  | { type: 'stop' }
  | { type: 'unknown'; suggestions: string[] };

export interface Parsed { intent: Intent; notes: string[]; normalized: string }

// ---------- normalisation ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Converts spoken numbers ("twenty five", "two point five", "one hundred") to digits. */
export function wordsToNumbers(s: string): string {
  // Protect pronoun uses of "one".
  s = s.replace(/\b(this|that|the|which|each|other|last|first|new|another|every|no|any) one\b/g, '$1 ONE_PRONOUN');
  s = s.replace(/\bone more\b/g, 'ONE_MORE');
  s = s.replace(/\ba (half|quarter)\b/g, (_, w) => (w === 'half' ? '0.5' : '0.25'));
  const words = s.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  const isNumWord = (w: string) => w in SMALL || w in TENS || w === 'hundred' || w === 'thousand';
  while (i < words.length) {
    const w = words[i];
    if (!isNumWord(w)) { out.push(w); i++; continue; }
    let total = 0, cur = 0, j = i, last = i;
    while (j < words.length) {
      const t = words[j];
      if (/^\s+$/.test(t)) { j++; continue; }
      if (t === 'and' && cur > 0 && j + 2 < words.length && isNumWord(words[j + 2])) { j++; continue; }
      if (t in SMALL) cur += SMALL[t];
      else if (t in TENS) cur += TENS[t];
      else if (t === 'hundred') cur = (cur || 1) * 100;
      else if (t === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
      else break;
      last = j; j++;
    }
    let value = String(total + cur);
    // decimals: "point five"
    let k = last + 1;
    while (k < words.length && /^\s+$/.test(words[k])) k++;
    if (words[k] === 'point') {
      let digits = '', m = k + 1;
      while (m < words.length) {
        if (/^\s+$/.test(words[m])) { m++; continue; }
        if (words[m] in SMALL && SMALL[words[m]] < 10) { digits += SMALL[words[m]]; last = m; m++; } else break;
      }
      if (digits) value += '.' + digits;
    }
    out.push(value);
    i = last + 1;
  }
  return out.join('').replace(/ONE_PRONOUN/g, 'one').replace(/ONE_MORE/g, 'one more');
}

export function normalize(raw: string): string {
  let s = ` ${raw.toLowerCase()} `;
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2');
  s = s.replace(/\s+/g, ' ');
  s = wordsToNumbers(s);
  s = s.replace(/(\d)\s*(?:x|×|\*)\s*(?=\d)/g, '$1 by ');
  s = s.replace(/\bmilli\s?met(?:er|re)s?\b|\bmils?\b|\bmms\b/g, 'mm');
  s = s.replace(/\bcenti\s?met(?:er|re)s?\b|\bcms\b/g, 'cm');
  s = s.replace(/(\d)\s*(?:inches|inch)\b/g, '$1 inch');
  s = s.replace(/(\d)\s*"/g, '$1 inch');
  s = s.replace(/\bcent(?:er|re)d?\b|\bmiddle\b/g, 'centre');
  s = s.replace(/\bper ?cent\b/g, '%');
  s = s.replace(/[!?;]+/g, ' ').replace(/,/g, ' ').replace(/\.(?!\d)/g, ' ');
  // Filler words
  s = s.replace(/^\s*(?:ok(?:ay)?|so|now|then|and|hey|um+|uh+|right)\b\s*/g, ' ');
  s = s.replace(/\b(?:please|can you|could you|would you|will you|i want to|i'd like to|i would like to|i want|i'd like|i would like|let's|lets|go ahead and|just|for me|thank you|thanks)\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

// ---------- numbers, refs, placements ----------

const NUM = String.raw`(-?\d+(?:\.\d+)?)\s*(mm|cm|inch)?`;

function toMM(v: string, unit: string | undefined, notes: string[]): number {
  const n = parseFloat(v);
  if (unit === 'cm') { notes.push(`I converted ${v} cm to ${n * 10} mm.`); return n * 10; }
  if (unit === 'inch') { const r = Math.round(n * 25.4 * 10) / 10; notes.push(`I converted ${v} inch${n === 1 ? '' : 'es'} to ${r} mm.`); return r; }
  return n;
}

const SHAPE_WORDS: [RegExp, SolidShape | 'hole'][] = [
  [/\b(?:box|cube|block|cuboid|plate|slab|brick|base plate|rectangle|square)s?\b/, 'box'],
  [/\b(?:cylinder|tube|rod|peg|pole|post|disc|disk|puck|pillar|column)s?\b/, 'cylinder'],
  [/\b(?:sphere|ball|globe|bead)s?\b/, 'sphere'],
  [/\b(?:cone|pyramid|spike)s?\b/, 'cone'],
  [/\b(?:hole|opening)s?\b/, 'hole'],
];

export function findShape(s: string): SolidShape | 'hole' | null {
  let best: { i: number; shape: SolidShape | 'hole' } | null = null;
  for (const [re, shape] of SHAPE_WORDS) {
    const m = re.exec(s);
    if (m && (!best || m.index < best.i)) best = { i: m.index, shape };
  }
  return best?.shape ?? null;
}

/** Finds the first reference to a part in s. `names` are user-given part names. */
export function parseRef(s: string, names: string[] = []): Ref | null {
  let m: RegExpExecArray | null;
  const cands: { i: number; ref: Ref }[] = [];
  if ((m = /\b(?:part|piece|shape|object) (?:number )?(\d+)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'solid', n: +m[1] } });
  if ((m = /\bhole (?:number )?(\d+)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'hole', n: +m[1] } });
  if ((m = /\b(?:number|#) ?(\d+)\b/.exec(s)) && !cands.length) cands.push({ i: m.index, ref: { kind: 'solid', n: +m[1] } });
  if ((m = /\b(?:the )?(first|1st) (?:part|one|shape|piece)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'first' } });
  if ((m = /\b(?:the )?(?:last|latest|newest|previous|most recent) (?:part|one|shape|piece)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'last' } });
  if ((m = /\b(?:everything|the whole (?:thing|model|design)|the (?:entire )?model|the design|all (?:the )?parts|all of it|whole model)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'all' } });
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    if (!name) continue;
    const re = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if ((m = re.exec(s))) cands.push({ i: m.index, ref: { kind: 'name', name } });
  }
  if (!cands.some((c) => c.ref.kind === 'name')) {
    for (const [re, shape] of SHAPE_WORDS) if ((m = re.exec(s))) cands.push({ i: m.index, ref: { kind: 'shape', shape } });
  }
  if ((m = /\b(?:it|this|that|this one|that one|the same one)\b/.exec(s))) cands.push({ i: m.index, ref: { kind: 'it' } });
  if (!cands.length) return null;
  cands.sort((a, b) => a.i - b.i);
  // Prefer explicit numbers/names over shape words at the same spot.
  return cands[0].ref;
}

const PLACE_RE = /\b(on top of|on to|onto|on|above|over|under(?:neath)?|below|beneath|to the left of|left of|on the left of|to the right of|right of|on the right of|in front of|to the front of|behind|at the back of|to the back of|next to|beside)\b/;
const SIDE_OF: Record<string, Side> = {
  'on top of': 'on', 'on to': 'on', onto: 'on', on: 'on', above: 'on', over: 'on',
  under: 'under', underneath: 'under', below: 'under', beneath: 'under',
  'to the left of': 'left', 'left of': 'left', 'on the left of': 'left',
  'to the right of': 'right', 'right of': 'right', 'on the right of': 'right', 'next to': 'right', beside: 'right',
  'in front of': 'front', 'to the front of': 'front', behind: 'back', 'at the back of': 'back', 'to the back of': 'back',
};

export function parseSpot(s: string): Spot | undefined {
  let m = /\b(?:at|in|on|near|to(?:wards)?) (?:the )?(front|back|rear)[ -]?(left|right)?(?: corner| edge| side| end)?\b/.exec(s);
  if (m) return { row: m[1] === 'rear' ? 'back' : (m[1] as 'front' | 'back'), col: (m[2] as 'left' | 'right') ?? '' };
  m = /\b(?:at|in|on|near|to(?:wards)?) (?:the )?(left|right)[ -]?(front|back)?(?: corner| edge| side| end)?\b/.exec(s);
  if (m) return { row: (m[2] as 'front' | 'back') ?? '', col: m[1] as 'left' | 'right' };
  if (/\b(?:at|in|on) (?:the )?centre\b|\bcentred\b/.test(s)) return { row: '', col: '' };
  return undefined;
}

export function parsePlacement(s: string, names: string[]): { place?: Placement; before: string } {
  const m = PLACE_RE.exec(s);
  if (!m) return { before: s };
  const after = s.slice(m.index + m[0].length);
  const ref = parseRef(after, names);
  // "on" alone needs a part after it ("put a peg on part 1"), otherwise it's not a placement.
  if (m[1] === 'on' && !ref) return { before: s };
  return { place: { side: SIDE_OF[m[1]], ref, spot: parseSpot(s) }, before: s.slice(0, m.index) };
}

export function parseCoords(s: string, notes: string[]): Coords | undefined {
  const c: Coords = {};
  for (const axis of ['x', 'y', 'z'] as const) {
    const m = new RegExp(String.raw`\b${axis}\s*(?:=|is|of)?\s*` + NUM).exec(s);
    if (m) c[axis] = toMM(m[1], m[2], notes);
  }
  return Object.keys(c).length ? c : undefined;
}

/** Remove refs, coordinates and step numbers so they aren't read as sizes. */
function stripNonSize(s: string): string {
  return s
    .replace(/\b(?:part|piece|shape|object|hole|step|number|#) ?(?:number )?\d+\b/g, ' ')
    .replace(/\b[xyz]\s*(?:=|is|of)?\s*-?\d+(?:\.\d+)?\s*(?:mm|cm|inch)?/g, ' ')
    .replace(/\b\d+\s*(?:times|x)\b/g, ' ');
}

export function parseDims(raw: string, notes: string[]): Dims {
  const s = stripNonSize(raw);
  const d: Dims = {};
  let m: RegExpExecArray | null;
  const three = new RegExp(`${NUM}\\s*by\\s*${NUM}\\s*by\\s*${NUM}`).exec(s);
  if (three) {
    d.w = toMM(three[1], three[2] ?? three[6], notes);
    d.d = toMM(three[3], three[4] ?? three[6], notes);
    d.h = toMM(three[5], three[6], notes);
    return d;
  }
  const two = new RegExp(`${NUM}\\s*by\\s*${NUM}`).exec(s);
  if (two) {
    d.w = toMM(two[1], two[2] ?? two[4], notes);
    d.d = toMM(two[3], two[4], notes);
    (d as Dims & { pair?: boolean }).pair = true;
  }
  const keyAfter = new RegExp(`${NUM}\\s*(wide|width|across|in diameter|diameter|thick|thickness|deep|depth|long|length|tall|high|height|radius|in radius)\\b`, 'g');
  const keyBefore = new RegExp(`\\b(width|diameter|radius|depth|length|height|thickness|size)\\s*(?:of|is|=|:|to|at)?\\s*${NUM}`, 'g');
  const found: [string, number][] = [];
  while ((m = keyAfter.exec(s))) found.push([m[3], toMM(m[1], m[2], notes)]);
  while ((m = keyBefore.exec(s))) found.push([m[1], toMM(m[2], m[3], notes)]);
  const hasLong = found.some(([k]) => k === 'long' || k === 'length');
  for (const [k, v] of found) {
    if (k === 'wide' || k === 'width') { if (hasLong) d.d = v; else d.w = v; }
    else if (k === 'across' || k === 'diameter' || k === 'in diameter') d.diam = v;
    else if (k === 'radius' || k === 'in radius') d.diam = v * 2;
    else if (k === 'deep' || k === 'depth') d.d = v;
    else if (k === 'long' || k === 'length') d.w = v;
    else if (k === 'tall' || k === 'high' || k === 'height' || k === 'thick' || k === 'thickness') d.h = v;
    else if (k === 'size') d.all = v;
  }
  const top = new RegExp(`(?:top (?:diameter|width)\\s*(?:of|is)?\\s*${NUM})|(?:${NUM}\\s*(?:wide |across )?at the top)`).exec(s);
  if (top) d.topD = top[1] ? toMM(top[1], top[2], notes) : toMM(top[3], top[4], notes);
  if (/\b(?:pointed|point at the top|sharp)\b/.test(s)) d.topD = 0;
  if ((m = new RegExp(`${NUM}\\s*(?:sided )?cube\\b|\\bcube (?:of |with sides? (?:of )?)?${NUM}`).exec(s))) d.all = toMM(m[1] ?? m[3], m[2] ?? m[4], notes);
  if (!Object.keys(d).length) {
    const single = new RegExp(`(?:^|\\s)${NUM}(?=\\s|$)`).exec(s);
    if (single) d.single = toMM(single[1], single[2], notes);
  }
  return d;
}

// ---------- suggestions ----------

const EXAMPLES = [
  'add a box 40 by 30 by 10',
  'add a cylinder 10 wide and 20 tall on top of part 1',
  'add a hole 5 mm wide through part 1',
  'move part 2 left by 10',
  'make part 1 taller by 5',
  'describe the model',
  'list parts',
  'undo',
  'check for problems',
  'help',
];

const VERBS = ['add', 'create', 'make', 'move', 'delete', 'remove', 'describe', 'undo', 'redo', 'help', 'list', 'rename', 'check', 'export', 'listen', 'resize', 'scale', 'drill', 'history', 'stop'];

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
    {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[a.length][b.length];
}

export function suggest(s: string): string[] {
  const first = s.split(' ')[0] ?? '';
  const close = VERBS.filter((v) => first && lev(first, v) <= Math.max(1, Math.ceil(v.length / 3))).sort((a, b) => lev(first, a) - lev(first, b));
  const fromVerb = close.flatMap((v) => EXAMPLES.filter((e) => e.startsWith(v === 'create' ? 'add' : v)));
  const shape = findShape(s);
  const fromShape = shape ? EXAMPLES.filter((e) => e.includes(shape)) : [];
  const out = [...new Set([...fromVerb, ...fromShape])];
  return (out.length ? out : ['add a box 40 by 30 by 10', 'describe the model', 'help']).slice(0, 3);
}

// ---------- main ----------

const ADD_VERB = /^(?:add|create|make|put|place|insert|build|draw|give me|i need|start with|new|another|one more)\b/;
const ARTICLE_SHAPE = /\b(?:a|an|another|one more|new|second|third|some|\d+(?:\.\d+)?\s*(?:mm|cm|inch)?(?: by \d+(?:\.\d+)?)*\s*(?:mm|cm|inch)?(?:\s*(?:wide|tall|high|long|deep|diameter|sided))?)\s+(?:\w+\s+){0,3}?(?:box|cube|block|cuboid|plate|slab|brick|rectangle|square|cylinder|tube|rod|peg|pole|post|disc|disk|puck|pillar|column|sphere|ball|globe|bead|cone|pyramid|spike)\b/;

export function parse(raw: string, names: string[] = []): Parsed {
  const notes: string[] = [];
  const s = normalize(raw);
  const done = (intent: Intent): Parsed => ({ intent, notes, normalized: s });
  let m: RegExpExecArray | null;

  if (!s) return done({ type: 'unknown', suggestions: suggest('') });
  if (/^(?:stop|cancel|halt|abort|never ?mind|wait)\b/.test(s)) return done({ type: 'stop' });
  if (/^(?:yes|yeah|yep|yup|confirm|confirmed|ok|okay|sure|do it|go ahead|correct|affirmative)\b/.test(s) || s === 'y') return done({ type: 'confirm' });
  if (/^(?:no|nope|nah|keep it|don't|do not|negative)\b/.test(s) || s === 'n') return done({ type: 'deny' });

  if ((m = /\b(?:undo|take that back|undo that|go back one|reverse that)\b(?:.*?(\d+) times)?/.exec(s)) && !/\bstep \d+/.test(s))
    return done({ type: 'undo', times: m[1] ? Math.min(+m[1], 50) : 1 });
  if ((m = /\bredo\b(?:.*?(\d+) times)?/.exec(s))) return done({ type: 'redo', times: m[1] ? Math.min(+m[1], 50) : 1 });
  if ((m = /\b(?:go back|revert|return|restore|jump|rewind)\b.*?\bstep (\d+)/.exec(s))) return done({ type: 'revert', step: +m[1] });
  if (/\b(?:history|what have i done|what did i do|list (?:of )?(?:changes|edits|steps)|show (?:the )?(?:changes|edits|steps)|edits so far|changes so far)\b/.test(s))
    return done({ type: 'history' });
  if ((m = /^(?:help|what can i (?:say|do)|commands|how do i|how to|instructions|tutorial)\b(.*)$/.exec(s))) return done({ type: 'help', topic: m[1].trim() });
  if (/^(?:repeat|say (?:that|it) again|what did you say|pardon|come again|again)\b/.test(s)) return done({ type: 'repeat' });
  if (/\b(?:start over|start again|new model|new design|clear (?:everything|all|the model|the design)|reset (?:the )?(?:model|design|everything)|delete everything|remove everything|blank model)\b/.test(s))
    return done({ type: 'new' });
  if (/\bexamples?\b/.test(s)) return done({ type: 'example', name: s.replace(/\b(?:load|open|show(?: me)?|try|use|give me|an?|the|examples?|of|called|named|please|model)\b/g, ' ').replace(/\s+/g, ' ').trim() });
  if (/\b(?:listen|play (?:the )?(?:sound|profile|audio|shape)|sonif|hear (?:the )?(?:shape|model|profile)|audio (?:profile|preview))/.test(s)) return done({ type: 'listen' });
  if ((m = /\b(?:export|download|save)\b(.*)$/.exec(s))) {
    const rest = m[1];
    const format = /\b(?:scad|openscad|code)\b/.test(rest) ? 'scad' : /\b(?:description|text|txt)\b/.test(rest) ? 'text' : 'stl';
    return done({ type: 'export', format });
  }
  if (/\b(?:be brief|less detail|shorter (?:answers|replies|descriptions)|brief mode|keep it short|briefly from now)\b/.test(s)) return done({ type: 'detail', level: 'brief' });
  if (/\b(?:more detail|be more detailed|detailed mode|in more detail from now|longer (?:answers|replies|descriptions)|full detail)\b/.test(s) && !/^describe/.test(s)) return done({ type: 'detail', level: 'detailed' });
  if (/\b(?:standard detail|normal detail|medium detail|normal mode)\b/.test(s)) return done({ type: 'detail', level: 'standard' });

  // ----- questions -----
  if ((m = /\b(?:distance|how far|gap|space)\b.*?\bbetween (.+?) and (.+)$/.exec(s)) || (m = /\bhow far (?:is|apart are) (.+?) (?:from|and) (.+)$/.exec(s)))
    return done({ type: 'distance', a: parseRef(m[1], names), b: parseRef(m[2], names) });
  if ((m = /^(?:is|are|does|do) (.+?) (?:touching|touch|on top of|on|above|under|below|left of|right of|in front of|behind|connected to|attached to|sitting on|resting on|next to) (.+)$/.exec(s)))
    return done({ type: 'relation', a: parseRef(m[1], names), b: parseRef(m[2], names) });
  if ((m = /^where(?:'s| is| are)? (.+)$/.exec(s))) return done({ type: 'where', target: parseRef(m[1], names) });
  if (/\b(?:check|any problems|problems|is it printable|printable|printability|can (?:it|this) (?:be )?print|errors|issues|anything wrong)\b/.test(s) && !ADD_VERB.test(s))
    return done({ type: 'check' });
  if (/\b(?:list (?:all )?(?:the )?parts|what parts|which parts|parts list|list everything|what(?:'s| is) in (?:the|my) (?:model|design)|how many parts)\b/.test(s) || /^parts$/.test(s))
    return done({ type: 'list' });
  if ((m = /\b(?:how (?:big|tall|wide|deep|high|long|thick|large)|what(?:'s| is| are) the (?:size|dimensions|measurements)|what size|dimensions|measurements|measure)\b(.*)$/.exec(s)))
    return done({ type: 'size', target: parseRef(m[1], names) });
  if ((m = /^(?:describe|description|tell me about|what does (?:it|the model|.+?) look like|what is|what's|read|explain|show)\b(.*)$/.exec(s))) {
    const rest = m[1];
    const detail = /\b(?:brief|briefly|short|quick|summary)\b/.test(s) ? 'brief' : /\b(?:detail|detailed|in detail|fully|everything|full)\b/.test(rest) && !/\beverything\b/.test(rest.replace(/in detail/, '')) ? 'detailed' : /\bin detail\b|\bdetailed\b/.test(rest) ? 'detailed' : undefined;
    const target = parseRef(rest.replace(/\b(?:in detail|detailed|briefly|brief)\b/g, ''), names);
    return done({ type: 'describe', target: target?.kind === 'all' ? null : target, detail });
  }

  // ----- edits -----
  if ((m = /^(?:delete|remove|erase|get rid of|take away|take off|discard)\b(.*)$/.exec(s))) return done({ type: 'delete', target: parseRef(m[1], names) });
  if ((m = /^(?:rename|call|name|label)\b (.+?)(?: to| as)? "?([a-z][\w -]{0,29}?)"?$/.exec(s))) {
    const target = parseRef(m[1], names) ?? parseRef(s.replace(/^\w+/, ''), names);
    const name = m[2].replace(/^(?:the )/, '').trim();
    return done({ type: 'rename', target, name });
  }

  // Holes
  if (/\b(?:hole|holes|drill|bore|opening|hollow out)\b/.test(s) && !/^(?:move|shift|slide|nudge|make the hole|make hole|resize|set|change|increase|decrease|enlarge|shrink|widen|scale|double|halve)\b/.test(s)) {
    const dm = new RegExp(`${NUM}\\s*(?:wide |diameter |across |radius )?(?:hole|opening)`).exec(s)
      ?? new RegExp(`(?:hole|opening|drill|bore)[^\\d]{0,20}?(?:of |with a? ?(?:diameter|width) (?:of )?)?${NUM}(?!\\s*(?:deep|depth))`).exec(s);
    const dims = parseDims(s.replace(/\b(?:deep|depth)\b.*$/, ''), []);
    let diam = dm ? toMM(dm[1], dm[2], notes) : dims.diam;
    if (/\bradius\b/.test(s) && dims.diam) diam = dims.diam;
    const dep = new RegExp(`${NUM}\\s*(?:deep|depth)|depth (?:of )?${NUM}`).exec(s);
    const depth = dep ? toMM(dep[1] ?? dep[3], dep[2] ?? dep[4], notes) : undefined;
    const tm = /\b(?:in|into|through|on|from)\b (.+)$/.exec(s);
    const target = tm ? parseRef(tm[1].replace(/\b(?:the )?(?:front|back|left|right|centre)[ -]?(?:left|right)?(?: corner| edge| side)?\b/g, ''), names) : null;
    return done({ type: 'hole', diam, depth, target: target?.kind === 'shape' && target.shape === 'hole' ? null : target, spot: parseSpot(s), coords: parseCoords(s, notes) });
  }

  const shape = findShape(s);
  const isAdd = (ADD_VERB.test(s) && ARTICLE_SHAPE.test(s)) || (!!shape && shape !== 'hole' && /^(?:a|an|another|one more|\d)/.test(s));
  if (isAdd && shape && shape !== 'hole') {
    const nm = /\b(?:called|named|labelled|labeled)\s+"?([a-z][\w -]{0,29}?)"?(?=\s+(?:on|at|under|below|above|to|in|behind|next|beside|with)\b|$)/.exec(s);
    const body = nm ? s.replace(nm[0], ' ') : s;
    const { place, before } = parsePlacement(body, names);
    const coords = parseCoords(body, notes);
    const dims = parseDims(place ? before : body, notes);
    return done({ type: 'add', shape, dims, place, coords, name: nm?.[1]?.trim() });
  }

  if ((m = /^(?:cent(?:re|er)|align)\b (.+?)(?: on| with| over| to)? (.+)$/.exec(s)) && /\bcentre\b|^align/.test(s)) {
    return done({ type: 'move', target: parseRef(m[1], names), centre: parseRef(m[2], names) });
  }
  if (/^centre\b/.test(s)) {
    const target = parseRef(s.replace(/^centre/, ''), names);
    return done({ type: 'move', target, centre: null });
  }

  const MOVE_VERB = /^(?:move|shift|slide|nudge|push|pull|put|place|position|raise|lower|drop|lift|bring|set|stack)\b/;
  const RESIZE_VERB = /^(?:make|set|change|resize|scale|increase|decrease|enlarge|shrink|double|halve|widen|lengthen|shorten|extend|grow|stretch|reduce|expand)\b/;
  const RESIZE_WORDS = /\b(?:wider|narrower|deeper|shallower|taller|shorter|higher|lower|thicker|thinner|fatter|longer|bigger|larger|smaller|size|width|depth|height|diameter|radius|thickness|length|tall|wide|deep|high|long|thick|twice|double|half|times|scale|%)\b/;

  if (MOVE_VERB.test(s) && !(/^(?:set)\b/.test(s) && RESIZE_WORDS.test(s))) {
    const word = /^lower\b/.test(s) && !/\bheight\b/.test(s) ? 'down' : /^(?:raise|lift)\b/.test(s) ? 'up' : /^drop\b/.test(s) ? 'down' : '';
    const { place, before } = parsePlacement(s, names);
    const target = parseRef(place ? before.replace(/^\w+/, '') : s.replace(/^\w+/, ''), names);
    const coords = parseCoords(s, notes);
    const dm = /\b(left|right|forwards?|front|backwards?|back|up|upwards|down|downwards|higher|lower)\b/.exec(place ? before : s.replace(/^\w+/, ''));
    const dirWord = dm?.[1] ?? word;
    if (place) return done({ type: 'move', target, place });
    if (coords) return done({ type: 'move', target, coords });
    if (dirWord) {
      const map: Record<string, ['x' | 'y' | 'z', 1 | -1]> = {
        left: ['x', -1], right: ['x', 1], forward: ['y', -1], forwards: ['y', -1], front: ['y', -1], back: ['y', 1], backward: ['y', 1], backwards: ['y', 1],
        up: ['z', 1], upwards: ['z', 1], higher: ['z', 1], down: ['z', -1], downwards: ['z', -1], lower: ['z', -1],
      };
      const [axis, sign] = map[dirWord];
      const am = new RegExp(NUM).exec(stripNonSize(s));
      const amount = am ? toMM(am[1], am[2], notes) : /^nudge\b/.test(s) ? 1 : undefined;
      return done({ type: 'move', target, dir: { axis, sign, amount: amount === undefined ? undefined : Math.abs(amount), word: dirWord } });
    }
    if (!/^(?:set)\b/.test(s)) return done({ type: 'unknown', suggestions: ['move part 2 left by 10', 'move part 2 on top of part 1', 'move part 2 to x 0 y 0'] });
  }

  if (RESIZE_VERB.test(s) || (RESIZE_WORDS.test(s) && parseRef(s, names))) {
    const target = parseRef(s.replace(/^\w+/, ''), names);
    const cm = /\b(wider|narrower|deeper|shallower|taller|shorter|higher|lower|thicker|thinner|fatter|longer|bigger|larger|smaller|widen|lengthen|shorten|enlarge|shrink|grow|expand|reduce|increase|decrease|double|halve|scale)\b/.exec(s);
    const sc = /\b(?:by (?:a factor of )?|times |x)?(\d+(?:\.\d+)?)\s*(?:times|x)\b|\b(twice|double|doubled|triple|half|halve|halved)\b|\bscale(?:d)?\b.*?\bby (\d+(?:\.\d+)?)(?!\s*(?:mm|cm|inch|%))/.exec(s);
    const pc = /\bby (\d+(?:\.\d+)?)\s*%/.exec(s);
    const by = new RegExp(`\\bby ${NUM}(?!\\s*%)`).exec(stripNonSize(s));
    const set = parseDims(s.replace(/\bby -?\d+(?:\.\d+)?\s*(?:mm|cm|inch|%)?/g, ' '), notes);
    const hasSet = Object.keys(set).some((k) => k !== 'single');
    if (cm || sc || pc) {
      const word = cm?.[1] ?? sc?.[2] ?? 'scale';
      const keyOf: Record<string, [DimKey, 1 | -1]> = {
        wider: ['w', 1], widen: ['w', 1], narrower: ['w', -1], deeper: ['d', 1], shallower: ['d', -1],
        taller: ['h', 1], higher: ['h', 1], shorter: ['h', -1], lower: ['h', -1], thicker: ['h', 1], thinner: ['h', -1], fatter: ['diam', 1],
        longer: ['w', 1], lengthen: ['w', 1], shorten: ['w', -1],
        bigger: ['all', 1], larger: ['all', 1], enlarge: ['all', 1], grow: ['all', 1], expand: ['all', 1], increase: ['all', 1],
        smaller: ['all', -1], shrink: ['all', -1], reduce: ['all', -1], decrease: ['all', -1],
        double: ['all', 1], halve: ['all', -1], scale: ['all', 1],
      };
      let [key, sign] = keyOf[word] ?? ['all', 1];
      // "increase the height by 5"
      const named = /\b(width|depth|height|diameter|thickness|length|radius)\b/.exec(s);
      if (named && (key === 'all')) key = ({ width: 'w', length: 'w', depth: 'd', height: 'h', thickness: 'h', diameter: 'diam', radius: 'diam' } as const)[named[1] as 'width'];
      let scale: number | undefined;
      if (sc) {
        const v = sc[1] ?? sc[3];
        if (v) scale = parseFloat(v);
        else scale = /twice|double/.test(sc[2]) ? 2 : sc[2] === 'triple' ? 3 : 0.5;
        if (/\bhalf|halve/.test(sc[2] ?? '')) sign = -1;
      }
      return done({ type: 'resize', target, delta: { key, sign, word, scale, percent: pc ? parseFloat(pc[1]) : undefined, amount: by && !scale ? toMM(by[1], by[2], notes) : undefined } });
    }
    if (hasSet) return done({ type: 'resize', target, set });
    if (set.single !== undefined) {
      const named = /\b(width|depth|height|diameter|thickness|length|radius|size)\b/.exec(s);
      if (named) {
        const key = ({ width: 'w', length: 'w', depth: 'd', height: 'h', thickness: 'h', diameter: 'diam', radius: 'diam', size: 'all' } as const)[named[1] as 'width'];
        return done({ type: 'resize', target, set: { [key]: named[1] === 'radius' ? set.single * 2 : set.single } });
      }
    }
  }

  // A bare shape word ("cube 20") is treated as add.
  if (shape && shape !== 'hole') {
    const { place, before } = parsePlacement(s, names);
    return done({ type: 'add', shape, dims: parseDims(place ? before : s, notes), place, coords: parseCoords(s, notes) });
  }
  return done({ type: 'unknown', suggestions: suggest(s) });
}
