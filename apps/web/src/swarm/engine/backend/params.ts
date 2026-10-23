/** Everything a backend needs to simulate one frame. Produced by the controller, consumed by gpu.ts / cpu.ts. */
export interface SimParams {
  time: number; dt: number;
  // knit / release
  phaseStart: number; spread: number; ramp: number; goal: number; prevGoal: number; transit: number;
  selectFrac: number; // particles with seed.w < selectFrac take part in target attraction (frame density)
  shapeCx: number; shapeCy: number; targetScale: number; rotY: number; spinOn: number;
  ringLevel: number; ringOn: number;
  // free flight
  flowAmp: number; flowFreq: number; speedMin: number; speedMax: number; wild: number;
  align: number; sep: number; coh: number; cruise: number; waveAmp: number;
  /** how fast velocity relaxes toward the curl flow (1/s): higher = the flow shears the flock into ribbons */
  flowRate: number;
  /** point leader (the whole flock, outside idle) */
  leaderX: number; leaderY: number; leaderW: number;
  /** dead-zone radius of the leader pull, × min(halfW, halfH) */
  leadR: number;
  /**
   * Idle trails (0..1 blend with the point leader): each of 3 sub-flocks follows the trail of its own leader
   * on a Lissajous path around (snakeCx, snakeCy): x = ax·sin(wx·τ + px), y = ay·sin(wy·τ + py). A particle's
   * target is that path at τ = time − u·snakeLag (u = its slot along the trail), offset across it by up to
   * snakeW px (tapered at the tips) — so the flock is ribbons that stretch, fold, cross and split.
   */
  snake: number; snakeCx: number; snakeCy: number; snakeLag: number; snakeW: number;
  g0ax: number; g0ay: number; g0wx: number; g0wy: number; g0px: number; g0py: number; g0ox: number; g0oy: number;
  g1ax: number; g1ay: number; g1wx: number; g1wy: number; g1px: number; g1py: number; g1ox: number; g1oy: number;
  g2ax: number; g2ay: number; g2wx: number; g2wy: number; g2px: number; g2py: number; g2ox: number; g2oy: number;
  /** density cap: above densCap (× densRef) particles are pushed down the density gradient with capK */
  densCap: number; capK: number;
  /** rest-density pull: below densCap particles climb the smooth density gradient with restK (sharp-edged body) */
  restK: number;
  vortexW: number; vortexR: number; vortexCx: number; vortexCy: number; vortexSpeed: number; vortexFlat: number;
  // interaction
  pointerX: number; pointerY: number; pointerVx: number; pointerVy: number; pointerR: number; pointerOn: number;
  burst: number; burstX: number; burstY: number;
  halfW: number; halfH: number;
  /** keep-out rects (world px: centre + half size; hw ≤ 0 = unused), soft repulsion within koMargin px */
  ko0x: number; ko0y: number; ko0w: number; ko0h: number;
  ko1x: number; ko1y: number; ko1w: number; ko1h: number;
  ko2x: number; ko2y: number; ko2w: number; ko2h: number;
  ko3x: number; ko3y: number; ko3w: number; ko3h: number;
  ko4x: number; ko4y: number; ko4w: number; ko4h: number;
  ko5x: number; ko5y: number; ko5w: number; ko5h: number;
  koOn: number; koMargin: number;
  /** soft box free flight is kept in (world px): centre + half size */
  boundCx: number; boundCy: number; boundHw: number; boundHh: number;
  freeze: number; snap: number;
  // look
  pulse: number; brightness: number; camX: number; camY: number; sizeScale: number;
  /** free-flight brightness (shape particles stay at 1) and the share of dim, set-back "far" particles */
  freeDim: number; farFrac: number;
  /** held-shape exposure (dense shapes are dimmed so glyph edges stay readable) and frame-build glow */
  shapeExpo: number; frameGlow: number;
  /** bloom strength multiplier (dense held shapes bloom less, so text stays crisp) */
  bloomK: number;
}

/**
 * Exposure for a held shape (POLISH1 B5). Under additive blending a shape's brightness grows with its particle
 * density × per-particle alpha; dense text ("dana" at 40k) saturates into a white blob and the bloom smears it.
 * The coverage estimate uses the GPU's per-particle alpha (count- and viewport-normalised, see gpu.ts resize);
 * the result scales held-particle brightness and (squared-ish) the bloom strength.
 */
