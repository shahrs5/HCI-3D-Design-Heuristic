import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { partGeometry, solidGeometries } from './mesh';
import { holes, modelBounds } from './model/geometry';
import { overview } from './model/describe';
import { label, type Model } from './model/types';

export type View = 'iso' | 'front' | 'top' | 'right';
export const VIEW_NAMES: Record<View, string> = { iso: 'Angled', front: 'Front', top: 'Top', right: 'Right side' };
const VIEW_TEXT: Record<View, string> = {
  iso: 'from the front-right, looking slightly down',
  front: 'from the front',
  top: 'from directly above, with the front at the bottom of the picture',
  right: 'from the right side',
};

// Distinct colours for parts (also numbered on screen, so colour is never the only cue).
const LIGHT = ['#2f6fd6', '#d9822b', '#3c9a5f', '#b04fb0', '#c2423f', '#5f6b7a', '#1f9aa8', '#a07b1f'];
const CONTRAST = ['#ffd400', '#00e5ff', '#ff6ec7', '#7CFC00', '#ffffff', '#ffa500', '#87cefa', '#ff4d4d'];

interface Props { model: Model; view: View; zoom: number; showLabels: boolean; theme: 'light' | 'dark' | 'contrast' }

export default function Preview({ model, view, zoom, showLabels, theme }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState<{ key: string; text: string; x: number; y: number; kind: string }[]>([]);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: Math.max(240, Math.min(520, Math.round(el.clientWidth * 0.66))) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, preserveDrawingBuffer: true });
    } catch {
      setFailed(true);
      return;
    }
    const { w, h } = size;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    const bg = theme === 'light' ? '#f4f6f8' : theme === 'dark' ? '#1b1f24' : '#000000';
    const edgeColor = theme === 'light' ? '#111111' : '#ffffff';
    renderer.setClearColor(bg);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(60, -80, 120);
    scene.add(dir);

    const b = modelBounds(model) ?? { minX: -25, maxX: 25, minY: -25, maxY: 25, minZ: 0, maxZ: 20 };
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, cz = (b.minZ + b.maxZ) / 2;
    const extent = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ, 20);

    // Build plate grid (10 mm squares)
    const gridSize = Math.ceil((extent * 2.2) / 10) * 10;
    const grid = new THREE.GridHelper(gridSize, gridSize / 10, theme === 'light' ? 0x9aa3ad : 0x55606b, theme === 'light' ? 0xd0d5da : 0x2c333a);
    grid.rotateX(Math.PI / 2);
    grid.position.set(Math.round(cx / 10) * 10, Math.round(cy / 10) * 10, -0.01);
    scene.add(grid);

    const palette = theme === 'contrast' ? CONTRAST : LIGHT;
    const lineMat = new THREE.LineBasicMaterial({ color: edgeColor });
    for (const { part, geometry } of solidGeometries(model)) {
      const mat = new THREE.MeshStandardMaterial({ color: palette[(part.num - 1) % palette.length], roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      scene.add(new THREE.Mesh(geometry, mat));
      // Outline from the clean (uncut) shape: CSG triangulation would add stray lines.
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(partGeometry(part), 25), lineMat));
    }
    // Hole outlines: a circle where each hole opens on the top surface.
    for (const hp of holes(model)) {
      const host = model.parts.find((q) => q.id === hp.holeOf);
      const zTop = host ? host.z + host.sz + 0.05 : hp.z + hp.sz;
      const pts = Array.from({ length: 49 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return new THREE.Vector3(hp.x + Math.cos(a) * hp.sx / 2, hp.y + Math.sin(a) * hp.sx / 2, zTop); });
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }

    const aspect = w / h;
    const half = (extent * 0.85) / zoom;
    const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -5000, 5000);
    const dist = extent * 4;
    const dirs: Record<View, [number, number, number]> = { iso: [1, -1.3, 0.9], front: [0, -1, 0], top: [0, 0, 1], right: [1, 0, 0] };
    const d = new THREE.Vector3(...dirs[view]).normalize();
    cam.up.set(0, view === 'top' ? 1 : 0, view === 'top' ? 0 : 1);
    cam.position.set(cx + d.x * dist, cy + d.y * dist, cz + d.z * dist);
    cam.lookAt(cx, cy, cz);
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);

    // Screen-space labels (decorative; the same information is in the text description)
    const project = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(cam);
      return { x: ((v.x + 1) / 2) * 100, y: ((1 - v.y) / 2) * 100 };
    };
    const L: { key: string; text: string; x: number; y: number; kind: string }[] = [];
    for (const p of model.parts) {
      if (p.kind === 'hole') continue;
      const s = project(p.x, p.y, view === 'top' ? p.z + p.sz : p.z + p.sz / 2);
      L.push({ key: `p${p.id}`, text: String(p.num), ...s, kind: 'part' });
    }
    for (const hh of holes(model)) {
      const s = project(hh.x, hh.y, hh.z + hh.sz);
      L.push({ key: `h${hh.id}`, text: `H${hh.num}`, ...s, kind: 'hole' });
    }
    const m = gridSize / 2;
    const gx = grid.position.x, gy = grid.position.y;
    if (view !== 'front') L.push({ key: 'front', text: 'Front', ...project(gx, gy - m * 0.95, 0), kind: 'dir' });
    if (view !== 'right') { L.push({ key: 'left', text: 'Left', ...project(gx - m * 0.95, gy, 0), kind: 'dir' }); }
    if (view === 'top' || view === 'iso') L.push({ key: 'back', text: 'Back', ...project(gx, gy + m * 0.95, 0), kind: 'dir' });
    if (view !== 'right') L.push({ key: 'right', text: 'Right', ...project(gx + m * 0.95, gy, 0), kind: 'dir' });
    if (view === 'right') { L.push({ key: 'f2', text: 'Front', ...project(gx, gy - m * 0.95, 0), kind: 'dir' }); L.push({ key: 'b2', text: 'Back', ...project(gx, gy + m * 0.95, 0), kind: 'dir' }); }
    setLabels(L.filter((l) => l.x > 2 && l.x < 98 && l.y > 2 && l.y < 98));

    return () => {
      scene.traverse((o) => { const mesh = o as THREE.Mesh; mesh.geometry?.dispose?.(); const mat = mesh.material as THREE.Material | undefined; mat?.dispose?.(); });
      renderer.dispose();
    };
  }, [model, view, zoom, size, theme]);

  const ov = overview(model);
  const partNames = model.parts.length ? ` Labels on the picture: ${model.parts.map((p) => (p.kind === 'hole' ? `H${p.num} is ${label(p)}` : `${p.num} is ${label(p)}`)).join(', ')}.` : '';
  const alt = `${VIEW_NAMES[view]} view of the model, seen ${VIEW_TEXT[view]}. ${ov}${partNames}`;

  return (
    <figure className="preview" aria-labelledby="preview-caption">
      <div className="preview-canvas" ref={wrap} style={{ height: size.h }}>
        {failed ? (
          <p className="preview-fallback">The visual preview is not available in this browser (WebGL is turned off). Everything it shows is also in the Model section.</p>
        ) : (
          <canvas ref={canvas} role="img" aria-label={alt} width={size.w} height={size.h} />
        )}
        {showLabels && !failed && (
          <div className="preview-labels" aria-hidden="true">
            {labels.map((l) => (
              <span key={l.key} className={`plabel plabel-${l.kind}`} style={{ left: `${l.x}%`, top: `${l.y}%` }}>{l.text}</span>
            ))}
          </div>
        )}
      </div>
      <figcaption id="preview-caption">
        <strong>{VIEW_NAMES[view]} view</strong>, seen {VIEW_TEXT[view]}. {ov} Each part is a different colour and is labelled with its number; holes are labelled H1, H2 and so on. The grid squares are 10 mm.
      </figcaption>
    </figure>
  );
}
