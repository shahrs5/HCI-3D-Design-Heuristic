// Sound cues (earcons) and the audio height profile (sonification).
import { solids, modelBounds } from './model/geometry';
import type { Model } from './model/types';

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, start: number, dur: number, gain = 0.08, type: OscillatorType = 'sine', pan = 0) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
  o.type = type; o.frequency.value = freq; p.pan.value = pan;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(p).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export type Cue = 'start' | 'done' | 'error' | 'listen' | 'stop';
export function cue(kind: Cue) {
  switch (kind) {
    case 'start': tone(440, 0, 0.08); tone(554, 0.09, 0.08); break;
    case 'done': tone(659, 0, 0.09); tone(880, 0.1, 0.14); break;
    case 'error': tone(220, 0, 0.16, 0.09, 'triangle'); tone(196, 0.17, 0.2, 0.09, 'triangle'); break;
    case 'listen': tone(880, 0, 0.1); break;
    case 'stop': tone(523, 0, 0.08); tone(392, 0.09, 0.12); break;
  }
}

/** Heights of the model along X (left to right), sampled `n` times. null = empty space. */
export function heightProfile(m: Model, n = 40): (number | null)[] {
  const b = modelBounds(m);
  if (!b) return [];
  const S = solids(m);
  const out: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const x = b.minX + ((i + 0.5) / n) * (b.maxX - b.minX);
    let top: number | null = null;
    for (const p of S) {
      const half = p.sx / 2;
      if (x < p.x - half || x > p.x + half) continue;
      let h = p.z + p.sz;
      if (p.shape === 'sphere') { const dx = (x - p.x) / half; h = p.z + p.sz / 2 + (p.sz / 2) * Math.sqrt(Math.max(0, 1 - dx * dx)); }
      if (p.shape === 'cone') { const f = Math.abs(x - p.x) / half; const topR = (p.topD ?? 0) / 2 / half; h = f <= topR ? p.z + p.sz : p.z + p.sz * (1 - (f - topR) / (1 - topR || 1)); }
      if (p.shape === 'cylinder') { /* full height across its width */ }
      top = Math.max(top ?? 0, h);
    }
    out.push(top);
  }
  return out;
}

/** Plays the profile left to right over ~4 s: higher pitch = taller; silence = gap. Returns duration in ms. */
export function playProfile(m: Model): number {
  const prof = heightProfile(m);
  const c = ac();
  if (!c || !prof.length) return 0;
  const max = Math.max(...prof.map((v) => v ?? 0)) || 1;
  const step = 0.1;
  tone(1200, 0, 0.05, 0.05, 'square', -1); // start tick (left)
  prof.forEach((h, i) => {
    if (h === null) return;
    const f = 220 * Math.pow(2, (2 * h) / max); // 220–880 Hz (two octaves)
    tone(f, 0.25 + i * step, step * 0.95, 0.07, 'sine', -1 + (2 * i) / (prof.length - 1));
  });
  tone(1200, 0.3 + prof.length * step, 0.05, 0.05, 'square', 1); // end tick (right)
  return Math.round((0.4 + prof.length * step) * 1000);
}