export function shapeExposure(n: number, areaPx: number, vpW: number, vpH: number): number {
  const alpha = Math.min(0.85, 0.62 * Math.sqrt((20000 / n) * ((vpW * vpH) / (1440 * 900))));
  const cover = (n / Math.max(areaPx, 1)) * alpha * 2.5 * 2.5; // ≈ mean sprite area (px²) × alpha per px²
  return Math.min(1, Math.max(0.4, SHAPE_COVER / cover));
}
export const SHAPE_COVER = 1.6;

/** Filled area (px²) of a target set, on a 6 px grid (x, y only). */
export function targetArea(pos: Float32Array, n: number, cell = 6): number {
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) seen.add((Math.floor(pos[i * 4]! / cell) + 4096) * 8192 + Math.floor(pos[i * 4 + 1]! / cell) + 4096);
  return seen.size * cell * cell;
}

/** Number of keep-out rects the kernels honour. */
export const MAX_KEEPOUT = 6;

export function defaultParams(): SimParams {
  return {
    time: 0, dt: 1 / 60,
    phaseStart: -100, spread: 0.6, ramp: 0.35, goal: 0, prevGoal: 0, transit: 0, selectFrac: 1.01,
    shapeCx: 0, shapeCy: 0, targetScale: 1, rotY: 0, spinOn: 0, ringLevel: 0, ringOn: 0,
    flowAmp: 150, flowFreq: 1 / 900, speedMin: 40, speedMax: 340, wild: 0,
    align: 0.7, sep: 80, coh: 260, cruise: 230, waveAmp: 0.25, flowRate: 0.25,
    leaderX: 0, leaderY: 0, leaderW: 1.2, leadR: 0.35,
    snake: 0, snakeCx: 0, snakeCy: 0, snakeLag: 2.2, snakeW: 60,
    g0ax: 0, g0ay: 0, g0wx: 1, g0wy: 1, g0px: 0, g0py: 0, g0ox: 0, g0oy: 0, g1ax: 0, g1ay: 0, g1wx: 1, g1wy: 1, g1px: 0, g1py: 0, g1ox: 0, g1oy: 0,
    g2ax: 0, g2ay: 0, g2wx: 1, g2wy: 1, g2px: 0, g2py: 0, g2ox: 0, g2oy: 0,
    densCap: 100, capK: 0, restK: 0,
    vortexW: 0, vortexR: 120, vortexCx: 0, vortexCy: 0, vortexSpeed: 420, vortexFlat: 0,
    pointerX: 1e5, pointerY: 1e5, pointerVx: 0, pointerVy: 0, pointerR: 90, pointerOn: 0,
    burst: 0, burstX: 0, burstY: 0,
    halfW: 640, halfH: 360,
    ko0x: 0, ko0y: 0, ko0w: -1, ko0h: -1, ko1x: 0, ko1y: 0, ko1w: -1, ko1h: -1,
    ko2x: 0, ko2y: 0, ko2w: -1, ko2h: -1, ko3x: 0, ko3y: 0, ko3w: -1, ko3h: -1,
    ko4x: 0, ko4y: 0, ko4w: -1, ko4h: -1, ko5x: 0, ko5y: 0, ko5w: -1, ko5h: -1,
    koOn: 0, koMargin: 72,
    boundCx: 0, boundCy: 0, boundHw: 460, boundHh: 252,
    freeze: 0, snap: 0,
    pulse: 0, brightness: 1, camX: 0, camY: 0, sizeScale: 1,
    freeDim: 1, farFrac: 0, shapeExpo: 1, frameGlow: 0, bloomK: 1,
  };
}

/** Field (neighbourhood grid) resolution shared by both simulators. */
export const FIELD_W = 96;
export const FIELD_H = 54;
export const FIELD_MARGIN = 1.3; // field spans the viewport × this
export const FIELD_VEL_SCALE = 1 / 1000; // velocities are stored scaled to keep half floats precise

