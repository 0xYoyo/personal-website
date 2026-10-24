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
  ko6x: number; ko6y: number; ko6w: number; ko6h: number;
  koOn: number; koMargin: number;
  /** a dim locked frame's own keep-out (B3): 1 = the last keep-out is the frame (its margin koFrameMargin; held
   *  particles ignore it, and any other keep-out acting on a particle wins over it) */
  koFrame: number; koFrameMargin: number;
  /** the dim frame's faces that are no exit (a neighbouring keep-out sits right there): 1 = blocked.
   *  T / B = screen top / bottom (world +y / −y), L / R. */
  koFbT: number; koFbB: number; koFbL: number; koFbR: number;
  /** where a particle caught inside a keep-out leaves toward (world px): the roost / stage centre */
  homeX: number; homeY: number;
  /** free-flight goals are projected out of keep-outs and routed around them (B1/B3): 1 = on */
  steerOn: number;
  /** while gathering (B3): a particle with no way round a keep-out flies behind it (keep-out forces off for it;
   *  dots inside keep-outs are never drawn), instead of staying trapped on its side */
  tunnel: number;
  /** pointer wake: the trailing end of the cursor's hole capsule (world px), the hole strength (1 while moving,
   *  0 when still), and the curious orbit (0..1) that a still cursor gathers from curiousFrac of the flock */
  wakeX: number; wakeY: number; pointerHole: number; curious: number; curiousFrac: number; curiousR: number;
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
  /** held-particle brightness (a dim locked frame border: < 1) */
  heldDim: number;
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
export const MAX_KEEPOUT = 7;

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
    ko4x: 0, ko4y: 0, ko4w: -1, ko4h: -1, ko5x: 0, ko5y: 0, ko5w: -1, ko5h: -1, ko6x: 0, ko6y: 0, ko6w: -1, ko6h: -1,
    koOn: 0, koMargin: 72, koFrame: 0, koFrameMargin: 56, koFbT: 0, koFbB: 0, koFbL: 0, koFbR: 0, homeX: 0, homeY: 0, steerOn: 0, tunnel: 0,
    wakeX: 1e5, wakeY: 1e5, pointerHole: 0, curious: 0, curiousFrac: CURIOUS_FRAC, curiousR: 70,
    boundCx: 0, boundCy: 0, boundHw: 460, boundHh: 252,
    freeze: 0, snap: 0,
    pulse: 0, brightness: 1, camX: 0, camY: 0, sizeScale: 1,
    freeDim: 1, farFrac: 0, shapeExpo: 1, frameGlow: 0, bloomK: 1, heldDim: 1,
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
export function keepOutForce(px: number, py: number, vx: number, vy: number, cx: number, cy: number, hw: number, hh: number, margin: number, out: [number, number], homeX = 0, homeY = 0, nearest = false, boxHw = Infinity, boxHh = Infinity, fmask = 0): void {
  out[0] = 0; out[1] = 0;
  if (hw <= 0 || hh <= 0) return;
  const qx = px - cx, qy = py - cy;
  const dx = Math.abs(qx) - hw, dy = Math.abs(qy) - hh;
  if (dx >= margin || dy >= margin) return; // cheap reject (then sd ≥ margin anyway)
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  const outside = Math.sqrt(ox * ox + oy * oy);
  const sd = outside + Math.min(Math.max(dx, dy), 0);
  if (sd >= margin) return;
  let nx: number, ny: number;
  if (outside > 1e-3) { nx = (Math.sign(qx) * ox) / outside; ny = (Math.sign(qy) * oy) / outside; }
  else {
    // inside: leave through the face that points home (the flock's box centre), not the nearest face — the
    // nearest face can point away from home, and the home pull then pins particles just inside that edge
    // (when home is inside the rect too — a dim frame around the stage — leave through the nearest face)
    // (with steering on, always the nearest face: the steered goal is that exit too, and the way toward home
    // can lie across the words — POLISH2 B3)
    const homeIn = nearest || (Math.abs(homeX - cx) < hw && Math.abs(homeY - cy) < hh);
    const hx = homeIn ? qx : homeX - px, hy = homeIn ? qy : homeY - py;
    const ax = homeIn ? -dx : Math.abs(hx) * hh, ay = homeIn ? -dy : Math.abs(hy) * hw;
    // a face only counts as an exit if it lies inside the bounds box (a full-width rect on a phone has no side exits)
    const okX = Math.abs(cx + (qx >= 0 ? hw : -hw)) <= boxHw && !(fmask & (qx >= 0 ? 8 : 4));
    const okY = Math.abs(cy + (qy >= 0 ? hh : -hh)) <= boxHh && !(fmask & (qy >= 0 ? 1 : 2));
    const byX = homeIn ? exitByX(ax < ay, okX, okY) : ax > ay;
    if (byX) { nx = Math.sign(hx) || 1; ny = 0; } else { nx = 0; ny = Math.sign(hy) || 1; }
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

/** Share of the flock a still cursor makes curious (B2: 2–3 %). */
export const CURIOUS_FRAC = 0.025;
/** Curious particles: hash of the knit/size seeds (S.x, S.z). Same formula in the GPU kernel. */
export function curiousOf(sx: number, sz: number, frac: number): number {
  return fract(sx * 31.7 + sz * 3.1) < frac ? 1 : 0;
}
/** Pointer hole (B2): radius (CSS px), push and inward-velocity turn rates. */
export const HOLE_R = 110;
export const HOLE_PUSH = 4200;
export const HOLE_TURN = 10;
/** Outward speed (px/s) per px of penetration into the hole, set directly on the velocity. */
export const HOLE_KICK = 14;
/** …a still cursor keeps this much of the hole in the free flock (none in a held shape), so its curious orbit reads. */
export const STILL_HOLE = 0.7;
/** Curious orbit: particles farther than this (px) from a still cursor ignore it ("near the flock"). */
export const CURIOUS_REACH = 460;
/** Bounds (B1): the free-flight box is the viewport inset by this (px); outward velocity turns within BOUND_ZONE of it. */
export const BOUND_INSET = 48;
export const BOUND_ZONE = 90;
/** …and a free particle that still gets this far past the box (px) is reflected (28 px from the screen edge). */
export const BOUND_REFLECT = 20;
/** Steering margin around keep-outs, × koMargin (the flock streams along the outer part of the repulsion zone). */
export const STEER_M = 0.8;
/** Dots more than this (px) inside a keep-out are not drawn. */
export const CULL_INSET = 4;

/**
 * Free-flight goal steering (B1/B3), mirrored in the GPU kernel. `kos` = [cx, cy, hw, hh] × nk (world px).
 * 1. A goal inside a keep-out (inflated by m) moves to the nearest face, so leaders never pull the flock into
 *    the words. 2. If the straight path from the particle to the goal crosses a keep-out, the goal becomes the
 *    keep-out's corner on the particle's side (then the far corner once it is past the face): the flock flows
 *    around the text block instead of pressing against it.
 */
export function steerGoal(px: number, py: number, gx: number, gy: number, kos: ArrayLike<number>, nk: number, m: number, out: [number, number], boxHw = Infinity, boxHh = Infinity, fk = -1, fmask = 0, tunnel = false): number {
  let tun = 0;
  let x = gx, y = gy;
  for (let k = 0; k < nk; k++) {
    const cx = kos[k * 4]!, cy = kos[k * 4 + 1]!, hw = kos[k * 4 + 2]! + m, hh = kos[k * 4 + 3]! + m;
    const qx = x - cx, qy = y - cy;
    if (Math.abs(qx) < hw && Math.abs(qy) < hh) {
      const ex = cx + (qx >= 0 ? hw : -hw), ey = cy + (qy >= 0 ? hh : -hh);
      const mk = k === fk ? fmask : 0;
      if (exitByX(hw - Math.abs(qx) < hh - Math.abs(qy), Math.abs(ex) <= boxHw && !(mk & (qx >= 0 ? 8 : 4)), Math.abs(ey) <= boxHh && !(mk & (qy >= 0 ? 1 : 2)))) x = ex; else y = ey;
    }
  }
  for (let k = 0; k < nk; k++) {
    const cx = kos[k * 4]!, cy = kos[k * 4 + 1]!, hw = kos[k * 4 + 2]! + m, hh = kos[k * 4 + 3]! + m;
    // cheap reject: the segment's bounding box misses the rect
    if ((px < x ? px : x) > cx + hw || (px > x ? px : x) < cx - hw || (py < y ? py : y) > cy + hh || (py > y ? py : y) < cy - hh) continue;
    const rx = px - cx, ry = py - cy;
    // inside the rect itself: aim at the nearest face's exit (the keep-out force pushes the same way);
    // in its margin it still steers round
    const hw0 = kos[k * 4 + 2]!, hh0 = kos[k * 4 + 3]!;
    if (Math.abs(rx) < hw0 && Math.abs(ry) < hh0) {
      // gathering, and no way round this rect toward the goal: keep flying behind it
      if (tunnel) {
        const ddx = x - px, ddy = y - py;
        const noWay = Math.abs(ddx) * hh >= Math.abs(ddy) * hw ? Math.abs(cy + hh) > boxHh && Math.abs(cy - hh) > boxHh : Math.abs(cx + hw) > boxHw && Math.abs(cx - hw) > boxHw;
        if (noWay) { tun = 1; break; }
      }
      const ex = cx + (rx >= 0 ? hw : -hw), ey = cy + (ry >= 0 ? hh : -hh);
      const mk = k === fk ? fmask : 0;
      if (exitByX(hw0 - Math.abs(rx) < hh0 - Math.abs(ry), Math.abs(cx + (rx >= 0 ? hw0 : -hw0)) <= boxHw && !(mk & (rx >= 0 ? 8 : 4)), Math.abs(cy + (ry >= 0 ? hh0 : -hh0)) <= boxHh && !(mk & (ry >= 0 ? 1 : 2)))) { x = ex; y = py; } else { x = px; y = ey; }
      break;
    }
    let dx = x - px, dy = y - py;
    if (Math.abs(dx) < 1e-3) dx = 1e-3;
    if (Math.abs(dy) < 1e-3) dy = 1e-3;
    const tx1 = (cx - hw - px) / dx, tx2 = (cx + hw - px) / dx, ty1 = (cy - hh - py) / dy, ty2 = (cy + hh - py) / dy;
    const t0 = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2)), t1 = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
    if (!(t0 <= t1 && t1 >= 0 && t0 <= 1)) continue;
    // (a way round that leaves the bounds box is no way: try the other side; with none, the goal stays on the
    // particle's own side of the rect — on a phone the reply spans the width, and the flock must not creep down
    // the screen edges to get past it)
    if (Math.abs(dx) * hh >= Math.abs(dy) * hw) { // mostly across it horizontally: go over or under
      let sy = ry >= 0 ? 1 : -1;
      if (Math.abs(cy + sy * hh) > boxHh) sy = -sy;
      if (Math.abs(cy + sy * hh) > boxHh) { if (tunnel) tun = 1; else { x = cx + (rx >= 0 ? hw : -hw); y = py; } break; }
      const sx = dx >= 0 ? 1 : -1;
      const past = sy * ry >= hh - 1;
      x = cx + (past ? sx : -sx) * hw; y = cy + sy * hh;
    } else {
      let sx = rx >= 0 ? 1 : -1;
      if (Math.abs(cx + sx * hw) > boxHw) sx = -sx;
      if (Math.abs(cx + sx * hw) > boxHw) { if (tunnel) tun = 1; else { x = Math.min(Math.max(x, cx - hw0), cx + hw0); y = cy + (ry >= 0 ? hh : -hh); } break; }
      const sy = dy >= 0 ? 1 : -1;
      const past = sx * rx >= hw - 1;
      x = cx + sx * hw; y = cy + (past ? sy : -sy) * hh;
    }
    break;
  }
  out[0] = x; out[1] = y;
  return tun;
}

/** Leave a rect through an x face? `nearerX`: the x face is the nearer one; a face outside the bounds box is no exit. */
export function exitByX(nearerX: boolean, validX: boolean, validY: boolean): boolean {
  return validX && validY ? nearerX : validX ? true : validY ? false : nearerX;
}
