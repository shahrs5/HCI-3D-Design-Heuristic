// Core data model. Units are millimetres.
// Axes: X = left (-) to right (+), Y = front (-) to back (+), Z = down to up. The build plate is Z = 0.

export type SolidShape = 'box' | 'cylinder' | 'sphere' | 'cone';
export type Shape = SolidShape | 'hole';

export interface Part {
  id: number; // internal, unique
  kind: 'solid' | 'hole';
  num: number; // user-facing number: "Part 2" or "Hole 1"; never reused
  name: string; // optional user name ('' if none)
  shape: Shape;
  sx: number; // size along X (width; diameter for round shapes)
  sy: number; // size along Y (depth)
  sz: number; // size along Z (height)
  topD?: number; // cone: top diameter (sx is the bottom diameter)
  x: number; // centre X
  y: number; // centre Y
  z: number; // bottom Z
  holeOf?: number; // hole: id of the solid it was cut into
  through?: boolean; // hole: goes all the way through its solid
}

export interface Model {
  parts: Part[];
  nextId: number;
  nextSolidNum: number;
  nextHoleNum: number;
}

export const emptyModel = (): Model => ({ parts: [], nextId: 1, nextSolidNum: 1, nextHoleNum: 1 });

export const SHAPE_NAMES: Record<Shape, string> = {
  box: 'box',
  cylinder: 'cylinder',
  sphere: 'sphere',
  cone: 'cone',
  hole: 'hole',
};

export function label(p: Part): string {
  return `${p.kind === 'hole' ? 'Hole' : 'Part'} ${p.num}`;
}

export function labelWithName(p: Part): string {
  return p.name ? `${label(p)} (${p.name})` : label(p);
}

export const isRound = (s: Shape) => s === 'cylinder' || s === 'sphere' || s === 'cone' || s === 'hole';

/** Format a millimetre value: at most one decimal, no trailing ".0". */
export function mm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString();
}
