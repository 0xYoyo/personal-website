// Scene shapes → local targets for one group (wave 3 SHOW): px at scale 1 around the group's pivot (y up),
// sampled once per scene; the per-frame pose is applied by the backends. `w` carries the reveal hash.
import type { SceneShape } from '@yoyo/protocol';
import { frameTargets, shapeTargets, stageCentre, type Viewport } from './shapes';
import { groupCounts } from './perform';
import { hash01, rng } from './hash';

/** The free stage's centre (world px) and half extents (px): the frame of stage units. */
export function stageFrame(vp: Viewport): { cx: number; cy: number; hw: number; hh: number } {
  const c = stageCentre(vp);
  const s = vp.stage;
  return s ? { cx: c.x, cy: c.y, hw: s.w / 2, hh: s.h / 2 } : { cx: c.x, cy: c.y, hw: vp.w / 2, hh: vp.h / 2 };
}

export interface LocalTargets {
  /** n × [x, y, z, reveal] (local px, y up; reveal ∈ [0, 1)) */
  pos: Float32Array;
  /** n × [r, g, b, colorful] */
  col: Float32Array;
}

function fillRect(n: number, w: number, h: number, seed: number): Float32Array {
  const out = new Float32Array(n * 4);
  const r = rng(seed);
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(h, 1))));
  const rows = Math.max(1, Math.ceil(n / cols));
  for (let i = 0; i < n; i++) {
    const cx = i % cols, cy = Math.floor(i / cols);
    out[i * 4] = ((cx + r()) / cols - 0.5) * w;
    out[i * 4 + 1] = ((cy + r()) / rows - 0.5) * h;
    out[i * 4 + 2] = (r() - 0.5) * 6;
  }
  return out;
}

/** Sample `n` local targets for a scene shape in layout `vp`. */
export async function sceneShapeTargets(shape: SceneShape, n: number, vp: Viewport, seed = 1): Promise<LocalTargets> {
  const pos = new Float32Array(n * 4), col = new Float32Array(n * 4);
  if (n <= 0) return { pos, col };
  const F = stageFrame(vp);
  switch (shape.kind) {
    case 'bar': {
      const w = Math.max(8, shape.w * F.hw * 2), h = Math.max(8, shape.h * F.hh * 2);
      const rect = { x: vp.w / 2 - w / 2, y: vp.h / 2 - h / 2, w, h };
      const t = frameTargets(n, rect, vp, shape.thickness ?? 9, Math.min(h / 2, 22), 11 + seed);
      for (let i = 0; i < n; i++) {
        pos[i * 4] = t.pos[i * 4]!; pos[i * 4 + 1] = t.pos[i * 4 + 1]!; pos[i * 4 + 2] = 0; pos[i * 4 + 3] = hash01(i, 91 + seed);
      }
      return { pos, col };
    }
    case 'rect': {
      const w = Math.max(4, shape.w * F.hw * 2), h = Math.max(4, shape.h * F.hh * 2);
      const p = fillRect(n, w, h, 13 + seed);
      for (let i = 0; i < n; i++) { pos.set(p.subarray(i * 4, i * 4 + 3), i * 4); pos[i * 4 + 3] = hash01(i, 92 + seed); }
      return { pos, col };
    }
    case 'parts': {
      const counts = groupCounts(n, shape.parts.map((p) => p.share));
      const tot = shape.parts.reduce((a, p) => a + p.share, 0) || 1;
      let at = 0, lo = 0;
      for (let k = 0; k < shape.parts.length; k++) {
        const part = shape.parts[k]!, m = counts[k]!;
        const hi = lo + part.share / tot;
        const sub = await sceneShapeTargets(part.shape, m, vp, seed * 31 + k + 1);
        const sc = part.scale ?? 1, ox = (part.x ?? 0) * F.hw, oy = -(part.y ?? 0) * F.hh;
        let x0 = Infinity, x1 = -Infinity;
        for (let j = 0; j < m; j++) { x0 = Math.min(x0, sub.pos[j * 4]!); x1 = Math.max(x1, sub.pos[j * 4]!); }
        for (let j = 0; j < m; j++) {
          const o = (at + j) * 4, s = j * 4;
          pos[o] = ox + sub.pos[s]! * sc; pos[o + 1] = oy + sub.pos[s + 1]! * sc; pos[o + 2] = sub.pos[s + 2]! * sc;
          const u = part.reveal === 'x' ? (sub.pos[s]! - x0) / Math.max(x1 - x0, 1) * 0.999 : sub.pos[s + 3]!;
          pos[o + 3] = lo + (hi - lo) * Math.min(0.999, Math.max(0, u));
          col.set(sub.col.subarray(s, s + 4), o);
        }
        at += m; lo = hi;
      }
      return { pos, col };
    }
    default: {
      const t = await shapeTargets(shape, n, vp);
      if (!t) return { pos, col };
      for (let i = 0; i < n; i++) {
        pos[i * 4] = t.pos[i * 4]! - t.cx; pos[i * 4 + 1] = t.pos[i * 4 + 1]! - t.cy; pos[i * 4 + 2] = t.pos[i * 4 + 2]!;
        pos[i * 4 + 3] = hash01(i, 93 + seed);
      }
      if (t.colored) col.set(t.col);
      return { pos, col };
    }
  }
}
