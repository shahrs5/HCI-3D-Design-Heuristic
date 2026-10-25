// Builds three.js geometry from the model (Z-up), with holes cut by CSG. Shared by preview and STL export.
import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { bounds, footprintOverlap, holes, solids, EPS } from './model/geometry';
import type { Model, Part } from './model/types';

export function partGeometry(p: Part): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (p.shape) {
    case 'box': g = new THREE.BoxGeometry(p.sx, p.sy, p.sz); break;
    case 'sphere': g = new THREE.SphereGeometry(p.sx / 2, 48, 24); break;
    case 'cone': g = new THREE.CylinderGeometry((p.topD ?? 0) / 2, p.sx / 2, p.sz, 48); g.rotateX(Math.PI / 2); break;
    default: g = new THREE.CylinderGeometry(p.sx / 2, p.sx / 2, p.sz, 48); g.rotateX(Math.PI / 2); break;
  }
  g.translate(p.x, p.y, p.z + p.sz / 2);
  // CSG needs matching attributes; drop UVs.
  g.deleteAttribute('uv');
  return g;
}

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal'];
evaluator.useGroups = false;

function cuts(h: Part, s: Part) {
  const H = bounds(h), S = bounds(s);
  const f = footprintOverlap(H, S);
  return f.x > EPS && f.y > EPS && Math.min(H.maxZ, S.maxZ) - Math.max(H.minZ, S.minZ) > EPS;
}

/** One geometry per solid, with every intersecting hole subtracted. */
export function solidGeometries(m: Model): { part: Part; geometry: THREE.BufferGeometry }[] {
  const H = holes(m);
  return solids(m).map((s) => {
    const myHoles = H.filter((h) => cuts(h, s));
    if (!myHoles.length) return { part: s, geometry: partGeometry(s) };
    try {
      let brush = new Brush(partGeometry(s));
      brush.updateMatrixWorld();
      for (const h of myHoles) {
        const hb = new Brush(partGeometry(h));
        hb.updateMatrixWorld();
        brush = evaluator.evaluate(brush, hb, SUBTRACTION);
      }
      return { part: s, geometry: brush.geometry };
    } catch {
      return { part: s, geometry: partGeometry(s) };
    }
  });
}

/** Binary STL of the whole model (union of solids minus holes). */
export function modelToSTL(m: Model): ArrayBuffer | null {
  const S = solids(m);
  if (!S.length) return null;
  let brush = new Brush(partGeometry(S[0]));
  brush.updateMatrixWorld();
  for (const s of S.slice(1)) {
    const b = new Brush(partGeometry(s));
    b.updateMatrixWorld();
    brush = evaluator.evaluate(brush, b, ADDITION);
  }
  for (const h of holes(m)) {
    const b = new Brush(partGeometry(h));
    b.updateMatrixWorld();
    brush = evaluator.evaluate(brush, b, SUBTRACTION);
  }
  const mesh = new THREE.Mesh(brush.geometry);
  const out = new STLExporter().parse(mesh, { binary: true }) as unknown as DataView;
  return out.buffer as ArrayBuffer;
}
