// The show's performance primitives (wave 3 SHOW): particle groups with their own shape, pose over time,
// brightness and fill; trails; split / merge reassignment. Pure functions (unit-tested); the controller
// drives them and the backends apply the per-group transforms per particle (GPU kernel / cpu.ts).
import type { Keys, Path, PathKey, Scene, SceneGroup } from '@yoyo/protocol';
import { hash01 } from './hash';

/** Groups a scene may have; the canvas2d tier keeps at most LITE_GROUPS. */
export const MAX_GROUPS = 6;
export const LITE_GROUPS = 3;
/** Trail history samples per group (the trail particles interpolate their pose along them). */
export const HIST = 8;

/**
 * Group data, uploaded every frame as an 8 × GROUP_TEXELS float RGBA texture (one row per group):
 *  0: pose (x, y world px, rot world rad (ccw), scale)
 *  1: look (sx, brightness, fill, active)
 *  2: the previous frame's pose, 3: its look — the kernel differences them into the shape's own velocity
 *  4 … 4 + HIST − 1: trail history, oldest last: (x, y, rot, scale · sx) at time − u · trailMs, u = k / (HIST − 1)
 */
export const GROUP_TEXELS = 16;
export const GROUP_ROWS = 8;
export const GROUP_FLOATS = GROUP_ROWS * GROUP_TEXELS * 4;
export const T_POSE = 0, T_LOOK = 1, T_PREV = 2, T_PREV_LOOK = 3, T_HIST = 4;

/** Per-particle group info (n × vec4): group (−1 = none), trail slot u (0 = not a trail particle), reveal hash, 0. */
export const NO_GROUP = -1;

export interface Pose { x: number; y: number; rot: number; scale: number; sx: number }

export function ease(kind: PathKey['ease'], f: number): number {
  const x = Math.min(1, Math.max(0, f));
  switch (kind) {
    case 'linear': return x;
    case 'in': return x * x * x;
    case 'out': return 1 - (1 - x) ** 3;
    case 'back': { const c = 1.70158, c3 = c + 1; return 1 + c3 * (x - 1) ** 3 + c * (x - 1) ** 2; }
    default: return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
  }
}

/** Pose at `t` ms along a path (stage units). Before the first key / after the last it holds. */
export function evalPath(path: Path | undefined, t: number): Pose {
  const def = (k: PathKey): Pose => ({ x: k.x, y: k.y, rot: k.rot ?? 0, scale: k.scale ?? 1, sx: k.sx ?? 1 });
  if (!path || !path.length) return { x: 0, y: 0, rot: 0, scale: 1, sx: 1 };
  if (t <= path[0]!.t || path.length === 1) return def(path[0]!);
  for (let i = 1; i < path.length; i++) {
    const b = path[i]!;
    if (t <= b.t) {
      const a = path[i - 1]!;
      const f = ease(b.ease, (t - a.t) / Math.max(b.t - a.t, 1e-6));
      const A = def(a), B = def(b);
      return { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f, rot: A.rot + (B.rot - A.rot) * f, scale: A.scale + (B.scale - A.scale) * f, sx: A.sx + (B.sx - A.sx) * f };
    }
  }
  return def(path[path.length - 1]!);
}

/** A number, or keys sampled at `t` (linear, held outside). */
export function evalKeys(k: number | Keys | undefined, t: number, dflt: number): number {
  if (k === undefined) return dflt;
  if (typeof k === 'number') return k;
  if (!k.length) return dflt;
  if (t <= k[0]!.t) return k[0]!.v;
  for (let i = 1; i < k.length; i++) {
    const b = k[i]!;
    if (t <= b.t) { const a = k[i - 1]!; return a.v + (b.v - a.v) * ((t - a.t) / Math.max(b.t - a.t, 1e-6)); }
  }
  return k[k.length - 1]!.v;
}

/** At or under this many particles (a phone's 2D tier) a scene sheds its followers (POSTFIX4 E2). */
export const TINY_SCENE = 2500;

/**
 * The scene a tier performs: the canvas2d tier takes `lite` when given, and never more than LITE_GROUPS groups.
 * At a phone's 2k (`n` ≤ TINY_SCENE) the followers go too — a group repeating an earlier group's shape with a
 * smaller share (the small karts behind the big one) — so the lead shape gets their particles and reads.
 */
