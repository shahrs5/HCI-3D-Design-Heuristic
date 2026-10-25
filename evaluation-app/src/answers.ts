// Understands spoken or typed answers. Speech recognition often mishears short words
// ("for" for 4, "to" for 2, "tree" for 3), so those are accepted too.

export type Answer =
  | { kind: 'score'; value: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'na' }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'command'; command: Command }
  | { kind: 'text'; text: string }
  | { kind: 'silence' };

export type Command = 'repeat' | 'explain' | 'back' | 'pause' | 'faster' | 'slower' | 'next';

const clean = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

const COMMANDS: [RegExp, Command][] = [
  [/ (repeat|again|say (that|it) again|pardon|what did you say|come again|sorry what|read it again) /, 'repeat'],
  [/ (explain|help|what do the numbers mean|what does (that|it) mean|scale|what are the options|options|i don't understand) /, 'explain'],
  [/ (go back|back|previous|undo|change my (answer|last answer)) /, 'back'],
  [/ (pause|wait|hold on|stop|take a break) /, 'pause'],
  [/ (faster|speed up|speak faster|quicker) /, 'faster'],
  [/ (slower|slow down|speak slower|too fast) /, 'slower'],
  [/ (next|skip comment|move on|continue|nothing|no comment|nope|no thanks|that's it|that is all) /, 'next'],
];

/** For "0 to 4" questions. */
export function readScore(raw: string): Answer {
  const s = clean(raw);
  if (!s.trim()) return { kind: 'silence' };
  // A lone digit typed on the keyboard
  const t = s.trim();
  if (/^[0-4]$/.test(t)) return { kind: 'score', value: Number(t) as 0 };
  if (/^(n|na|\?)$/.test(t)) return { kind: 'na' };
  if (/^r$/.test(t)) return { kind: 'command', command: 'repeat' };
  if (/^(e|h)$/.test(t)) return { kind: 'command', command: 'explain' };
  if (/^b$/.test(t)) return { kind: 'command', command: 'back' };
  if (/ (not sure|unsure|don't know|do not know|no idea|unclear|n a|not applicable|doesn't apply|does not apply|skip|pass|can't say|cannot say|can't tell) /.test(s)) return { kind: 'na' };
  for (const [re, c] of COMMANDS) if (c !== 'next' && re.test(s)) return { kind: 'command', command: c };
  const scores: [RegExp, 0 | 1 | 2 | 3 | 4][] = [
    [/ (4|four|for|fore|catastrophe|catastrophic|disaster|terrible|worst) /, 4],
    [/ (3|three|tree|free|major|big problem|serious|bad) /, 3],
    [/ (2|two|to|too|minor|small problem|low priority) /, 2],
    [/ (1|one|won|cosmetic|tiny) /, 1],
    [/ (0|zero|oh|none|no problem|not a problem|fine|perfect|no issue|nothing wrong) /, 0],
  ];
  const hits = scores.filter(([re]) => re.test(s));
  if (hits.length === 1) return { kind: 'score', value: hits[0][1] };
  // "two or three" etc.: pick the number said last
  if (hits.length > 1) {
    let best: { i: number; v: 0 | 1 | 2 | 3 | 4 } | null = null;
    for (const [re, v] of hits) { const m = re.exec(s); if (m && (!best || m.index > best.i)) best = { i: m.index, v }; }
    if (best) return { kind: 'score', value: best.v };
  }
  return { kind: 'text', text: raw.trim() };
}

/** For yes / no / not sure questions. */
export function readYesNo(raw: string): Answer {
  const s = clean(raw);
  if (!s.trim()) return { kind: 'silence' };
  const t = s.trim();
  if (/^(y)$/.test(t)) return { kind: 'yes' };
  if (/^(n)$/.test(t)) return { kind: 'no' };
  if (/^(\?|u|ns)$/.test(t)) return { kind: 'na' };
  for (const [re, c] of COMMANDS) if (c !== 'next' && re.test(s)) return { kind: 'command', command: c };
  if (/ (not sure|unsure|don't know|do not know|couldn't tell|could not tell|can't tell|no idea|maybe|kind of|partly) /.test(s)) return { kind: 'na' };
  if (/ (yes|yeah|yep|yup|correct|it did|it matched|right|sure|i think so|affirmative) /.test(s)) return { kind: 'yes' };
  if (/ (no|nope|nah|it didn't|it did not|incorrect|wrong|not really|negative) /.test(s)) return { kind: 'no' };
  return { kind: 'text', text: raw.trim() };
}

/** For free answers (comments, reasons, other problems). */
export function readFree(raw: string): Answer {
  const s = clean(raw);
  if (!s.trim()) return { kind: 'silence' };
  const t = s.trim();
  if (/^(n|next|no|nope|nothing|no comment|no thanks|skip|that's it|that is all|nothing else|none|no more)$/.test(t)) return { kind: 'command', command: 'next' };
  if (/^(r|repeat|again|say that again|pardon)$/.test(t)) return { kind: 'command', command: 'repeat' };
  if (/^(b|back|go back|previous)$/.test(t)) return { kind: 'command', command: 'back' };
  if (/^(pause|wait|hold on|stop)$/.test(t)) return { kind: 'command', command: 'pause' };
  if (/^(faster|slower)$/.test(t)) return { kind: 'command', command: t as Command };
  return { kind: 'text', text: raw.trim() };
}
