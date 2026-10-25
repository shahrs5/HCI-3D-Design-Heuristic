import { holeText, holes, modelBounds, partSize, problems, sizeText, solids, supportText } from './geometry';
import { labelWithName, mm, SHAPE_NAMES, type Model, type Part } from './types';

export type Detail = 'brief' | 'standard' | 'detailed';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function overview(m: Model): string {
  const s = solids(m), h = holes(m);
  if (!s.length) return 'The model is empty. Add a shape to start, for example: add a box 40 by 30 by 10.';
  const counts = h.length ? `${plural(s.length, 'part')} and ${plural(h.length, 'hole')}` : plural(s.length, 'part');
  return `The model has ${counts}. Overall it is ${sizeText(modelBounds(m))}.`;
}

export function describePart(p: Part, m: Model, detail: Detail): string {
  if (p.kind === 'hole') {
    const t = `${labelWithName(p)}: ${holeText(p, m)}.`;
    return detail === 'detailed' ? `${t} Its centre is at x ${mm(p.x)}, y ${mm(p.y)}.` : t;
  }
  const head = `${labelWithName(p)}: ${SHAPE_NAMES[p.shape]}, ${partSize(p)}.`;
  if (detail === 'brief') return head;
  const where = supportText(p, m);
  const pos = detail === 'detailed' ? ` Its centre is at x ${mm(p.x)}, y ${mm(p.y)}, and its bottom is at height ${mm(p.z)} mm.` : '';
  return `${head} It is ${where}.${pos}`;
}

export function describeModel(m: Model, detail: Detail): string[] {
  const lines = [overview(m)];
  if (!solids(m).length) return lines;
  for (const p of m.parts) lines.push(describePart(p, m, detail));
  const pr = problems(m);
  if (pr.length) {
    if (detail === 'brief') lines.push(`${plural(pr.length, 'possible problem')} found. Say "check" to hear them.`);
    else for (const x of pr) lines.push(`${x.severity === 'warning' ? 'Warning' : 'Note'}: ${x.text}`);
  } else if (detail !== 'brief') lines.push('No printing problems found.');
  return lines;
}