export function sceneFor(scene: Scene, lite: boolean, n = Infinity): Scene {
  const s = lite && scene.lite ? scene.lite : scene;
  const max = lite ? LITE_GROUPS : MAX_GROUPS;
  let groups = s.groups.slice(0, max).map((g) => (lite ? { ...g, trail: 0 } : g));
  if (n <= TINY_SCENE && groups.length > 1) {
    const key = (g: SceneGroup): string => JSON.stringify(g.shape);
    groups = groups.filter((g, k) => !groups.slice(0, k).some((h) => key(h) === key(g) && h.share > g.share));
  }
  return { ...s, groups };
}

/** Particles per group (largest remainder over the normalised shares; every group gets at least one). */
export function groupCounts(n: number, shares: readonly number[]): number[] {
  const tot = shares.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const raw = shares.map((s) => (Math.max(s, 0) / tot) * n);
  const out = raw.map((r) => Math.max(n >= shares.length ? 1 : 0, Math.floor(r)));
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length) { out[order[k]![1]]!++; left--; }
  for (let k = out.length - 1; left < 0; k = (k - 1 + out.length) % out.length) { if (out[k]! > 1) { out[k]!--; left++; } }
  return out;
}

/**
 * Hash partition: particle i belongs to the first group whose cumulative share passes hash01(i). Stable: the
 * same shares always give the same partition, and a particle never changes group while they stay the same.
 * Group sizes follow `groupCounts` exactly (the hash orders the particles; the counts cut that order).
 */
export function partition(n: number, shares: readonly number[], seed = 77): Uint8Array {
  const counts = groupCounts(n, shares);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash01(a, seed) - hash01(b, seed));
  const g = new Uint8Array(n);
  let k = 0, c = 0;
  for (const i of order) {
    while (k < counts.length - 1 && c >= counts[k]!) { k++; c = 0; }
    g[i] = k; c++;
  }
  return g;
}

/**
 * Split / merge: assign each particle to a group by nearness (capacity = the group counts). `prev` = where the
 * particles are held now (world xy, stride 4); `groups` = each new group's world targets (stride 4) at the
 * scene's first pose. Distances are to each group's centre, in units of its radius, so a big group does not
 * swallow its neighbours; the particles with the clearest preference choose first (regret order).
 */
export function reassign(prev: Float32Array, n: number, groups: readonly Float32Array[], counts: readonly number[]): Uint8Array {
  const G = groups.length;
  const cx = new Float64Array(G), cy = new Float64Array(G), rr = new Float64Array(G);
  groups.forEach((t, k) => {
    const m = t.length / 4;
    let sx = 0, sy = 0;
    for (let j = 0; j < m; j++) { sx += t[j * 4]!; sy += t[j * 4 + 1]!; }
    cx[k] = sx / Math.max(m, 1); cy[k] = sy / Math.max(m, 1);
    let s2 = 0;
    for (let j = 0; j < m; j++) s2 += (t[j * 4]! - cx[k]!) ** 2 + (t[j * 4 + 1]! - cy[k]!) ** 2;
    rr[k] = Math.sqrt(s2 / Math.max(m, 1)) + 24;
  });
  const d = new Float32Array(n * G);
  const regret = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let b1 = Infinity, b2 = Infinity;
    for (let k = 0; k < G; k++) {
      const v = Math.hypot(prev[i * 4]! - cx[k]!, prev[i * 4 + 1]! - cy[k]!) / rr[k]!;
      d[i * G + k] = v;
      if (v < b1) { b2 = b1; b1 = v; } else if (v < b2) b2 = v;
    }
    regret[i] = G > 1 ? b2 - b1 : 0;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => regret[b]! - regret[a]! || a - b);
  const left = counts.slice();
  const out = new Uint8Array(n);
  for (const i of order) {
    let best = -1, bv = Infinity;
    for (let k = 0; k < G; k++) if (left[k]! > 0 && d[i * G + k]! < bv) { bv = d[i * G + k]!; best = k; }
    if (best < 0) best = 0;
    out[i] = best; left[best]!--;
  }
  return out;
}

/**
 * Spatially coherent pairing of m particles with m targets: both sets are cut into √m columns by x and each
 * column ordered by y (alternating direction), so neighbours go to neighbours and the move reads as one flow.
 * Returns for every particle (by its position in `who`) the index of its target.
 */
