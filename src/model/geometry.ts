import { label, labelWithName, mm, type Model, type Part } from './types';

export const EPS = 0.05;

export interface Box3 { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export function bounds(p: Part): Box3 {
  return {
    minX: p.x - p.sx / 2, maxX: p.x + p.sx / 2,
    minY: p.y - p.sy / 2, maxY: p.y + p.sy / 2,
    minZ: p.z, maxZ: p.z + p.sz,
  };
}

export const solids = (m: Model) => m.parts.filter((p) => p.kind === 'solid');
export const holes = (m: Model) => m.parts.filter((p) => p.kind === 'hole');

export function modelBounds(m: Model): Box3 | null {
  const s = solids(m);
  if (!s.length) return null;
  const b = s.map(bounds);
  return {
    minX: Math.min(...b.map((v) => v.minX)), maxX: Math.max(...b.map((v) => v.maxX)),
    minY: Math.min(...b.map((v) => v.minY)), maxY: Math.max(...b.map((v) => v.maxY)),
    minZ: Math.min(...b.map((v) => v.minZ)), maxZ: Math.max(...b.map((v) => v.maxZ)),
  };
}

export function sizeText(b: Box3 | null): string {
  if (!b) return 'empty';
  return `${mm(b.maxX - b.minX)} mm wide, ${mm(b.maxY - b.minY)} mm deep and ${mm(b.maxZ - b.minZ)} mm tall`;
}

export function sizeShort(b: Box3 | null): string {
  if (!b) return 'empty';
  return `${mm(b.maxX - b.minX)} × ${mm(b.maxY - b.minY)} × ${mm(b.maxZ - b.minZ)} mm`;
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Overlap of footprints (XY). Positive = shared area width/depth. */
export function footprintOverlap(a: Box3, b: Box3) {
  return { x: overlap1(a.minX, a.maxX, b.minX, b.maxX), y: overlap1(a.minY, a.maxY, b.minY, b.maxY) };
}

export type Relation =
  | { kind: 'on'; spot: string } // a rests on top of b
  | { kind: 'under' }
  | { kind: 'beside'; side: 'left' | 'right' | 'front' | 'back' } // a is on that side of b, touching
  | { kind: 'overlaps' }
  | { kind: 'none' };

/** Spatial relation of a relative to b (solids, bounding-box based). */
export function relation(a: Part, b: Part): Relation {
  const A = bounds(a), B = bounds(b);
  const f = footprintOverlap(A, B);
  const zo = overlap1(A.minZ, A.maxZ, B.minZ, B.maxZ);
  if (f.x > EPS && f.y > EPS && Math.abs(A.minZ - B.maxZ) <= EPS) return { kind: 'on', spot: spotOn(a, b) };
  if (f.x > EPS && f.y > EPS && Math.abs(A.maxZ - B.minZ) <= EPS) return { kind: 'under' };
  if (f.x > EPS && f.y > EPS && zo > EPS) return { kind: 'overlaps' };
  if (zo > EPS) {
    if (f.y > EPS && Math.abs(A.maxX - B.minX) <= EPS) return { kind: 'beside', side: 'left' };
    if (f.y > EPS && Math.abs(A.minX - B.maxX) <= EPS) return { kind: 'beside', side: 'right' };
    if (f.x > EPS && Math.abs(A.maxY - B.minY) <= EPS) return { kind: 'beside', side: 'front' };
    if (f.x > EPS && Math.abs(A.minY - B.maxY) <= EPS) return { kind: 'beside', side: 'back' };
  }
  return { kind: 'none' };
}

/** Where a's centre sits on b's top face, in words (3 × 3 grid). */
export function spotOn(a: Part, b: Part): string {
  const B = bounds(b);
  const fx = (a.x - B.minX) / (B.maxX - B.minX || 1);
  const fy = (a.y - B.minY) / (B.maxY - B.minY || 1);
  const col = fx < 0.34 ? 'left' : fx > 0.66 ? 'right' : '';
  const row = fy < 0.34 ? 'front' : fy > 0.66 ? 'back' : '';
  if (!col && !row) return 'centred';
  if (col && row) return `at the ${row}-${col} corner`;
  return `towards the ${row || col} edge`;
}

export const touching = (r: Relation) => r.kind !== 'none';

/** Solids resting directly on top of p. */
export function resting(m: Model, p: Part): Part[] {
  return solids(m).filter((q) => q.id !== p.id && relation(q, p).kind === 'on');
}

/** p plus everything stacked on it (recursively). */
export function stackAbove(m: Model, p: Part, seen = new Set<number>()): Part[] {
  if (seen.has(p.id)) return [];
  seen.add(p.id);
  return [p, ...resting(m, p).flatMap((q) => stackAbove(m, q, seen))];
}

/** Relation of a to b as a phrase that follows "is", e.g. "on top of Part 1, centred". */
export function relationText(a: Part, b: Part): string | null {
  const r = relation(a, b);
  const bl = labelWithName(b);
  switch (r.kind) {
    case 'on': return `on top of ${bl}, ${r.spot}`;
    case 'under': return `directly under ${bl}`;
    case 'beside': return r.side === 'front' ? `in front of ${bl}, touching it` : r.side === 'back' ? `behind ${bl}, touching it` : `to the ${r.side} of ${bl}, touching it`;
    case 'overlaps': return `overlapping ${bl}, so they merge into one solid`;
    default: return null;
  }
}

/** All relations of a solid to the others, as phrases that follow "is". */
export function allRelations(p: Part, m: Model): string[] {
  return solids(m).filter((q) => q.id !== p.id).map((q) => relationText(p, q)).filter((t): t is string => !!t && !t.startsWith('directly under'));
}

/** Where a hole is on its solid. */
export function holeText(h: Part, m: Model): string {
  const host = m.parts.find((p) => p.id === h.holeOf);
  const how = h.through ? 'goes all the way through' : `goes ${mm(h.sz)} mm down into`;
  if (!host) return `${mm(h.sx)} mm wide hole`;
  const spot = spotOn(h, host);
  return `${mm(h.sx)} mm diameter, ${how} ${labelWithName(host)} from the top, ${spot === 'centred' ? 'at its centre' : spot}`;
}

export function partSize(p: Part): string {
  switch (p.shape) {
    case 'box': return `${mm(p.sx)} mm wide, ${mm(p.sy)} mm deep, ${mm(p.sz)} mm tall`;
    case 'cylinder': return `${mm(p.sx)} mm diameter, ${mm(p.sz)} mm tall`;
    case 'sphere': return `${mm(p.sx)} mm diameter`;
    case 'cone': return `${mm(p.sx)} mm diameter at the base, ${mm(p.topD ?? 0)} mm at the top, ${mm(p.sz)} mm tall`;
    case 'hole': return `${mm(p.sx)} mm diameter, ${mm(p.sz)} mm deep`;
  }
}

export function partSizeShort(p: Part): string {
  switch (p.shape) {
    case 'box': return `${mm(p.sx)} × ${mm(p.sy)} × ${mm(p.sz)}`;
    case 'cylinder': return `⌀${mm(p.sx)} × ${mm(p.sz)}`;
    case 'sphere': return `⌀${mm(p.sx)}`;
    case 'cone': return `⌀${mm(p.sx)} to ⌀${mm(p.topD ?? 0)} × ${mm(p.sz)}`;
    case 'hole': return `⌀${mm(p.sx)} × ${mm(p.sz)} deep`;
  }
}

/** Plain-text spoken version of partSizeShort (no symbols). */
export function partSizeSpoken(p: Part): string {
  return partSize(p);
}

/** Where a solid is, as a phrase that follows "is": plate and/or relations to other parts. */
export function supportText(p: Part, m: Model): string {
  const rels = allRelations(p, m);
  const onPlate = Math.abs(p.z) <= EPS;
  if (onPlate) return ['on the build plate', ...rels].join('; ');
  if (rels.length) return rels.join('; ');
  return `floating ${mm(p.z)} mm above the build plate`;
}

export function distanceBetween(a: Part, b: Part) {
  const A = bounds(a), B = bounds(b);
  const gap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
  const gx = gap(A.minX, A.maxX, B.minX, B.maxX);
  const gy = gap(A.minY, A.maxY, B.minY, B.maxY);
  const gz = gap(A.minZ, A.maxZ, B.minZ, B.maxZ);
  return {
    gap: Math.hypot(gx, gy, gz),
    gx, gy, gz,
    centre: Math.hypot(a.x - b.x, a.y - b.y, a.z + a.sz / 2 - (b.z + b.sz / 2)),
  };
}

export interface Problem { severity: 'warning' | 'info'; text: string; partId?: number }

/** Printability and consistency checks. */
export function problems(m: Model): Problem[] {
  const out: Problem[] = [];
  const S = solids(m);
  for (const p of S) {
    const b = bounds(p);
    if (b.minZ < -EPS) out.push({ severity: 'warning', partId: p.id, text: `${labelWithName(p)} goes ${mm(-b.minZ)} mm below the build plate, so that part would be cut off.` });
    const supported = Math.abs(b.minZ) <= EPS || S.some((q) => q.id !== p.id && touching(relation(p, q)));
    if (!supported) out.push({ severity: 'warning', partId: p.id, text: `${labelWithName(p)} is floating: it does not touch the build plate or any other part.` });
    for (const q of S) {
      if (q.id === p.id || relation(p, q).kind !== 'on') continue;
      const B = bounds(q);
      if (p.x < B.minX || p.x > B.maxX || p.y < B.minY || p.y > B.maxY)
        out.push({ severity: 'warning', partId: p.id, text: `${labelWithName(p)} hangs over the edge of ${labelWithName(q)}: its centre is off the supporting surface.` });
    }
  }
  for (const h of holes(m)) {
    const host = m.parts.find((p) => p.id === h.holeOf);
    const H = bounds(h);
    const cuts = S.filter((s) => { const f = footprintOverlap(H, bounds(s)); const z = overlap1(H.minZ, H.maxZ, s.z, s.z + s.sz); return f.x > EPS && f.y > EPS && z > EPS; });
    if (!cuts.length) { out.push({ severity: 'warning', partId: h.id, text: `${label(h)} does not cut into anything.` }); continue; }
    if (host) {
      const B = bounds(host);
      const wall = Math.min(H.minX - B.minX, B.maxX - H.maxX, H.minY - B.minY, B.maxY - H.maxY);
      const cover = S.find((q) => q.id !== host.id && relation(q, host).kind === 'on' && (() => { const f = footprintOverlap(H, bounds(q)); return f.x > EPS && f.y > EPS; })());
      if (h.z + h.sz <= host.z + host.sz + 0.6 && cover) out.push({ severity: 'warning', partId: h.id, text: `${label(h)} is covered: ${labelWithName(cover)} sits over its opening on top of ${labelWithName(host)}.` });
      if (wall < 0) out.push({ severity: 'warning', partId: h.id, text: `${label(h)} breaks out through the side of ${labelWithName(host)}.` });
      else if (wall < 1.2) out.push({ severity: 'warning', partId: h.id, text: `The wall next to ${label(h)} is only ${mm(wall)} mm thick; under 1.2 mm may not print well.` });
    }
  }
  for (const a of S) for (const b of S)
    if (a.id < b.id && relation(a, b).kind === 'overlaps')
      out.push({ severity: 'info', partId: b.id, text: `${labelWithName(b)} overlaps ${labelWithName(a)}, so they merge into one solid.` });
  // Separate pieces (connected components of touching solids)
  if (S.length > 1) {
    const parent = new Map(S.map((s) => [s.id, s.id]));
    const find = (i: number): number => (parent.get(i) === i ? i : find(parent.get(i)!));
    for (const a of S) for (const b of S) if (a.id < b.id && touching(relation(a, b))) parent.set(find(a.id), find(b.id));
    const groups = new Set(S.map((s) => find(s.id))).size;
    if (groups > 1) out.push({ severity: 'info', text: `The model is ${groups} separate pieces that do not touch each other.` });
  }
  return out;
}