/** Sub-flock of particle i's knit hash (S.x): 50 % / 30 % / 20 %. Same formula in the GPU kernel. */
export function groupOf(sx: number): 0 | 1 | 2 {
  const u = fract(sx * 13.37);
  return u < 0.5 ? 0 : u < 0.8 ? 1 : 2;
}
/** "Far" (dim, set-back) particles: hash of the brightness seed (S.z). Same formula in the GPU kernel. */
export function farOf(sz: number, farFrac: number): number {
  return fract(sz * 7.77) < farFrac ? 1 : 0;
}
export const FAR_Z = -260;
/** Slot along the trail (0 = the leader, 1 = the tail) and signed offset across it, from the size seed (S.y). */
export function trailSlot(sy: number): [number, number] {
  return [fract(sy * 5.31), fract(sy * 17.17) * 2 - 1];
}
/** Trail target of a particle (world px), mirrored in the GPU kernel. */
export function trailTarget(p: SimParams, g: number, sy: number, out: [number, number]): void {
  const P = p as unknown as Record<string, number>;
  const ax = P[`g${g}ax`]!, ay = P[`g${g}ay`]!, wx = P[`g${g}wx`]!, wy = P[`g${g}wy`]!, px = P[`g${g}px`]!, py = P[`g${g}py`]!;
  const [u, off] = trailSlot(sy);
  const tau = p.time - u * p.snakeLag;
  const x = ax * Math.sin(wx * tau + px), y = ay * Math.sin(wy * tau + py);
  // tangent → unit normal
  const tx = ax * wx * Math.cos(wx * tau + px), ty = ay * wy * Math.cos(wy * tau + py);
  const tl = Math.max(Math.hypot(tx, ty), 1e-3);
  const w = p.snakeW * Math.sqrt(Math.sin(Math.PI * Math.min(u * 1.08, 1))) * off;
  out[0] = p.snakeCx + P[`g${g}ox`]! + x - (ty / tl) * w;
  out[1] = p.snakeCy + P[`g${g}oy`]! + y + (tx / tl) * w;
}
/** Mid-flight attraction dip of a shape → shape retarget (was 0.75, which read as a release burst). */
export const TRANSIT_DIP = 0.3;
/** Far particles: brightness and size multipliers in free flight. */
export const FAR_DIM = 0.45;
export const FAR_SIZE = 0.72;
function fract(x: number): number { return x - Math.floor(x); }

/**
 * Soft keep-out force for one rect (world px): returns [ax, ay] given position/velocity.
 * Signed distance to the box; within `margin` outside (and anywhere inside) the particle is pushed out along
 * the box normal and its inward velocity is cancelled. Mirrored in the GPU kernel.
 */
export function keepOutForce(px: number, py: number, vx: number, vy: number, cx: number, cy: number, hw: number, hh: number, margin: number, out: [number, number], homeX = 0, homeY = 0): void {
  out[0] = 0; out[1] = 0;
  if (hw <= 0 || hh <= 0) return;
  const qx = px - cx, qy = py - cy;
  const dx = Math.abs(qx) - hw, dy = Math.abs(qy) - hh;
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  const outside = Math.hypot(ox, oy);
  const sd = outside + Math.min(Math.max(dx, dy), 0);
  if (sd >= margin) return;
  let nx: number, ny: number;
  if (outside > 1e-3) { nx = (Math.sign(qx) * ox) / outside; ny = (Math.sign(qy) * oy) / outside; }
  else {
    // inside: leave through the face that points home (the flock's box centre), not the nearest face — the
    // nearest face can point away from home, and the home pull then pins particles just inside that edge
    const hx = homeX - px, hy = homeY - py;
    if (Math.abs(hx) * hh > Math.abs(hy) * hw) { nx = Math.sign(hx) || 1; ny = 0; } else { nx = 0; ny = Math.sign(hy) || 1; }
  }
  const t = Math.min(1 - sd / margin, 2.5);
  // push out, and turn the inward velocity around (a reflection, not a brake: braked particles slide along the
  // edge and draw a bright line on it)
  const vn = Math.min(vx * nx + vy * ny, 0);
  const k = t * t * KO_PUSH - vn * KO_TURN * t;
  out[0] = nx * k; out[1] = ny * k;
}
/** Bounds box: rate (1/s) at which outward velocity is turned back once 40 px past the box. */
export const BOX_TURN = 5;
export const KO_PUSH = 1800;
export const KO_TURN = 14;