export function matchSlots(who: readonly number[], prev: Float32Array, targets: Float32Array): Int32Array {
  const m = who.length;
  const ord = (xy: (j: number) => [number, number]): number[] => {
    const idx = Array.from({ length: m }, (_, j) => j).sort((a, b) => xy(a)[0] - xy(b)[0] || a - b);
    const cols = Math.max(1, Math.round(Math.sqrt(m)));
    const per = Math.ceil(m / cols);
    const out: number[] = [];
    for (let c = 0; c < cols; c++) {
      const col = idx.slice(c * per, (c + 1) * per).sort((a, b) => (xy(a)[1] - xy(b)[1]) * (c % 2 ? -1 : 1) || a - b);
      out.push(...col);
    }
    return out;
  };
  const P = ord((j) => [prev[who[j]! * 4]!, prev[who[j]! * 4 + 1]!]);
  const T = ord((j) => [targets[j * 4]!, targets[j * 4 + 1]!]);
  const res = new Int32Array(m);
  for (let k = 0; k < m; k++) res[P[k]!] = T[k]!;
  return res;
}

/** Stage-units pose → world: stage centre (cx, cy world px), half extents (hw, hh px); +y down, rot clockwise. */
export function poseToWorld(p: Pose, cx: number, cy: number, hw: number, hh: number): Pose {
  return { x: cx + p.x * hw, y: cy - p.y * hh, rot: -p.rot, scale: p.scale, sx: p.sx };
}

/** Apply a world pose to a local point (px at scale 1, y up). Same formula in the GPU kernel and cpu.ts. */
export function applyPose(x: number, y: number, z: number, pose: Pose, out: Float32Array | number[], o = 0): void {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const lx = x * pose.scale * pose.sx, ly = y * pose.scale;
  out[o] = pose.x + lx * c - ly * s;
  out[o + 1] = pose.y + lx * s + ly * c;
  out[o + 2] = z * pose.scale;
}

/** A recorded pose history (for trails): times (s) and world poses, a ring. */
export class PoseHistory {
  private t: number[] = [];
  private p: Pose[] = [];
  constructor(private keep = 2.5) {}
  push(time: number, pose: Pose): void {
    this.t.push(time); this.p.push({ ...pose });
    while (this.t.length > 2 && this.t[0]! < time - this.keep) { this.t.shift(); this.p.shift(); }
  }
  /** Pose at `time` (linear between records; clamped to the oldest / newest). */
  at(time: number): Pose {
    const T = this.t, P = this.p;
    if (!T.length) return { x: 0, y: 0, rot: 0, scale: 1, sx: 1 };
    if (time <= T[0]!) return P[0]!;
    for (let i = T.length - 1; i > 0; i--) {
      if (time >= T[i - 1]!) {
        if (time >= T[i]!) return P[i]!;
        const f = (time - T[i - 1]!) / Math.max(T[i]! - T[i - 1]!, 1e-6), a = P[i - 1]!, b = P[i]!;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, rot: a.rot + (b.rot - a.rot) * f, scale: a.scale + (b.scale - a.scale) * f, sx: a.sx + (b.sx - a.sx) * f };
      }
    }
    return P[0]!;
  }
  clear(): void { this.t = []; this.p = []; }
}

/** Write one group's row of the group data texture. */
export function writeGroup(data: Float32Array, g: number, pose: Pose, prev: Pose, bright: number, fill: number, prevSx: number, hist: readonly Pose[]): void {
  const row = g * GROUP_TEXELS * 4;
  const put = (texel: number, a: number, b: number, c: number, d: number): void => {
    const o = row + texel * 4; data[o] = a; data[o + 1] = b; data[o + 2] = c; data[o + 3] = d;
  };
  put(T_POSE, pose.x, pose.y, pose.rot, pose.scale);
  put(T_LOOK, pose.sx, bright, fill, 1);
  put(T_PREV, prev.x, prev.y, prev.rot, prev.scale);
  put(T_PREV_LOOK, prevSx, 0, 0, 0);
  for (let k = 0; k < HIST; k++) { const h = hist[k] ?? pose; put(T_HIST + k, h.x, h.y, h.rot, h.scale * h.sx); }
}

/** A scene group's fill / brightness at `t` ms. */
export function groupLook(g: SceneGroup, t: number): { fill: number; bright: number } {
  return { fill: Math.min(1, Math.max(0, evalKeys(g.fill, t, 1))), bright: Math.max(0, evalKeys(g.brightness, t, 1)) };
}
