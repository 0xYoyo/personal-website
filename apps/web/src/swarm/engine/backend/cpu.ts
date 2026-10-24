import type { Engine, EngineInit, Scene } from './types';
import { COLORS, hexToRgb01 } from './types';
import type { SimParams } from './params';
import {
  BOUND_REFLECT, BOUND_ZONE, BOX_TURN, CURIOUS_REACH, FAR_DIM, FAR_SIZE, FAR_Z, FIELD_H, FIELD_MARGIN, FIELD_W, HOLE_KICK, HOLE_PUSH, HOLE_TURN, STILL_HOLE,
  MAX_KEEPOUT, STEER_M, TRANSIT_DIP, curiousOf, groupOf, keepOutForce, steerGoal, trailSlot,
} from './params';
import { FLOW_WAVES, WAVE_K, WAVE_W } from './flow';
import type { Targets } from '../shapes';
import { makeSeeds } from '../hash';

/**
 * Dot scale for the 2D fallback (POLISH1 B6): fewer dots draw bigger and a little more opaque so 3k dots
 * still make a solid YOYO and a visible frame border. 1 at ≥ 12k, √(12k / n) below, capped at 2.2.
 */
export function dotScale(count: number): { size: number; alpha: number } {
  const size = Math.min(2.2, Math.max(1, Math.sqrt(12000 / Math.max(count, 1))));
  return { size, alpha: 1 + 0.3 * (size - 1) };
}

/** Held shapes on the 2D tier draw this much bigger (POLISH2 B5: with the edge-weighted sampling they read). */
export const LITE_HELD_SIZE = 1.22;

/** Channels per node of the derived neighbourhood grid: mean-velocity sums (3), density, ±1-cell and ±3-cell density gradients. */
const GC = 8;
const FW = FLOW_WAVES.flat();
const NWAVES = FLOW_WAVES.length;

/**
 * Canvas 2D fallback: same forces as the GPU kernel, in plain JS. Neighbourhood = the same splatted
 * velocity/density grid the GPU uses (bilinear splat + bilinear read), so the flock behaves alike.
 *
 * POLISH2 B4 (cost): the density gradients are differenced once per grid node per frame (5k nodes) instead of
 * 8 extra bilinear reads per particle — exact, because a bilinear read shifted by a whole cell is the same
 * weights over shifted nodes — so a particle does one 8-channel read. Per-particle constants (sub-flock,
 * trail slot, far / curious flags) are computed once; per-frame constants are unpacked once (no string-keyed
 * lookups in the loop); no allocation or Math.hypot in the hot loops.
 */
export class CpuEngine implements Engine {
  readonly backend = 'canvas2d' as const;
  readonly count: number;
  private ctx!: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private pos: Float32Array; private vel: Float32Array; private col: Float32Array;
  private seed: Float32Array;
  private ta: Float32Array = new Float32Array(0); private tb: Float32Array = new Float32Array(0);
  private ca: Float32Array = new Float32Array(0); private cb: Float32Array = new Float32Array(0);
  private field = new Float32Array(FIELD_W * FIELD_H * 4);
  private grid = new Float32Array(FIELD_W * FIELD_H * GC);
  private scene: Scene;
  private w = 1; private h = 1; private dpr = 1; private dprCap: number;
  private ko: [number, number] = [0, 0];
  private sg: [number, number] = [0, 0];
  private gs = new Float32Array(GC);
  private kos = new Float64Array(MAX_KEEPOUT * 4);
  private kosB = new Float64Array(MAX_KEEPOUT * 4);
  private trail = new Float64Array(24);
  // per-particle constants
  private grp: Uint8Array; private tu: Float32Array; private toff: Float32Array; private farS: Float32Array; private cur: Uint8Array;
  // draw scratch (reused every frame)
  private bucket: Int32Array; private bstart = new Int32Array(13); private bcls: Uint8Array;
  private sx: Float32Array; private sy: Float32Array;

  constructor(o: EngineInit) {
    this.canvas = o.canvas; this.count = o.count; this.scene = o.scene; this.dprCap = o.dprCap;
    const n = o.count;
    this.pos = new Float32Array(n * 4); this.vel = new Float32Array(n * 4);
    this.col = new Float32Array(n * 4); this.seed = makeSeeds(n);
    this.grp = new Uint8Array(n); this.tu = new Float32Array(n); this.toff = new Float32Array(n); this.farS = new Float32Array(n); this.cur = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const S = this.seed, o4 = i * 4;
      this.grp[i] = groupOf(S[o4]!);
      const [u, off] = trailSlot(S[o4 + 1]!);
      this.tu[i] = u; this.toff[i] = Math.sqrt(Math.sin(Math.PI * Math.min(u * 1.08, 1))) * off;
      const fz = S[o4 + 2]! * 7.77; this.farS[i] = fz - Math.floor(fz);
      this.cur[i] = curiousOf(S[o4]!, S[o4 + 2]!, 0.05) ? 1 : 0; // the frac is re-checked against p.curiousFrac
    }
    this.bucket = new Int32Array(n); this.bcls = new Uint8Array(n);
    this.sx = new Float32Array(n); this.sy = new Float32Array(n);
  }

  async init(): Promise<void> {
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas2d unavailable');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number): void {
    this.w = cssW; this.h = cssH;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.canvas.width = Math.round(cssW * this.dpr); this.canvas.height = Math.round(cssH * this.dpr);
  }

  setTargets(a: Targets, b: Targets): void {
    this.ta = a.pos; this.tb = b.pos; this.ca = a.col; this.cb = b.col;
  }

  setState(pos: Float32Array, vel: Float32Array): void { this.pos.set(pos); this.vel.set(vel); }
  setScene(s: Scene): void { this.scene = s; }

  /** Splat velocity + density into the field, then derive the per-node gradients (see the class note). */
  private splat(p: SimParams, densRef: number): { fx0: number; fy0: number; cw: number; ch: number } {
    const f = this.field; f.fill(0);
    const fw = p.halfW * 2 * FIELD_MARGIN, fh = p.halfH * 2 * FIELD_MARGIN;
    const fx0 = -fw / 2, fy0 = -fh / 2, cw = fw / FIELD_W, ch = fh / FIELD_H;
    const P = this.pos, V = this.vel, n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const gx = (P[o]! - fx0) / cw - 0.5, gy = (P[o + 1]! - fy0) / ch - 0.5;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      if (ix < 0 || iy < 0 || ix >= FIELD_W - 1 || iy >= FIELD_H - 1) continue;
      const fx = gx - ix, fy = gy - iy;
      const vx = V[o]!, vy = V[o + 1]!, vz = V[o + 2]!;
      const c00 = (iy * FIELD_W + ix) * 4, c10 = c00 + 4, c01 = c00 + FIELD_W * 4, c11 = c01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      f[c00]! += vx * w00; f[c00 + 1]! += vy * w00; f[c00 + 2]! += vz * w00; f[c00 + 3]! += w00;
      f[c10]! += vx * w10; f[c10 + 1]! += vy * w10; f[c10 + 2]! += vz * w10; f[c10 + 3]! += w10;
      f[c01]! += vx * w01; f[c01 + 1]! += vy * w01; f[c01 + 2]! += vz * w01; f[c01 + 3]! += w01;
      f[c11]! += vx * w11; f[c11 + 1]! += vy * w11; f[c11 + 2]! += vz * w11; f[c11 + 3]! += w11;
    }
    const G = this.grid, inv = 1 / densRef;
    const dw = (x: number, y: number): number => (x < 0 || y < 0 || x >= FIELD_W || y >= FIELD_H ? 0 : f[(y * FIELD_W + x) * 4 + 3]!);
    for (let y = 0; y < FIELD_H; y++) for (let x = 0; x < FIELD_W; x++) {
      const c = (y * FIELD_W + x) * 4, g = (y * FIELD_W + x) * GC;
      G[g] = f[c]!; G[g + 1] = f[c + 1]!; G[g + 2] = f[c + 2]!; G[g + 3] = f[c + 3]!;
      G[g + 4] = (dw(x + 1, y) - dw(x - 1, y)) * 0.5 * inv; G[g + 5] = (dw(x, y + 1) - dw(x, y - 1)) * 0.5 * inv;
      G[g + 6] = (dw(x + 3, y) - dw(x - 3, y)) / 6 * inv; G[g + 7] = (dw(x, y + 3) - dw(x, y - 3)) / 6 * inv;
    }
    return { fx0, fy0, cw, ch };
  }

  frame(p: SimParams, draw = true): void {
    this.simulate(p);
    if (draw) this.draw(p);
  }

  private simulate(p: SimParams): void {
    const n = this.count, P = this.pos, V = this.vel, C = this.col, S = this.seed;
    const A = this.ta, B = this.tb, CA = this.ca, CB = this.cb;
    if (B.length < n * 4) return;
    const densRef = Math.max(0.5, (n / (FIELD_W * FIELD_H)) * 3.2);
    const g = this.splat(p, densRef);
    const G = this.grid, gs = this.gs;
    const dt = p.dt, time = p.time;
    const elapsed = time - p.phaseStart;
    const cosR = Math.cos(p.rotY), sinR = Math.sin(p.rotY);
    const wildMul = 1 + p.wild * 2.5;
    const wdx = Math.cos(time * 0.21), wdy = Math.sin(time * 0.21);
    const PP = p as unknown as Record<string, number>;
    // per-frame constants, unpacked once
    const kos = this.kos; let nk = 0;
    for (let k = 0; k < MAX_KEEPOUT; k++) if (PP[`ko${k}w`]! > 0) { kos[nk * 4] = PP[`ko${k}x`]!; kos[nk * 4 + 1] = PP[`ko${k}y`]!; kos[nk * 4 + 2] = PP[`ko${k}w`]!; kos[nk * 4 + 3] = PP[`ko${k}h`]!; nk++; }
    const TR = this.trail;
    for (let k = 0; k < 3; k++) {
      TR[k * 8] = PP[`g${k}ax`]!; TR[k * 8 + 1] = PP[`g${k}ay`]!; TR[k * 8 + 2] = PP[`g${k}wx`]!; TR[k * 8 + 3] = PP[`g${k}wy`]!;
      TR[k * 8 + 4] = PP[`g${k}px`]!; TR[k * 8 + 5] = PP[`g${k}py`]!; TR[k * 8 + 6] = PP[`g${k}ox`]!; TR[k * 8 + 7] = PP[`g${k}oy`]!;
    }
    const kof = this.ko, sgo = this.sg;
    // keep-outs relative to the bounds box centre (steering and exits check faces against the box)
    const kosB = this.kosB;
    for (let k = 0; k < nk; k++) { kosB[k * 4] = kos[k * 4]! - p.boundCx; kosB[k * 4 + 1] = kos[k * 4 + 1]! - p.boundCy; kosB[k * 4 + 2] = kos[k * 4 + 2]!; kosB[k * 4 + 3] = kos[k * 4 + 3]!; }
    const fa = p.flowAmp * wildMul, flowRate = p.flowRate * (1 + p.wild * 3), freq = p.flowFreq;
    const r0 = Math.min(p.halfW, p.halfH) * p.leadR, r0s = r0 * 1.2;
    const steer = p.steerOn > 0 && nk > 0, steerM = p.koMargin * STEER_M;
    const fmask = p.koFrame > 0 ? (p.koFbT ? 1 : 0) | (p.koFbB ? 2 : 0) | (p.koFbL ? 4 : 0) | (p.koFbR ? 8 : 0) : 0;
    const ptrOn = p.pointerOn > 0;
    const hR = p.pointerR, hx0 = p.pointerX, hy0 = p.pointerY;
    const wx = p.wakeX - hx0, wy = p.wakeY - hy0, wl2 = Math.max(wx * wx + wy * wy, 1e-6);
    const pvx = p.pointerVx, pvy = p.pointerVy, ps = Math.sqrt(pvx * pvx + pvy * pvy);
    const fallR2 = 1 / ((hR * 2.2) * (hR * 2.2)), fallK = Math.min(ps / 900, 1) * 4 * p.pointerOn;
    const curOn = p.curious > 0, curFracOk = p.curiousFrac;
    const bHw = p.boundHw, bHh = p.boundHh, bCx = p.boundCx, bCy = p.boundCy;
    const zx = Math.max(bHw - BOUND_ZONE, 1), zy = Math.max(bHh - BOUND_ZONE, 1);
    const stepW = dt / p.ramp;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const dly = B[o + 3]! * p.spread;
      const switched = elapsed >= dly;
      const T = switched ? B : A, TC = switched ? CB : CA;
      const sel = S[o + 3]! < p.selectFrac ? 1 : 0;
      const wDes = (switched ? p.goal : p.prevGoal) * sel;
      let w = V[o + 3]!;
      w += Math.max(-stepW, Math.min(stepW, wDes - w));
      const local = Math.min(1, Math.max(0, (elapsed - dly) / p.ramp));
      // shape → shape: a shallow mid-flight dip only (paths swoop, nothing disperses; POLISH1 B4)
      const wEff = w * (1 - p.transit * Math.sin(Math.PI * local) * TRANSIT_DIP);
      // target transform
      let tx = T[o]!, ty = T[o + 1]!, tz = T[o + 2]!;
      if (p.spinOn > 0) { const dx = tx - p.shapeCx; tx = p.shapeCx + dx * cosR - tz * sinR; tz = dx * sinR + tz * cosR; }
      tx = p.shapeCx + (tx - p.shapeCx) * p.targetScale; ty = p.shapeCy + (ty - p.shapeCy) * p.targetScale;
      if (p.ringOn > 0) {
        const rx = tx - p.shapeCx, ry = ty - p.shapeCy, ang = Math.atan2(ry, rx);
        const k = 1 + p.ringLevel * (0.34 + 0.16 * Math.sin(ang * 5 + time * 6));
        tx = p.shapeCx + rx * k; ty = p.shapeCy + ry * k;
      }
      const px = P[o]!, py = P[o + 1]!, pz = P[o + 2]!;
      let vx = V[o]!, vy = V[o + 1]!, vz = V[o + 2]!;
      const free = 1 - 0.94 * wEff;
      const fb = (1 - wEff) * (1 - wEff); // flocking forces vanish inside a held shape (keeps counters open)
      // curious particles (B2) leave the flock for a still cursor nearby
      let cu = 0, qx = 0, qy = 0, qr = 1e9;
      if (ptrOn) { qx = px - hx0; qy = py - hy0; qr = Math.max(Math.sqrt(qx * qx + qy * qy), 1e-3); }
      if (curOn && this.cur[i] && curiousOf(S[o]!, S[o + 2]!, curFracOk) && qr < CURIOUS_REACH) {
        const tq = Math.min(Math.max((CURIOUS_REACH - qr) / 80, 0), 1);
        cu = p.curious * tq * free;
      }
      const keep = 1 - cu;
      let ax = 0, ay = 0, az = 0;
      // flow
      let flx = 0, fly = 0, flz = 0;
      for (let k = 0; k < NWAVES; k++) {
        const b6 = k * 6, kx = FW[b6]!, ky = FW[b6 + 1]!, f = freq * FW[b6 + 2]!, ph = FW[b6 + 4]!, wt = FW[b6 + 5]!;
        const a = (kx * px + ky * py) * f + FW[b6 + 3]! * time + ph;
        const c = Math.cos(a);
        flx += wt * c * ky; fly -= wt * c * kx; flz += wt * 0.35 * Math.sin(a * 0.7 + ph);
      }
      const fs = flowRate * free * keep;
      ax += (flx * fa - vx) * fs; ay += (fly * fa - vy) * fs; az += (flz * fa * 0.5 - vz) * fs;
      { // individual jitter: breaks the cell-scale lattice the field would otherwise imprint
        const ja = S[o]! * 6.2832 + time * (2.1 + S[o + 1]! * 3);
        ax += Math.cos(ja) * 140 * fb; ay += Math.sin(ja) * 140 * fb;
      }
      if (p.wild > 0) { // celebrate: every particle chases its own spinning heading
        const ja = S[o]! * 6.2832 + time * (1.5 + S[o + 1]! * 4);
        ax += Math.cos(ja) * 750 * p.wild * free; ay += Math.sin(ja) * 750 * p.wild * free;
      }
      // boids via field: one 8-channel bilinear read
      {
        const gx = (px - g.fx0) / g.cw - 0.5, gy = (py - g.fy0) / g.ch - 0.5;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        if (ix < 0 || iy < 0 || ix >= FIELD_W - 1 || iy >= FIELD_H - 1) { gs.fill(0); }
        else {
          const fx = gx - ix, fy = gy - iy;
          const c00 = (iy * FIELD_W + ix) * GC, c10 = c00 + GC, c01 = c00 + FIELD_W * GC, c11 = c01 + GC;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          for (let k = 0; k < GC; k++) gs[k] = G[c00 + k]! * w00 + G[c10 + k]! * w10 + G[c01 + k]! * w01 + G[c11 + k]! * w11;
        }
      }
      const fbk = fb * keep;
      if (gs[3]! > 1e-3) {
        const k = Math.min(gs[3]! / 2, 1) * p.align * fbk;
        ax += (gs[0]! / gs[3]! - vx) * k; ay += (gs[1]! / gs[3]! - vy) * k; az += (gs[2]! / gs[3]! - vz) * k;
      }
      // separation: density gradient over ±1 cell (local pressure); cohesion: over ±3 cells, only at the
      // flock's thin edge. Two scales stop the single-scale gradient from feeding stripe/worm patterns.
      const dens = Math.min(gs[3]! / densRef, 24);
      const edge = 1 - Math.min(Math.max((dens - 0.2) / 0.7, 0), 1);
      // density cap acts on the smooth (±3 cell) gradient: it spreads a ball without feeding a grid-scale lattice
      const rest = Math.min(Math.max((p.densCap - dens) / p.densCap, 0), 1);
      const ck0 = (p.coh * edge * edge * (3 - 2 * edge) + p.restK * rest - p.capK * Math.max(dens - p.densCap, 0)) * fbk, sk0 = p.sep * dens * fb;
      ax += gs[6]! * ck0 - gs[4]! * sk0; ay += gs[7]! * ck0 - gs[5]! * sk0;
      // leader + bounds + slab
      { // leader = a roost the flock is steered toward only when it strays (dead zone), not a spring
        let gx = p.leaderX, gy = p.leaderY;
        if (p.snake > 0) {
          const b8 = this.grp[i]! * 8;
          const tau = time - this.tu[i]! * p.snakeLag;
          const ax1 = TR[b8]!, ay1 = TR[b8 + 1]!, wx1 = TR[b8 + 2]!, wy1 = TR[b8 + 3]!;
          const sa = wx1 * tau + TR[b8 + 4]!, sb = wy1 * tau + TR[b8 + 5]!;
          const ttx = ax1 * wx1 * Math.cos(sa), tty = ay1 * wy1 * Math.cos(sb);
          const tl = Math.max(Math.sqrt(ttx * ttx + tty * tty), 1e-3);
          const wd = p.snakeW * this.toff[i]!;
          const trx = p.snakeCx + TR[b8 + 6]! + ax1 * Math.sin(sa) - (tty / tl) * wd;
          const try_ = p.snakeCy + TR[b8 + 7]! + ay1 * Math.sin(sb) + (ttx / tl) * wd;
          gx += (trx - gx) * p.snake; gy += (try_ - gy) * p.snake;
        }
        if (steer) { steerGoal(px - bCx, py - bCy, gx - bCx, gy - bCy, kosB, nk, steerM, sgo, bHw, bHh, p.koFrame > 0 ? nk - 1 : -1, fmask); gx = sgo[0] + bCx; gy = sgo[1] + bCy; }
        const lx = gx - px, ly = gy - py, ll = Math.max(Math.sqrt(lx * lx + ly * ly), 1e-3);
        const t = Math.min(Math.max((ll - r0) / r0s, 0), 1), k = t * t * (3 - 2 * t) * p.leaderW * 260 * free * keep;
        ax += (lx / ll) * k; ay += (ly / ll) * k;
      }
      // bounds (B1): the viewport inset; outward velocity turns within BOUND_ZONE of the edge, a spring past it
      {
        const bx = px - bCx, by = py - bCy, abx = Math.abs(bx), aby = Math.abs(by), sx = bx >= 0 ? 1 : -1, sy = by >= 0 ? 1 : -1;
        const ex = Math.max(abx - bHw, 0) * sx, ey = Math.max(aby - bHh, 0) * sy;
        ax -= ex * 8 * free; ay -= ey * 8 * free;
        const zxk = Math.min(Math.max((abx - zx) / BOUND_ZONE, 0), 1.5), zyk = Math.min(Math.max((aby - zy) / BOUND_ZONE, 0), 1.5);
        ax -= sx * Math.max(vx * sx, 0) * zxk * BOX_TURN * free; ay -= sy * Math.max(vy * sy, 0) * zyk * BOX_TURN * free;
      }
      const far = this.farS[i]! < p.farFrac ? 1 : 0;
      az += (-(pz - FAR_Z * far) * 1.2 - vz * 0.6) * free;
      // keep-outs: soft repulsion (top bar, conversation, chips, command bar); a held shape barely feels it
      if (p.koOn > 0) {
        const kk = p.koOn * (1 - 0.85 * wEff);
        const nOwn = p.koFrame > 0 ? nk - 1 : nk;
        const kf0 = nk - 1;
        // inside the dim frame's rect only the frame acts (its exits skip blocked faces); outside it, any other
        // keep-out acting on the particle wins over the frame's margin
        const inFrame = nOwn < nk && Math.abs(px - kos[kf0 * 4]!) < kos[kf0 * 4 + 2]! && Math.abs(py - kos[kf0 * 4 + 1]!) < kos[kf0 * 4 + 3]!;
        let other = false;
        for (let k = 0; k < (inFrame ? 0 : nOwn); k++) {
          keepOutForce(px - bCx, py - bCy, vx, vy, kosB[k * 4]!, kosB[k * 4 + 1]!, kos[k * 4 + 2]!, kos[k * 4 + 3]!, p.koMargin, kof, p.homeX - bCx, p.homeY - bCy, steer, bHw, bHh);
          if (kof[0] !== 0 || kof[1] !== 0) other = true;
          ax += kof[0] * kk; ay += kof[1] * kk;
        }
        if (nOwn < nk && (!other || inFrame)) { // the dim frame: held border particles ignore it
          const k = kf0;
          keepOutForce(px - bCx, py - bCy, vx, vy, kosB[k * 4]!, kosB[k * 4 + 1]!, kos[k * 4 + 2]!, kos[k * 4 + 3]!, p.koFrameMargin, kof, p.homeX - bCx, p.homeY - bCy, steer, bHw, bHh, fmask);
          const kf = p.koOn * (1 - wEff);
          ax += kof[0] * kf; ay += kof[1] * kf;
        }
      }
      // vortex
      if (p.vortexW > 0) {
        const rx = px - p.vortexCx, ry = py - p.vortexCy, rl = Math.max(Math.sqrt(rx * rx + ry * ry), 1);
        // per-particle orbit speed (±30 %) shears any clump into a full ring; per-particle radius gives the ring body
        const vs = p.vortexSpeed * (0.7 + 0.6 * S[o + 1]!), vr = p.vortexR * (0.8 + 0.4 * S[o + 2]!);
        const dvx = (-ry / rl) * vs + (rx / rl) * (vr - rl) * 3;
        const dvy = (rx / rl) * vs + (ry / rl) * (vr - rl) * 3;
        const kk = 4 * p.vortexW * free * keep;
        ax += (dvx - vx) * kk; ay += (dvy - vy) * kk; az += (-pz * 3 * p.vortexFlat - vz) * kk * 0.5;
      }
      // target attraction
      const dx = tx - px, dy = ty - py, dz = tz - pz, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let dvx = dx * 6, dvy = dy * 6, dvz = dz * 6;
      const dl = dist * 6;
      if (dl > 1800) { const k = 1800 / dl; dvx *= k; dvy *= k; dvz *= k; }
      ax += (dvx - vx) * 9 * wEff; ay += (dvy - vy) * 9 * wEff; az += (dvz - vz) * 9 * wEff;
      const sw = Math.min(dist / 250, 1) * wEff * 1.8 * p.flowAmp;
      ax += flx * sw; ay += fly * sw;
      // pointer (B2): a soft hole around the cursor, stretched into a short wake behind fast motion; drag along
      // fast motion; a still cursor draws the curious few into a loose orbit
      let hV = 0, hNx = 0, hNy = 0;
      if (ptrOn) {
        // closest point on the capsule cursor → wake tail; the radius tapers to 60 % at the tail
        const s = Math.min(Math.max((qx * wx + qy * wy) / wl2, 0), 1);
        const cx = qx - wx * s, cy = qy - wy * s, d = Math.max(Math.sqrt(cx * cx + cy * cy), 1e-3);
        const R = hR * (1 - 0.4 * s) * (0.78 + 0.44 * S[o + 2]!); // per-particle radius: a soft edge, no rim
        if (d < R && cu < 1) {
          const t = 1 - d / R, nx = cx / d, ny = cy / d;
          const vn = Math.min(vx * nx + vy * ny, 0);
          const hk = p.pointerOn * (1 - cu) * (p.pointerHole * (1 - 0.5 * wEff) + (1 - p.pointerHole) * STILL_HOLE * (1 - wEff));
          const k = (t * t * HOLE_PUSH - vn * HOLE_TURN * t) * hk;
          ax += nx * k; ay += ny * k;
          // …and an outward velocity proportional to the penetration, applied directly (a cursor crosses a spot
          // in ~50 ms: forces alone under the cruise speed cap cannot open a hole that fast)
          hV = (R - d) * HOLE_KICK * hk; hNx = nx; hNy = ny;
        }
        const fall = Math.exp(-(qr * qr) * fallR2) * fallK * (1 - 0.6 * wEff);
        ax += pvx * fall; ay += pvy * fall;
        if (cu > 0) {
          const ux = qx / qr, uy = qy / qr, dir = S[o + 1]! < 0.5 ? 1 : -1;
          const vs = (140 + 90 * S[o + 2]!) * dir, rr = p.curiousR * (0.7 + 0.6 * S[o + 1]!);
          let cvx = -uy * vs + ux * (rr - qr) * 2.4, cvy = ux * vs + uy * (rr - qr) * 2.4;
          const cl = Math.sqrt(cvx * cvx + cvy * cvy);
          if (cl > 560) { cvx *= 560 / cl; cvy *= 560 / cl; }
          ax += (cvx - vx) * 3.4 * cu; ay += (cvy - vy) * 3.4 * cu; az += (-pz * 2 - vz) * cu;
        }
      }
      // burst
      if (p.burst > 0) {
        const bx = px - p.burstX + (S[o + 1]! - 0.5) * 60, by = py - p.burstY + (S[o + 2]! - 0.5) * 60, bl = Math.max(Math.sqrt(bx * bx + by * by), 1e-3);
        const k = p.burst * (0.4 + S[o]!);
        vx += (bx / bl) * k; vy += (by / bl) * k; vz += (S[o + 2]! - 0.5) * p.burst * 0.5;
      }
      const fk = dt * (1 - p.freeze * 0.97);
      vx += ax * fk; vy += ay * fk; vz += az * fk;
      if (hV > 0) { const vr = vx * hNx + vy * hNy; if (vr < hV) { const dv = (hV - vr) * Math.min(1, dt * 22); vx += hNx * dv; vy += hNy * dv; } }
      // agitation waves: cruise speed modulated by a travelling wave → density bands roll through the flock
      {
        const sp0 = Math.max(Math.sqrt(vx * vx + vy * vy + vz * vz), 1e-3);
        const wa = (px * wdx + py * wdy) * WAVE_K - time * WAVE_W;
        const cruise = p.cruise * (1 + p.waveAmp * Math.sin(wa));
        const kk = (cruise - sp0) / sp0 * Math.min(dt * 1.6, 1) * free * (1 - p.freeze) * keep;
        vx += vx * kk; vy += vy * kk; vz += vz * kk;
      }
      // speed limits
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const maxS = p.speedMax * (1 + p.wild * 1.5) * free + 2200 * (1 - free) + hV;
      const minS = p.speedMin * free * (1 - p.freeze) * keep;
      if (sp > maxS) { const k = maxS / sp; vx *= k; vy *= k; vz *= k; }
      else if (sp < minS) { const k = minS / Math.max(sp, 1e-3); vx *= k; vy *= k; vz *= k; }
      const damp = Math.exp(-p.freeze * 8 * dt);
      vx *= damp; vy *= damp; vz *= damp;
      let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
      // never cut off at the screen edge: past the inset box + the zone, a free particle reflects inward
      if (free > 0.5) {
        const lx = bHw + BOUND_REFLECT, ly = bHh + BOUND_REFLECT;
        if (nx - bCx > lx && vx > 0) { nx = bCx + lx; vx = -vx * 0.5; } else if (nx - bCx < -lx && vx < 0) { nx = bCx - lx; vx = -vx * 0.5; }
        if (ny - bCy > ly && vy > 0) { ny = bCy + ly; vy = -vy * 0.5; } else if (ny - bCy < -ly && vy < 0) { ny = bCy - ly; vy = -vy * 0.5; }
      }
      if (p.snap > 0 && wDes > 0.5) { nx = tx; ny = ty; nz = tz; vx = vy = vz = 0; w = 1; }
      P[o] = nx; P[o + 1] = ny; P[o + 2] = nz;
      V[o] = vx; V[o + 1] = vy; V[o + 2] = vz; V[o + 3] = w;
      const ck = p.snap > 0 ? 1 : Math.min(dt * 6, 1);
      C[o]! += (TC[o]! - C[o]!) * ck; C[o + 1]! += (TC[o + 1]! - C[o + 1]!) * ck; C[o + 2]! += (TC[o + 2]! - C[o + 2]!) * ck;
      C[o + 3]! += (TC[o + 3]! * wEff - C[o + 3]!) * ck;
    }
  }

  private draw(p: SimParams): void {
    const ctx = this.ctx, pal = COLORS[this.scene];
    const dark = this.scene === 'dark';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const base = hexToRgb01(pal.base), fast = hexToRgb01(pal.fast);
    const D = this.h / 2 / Math.tan((30 * Math.PI) / 360);
    const cx = this.w / 2, cy = this.h / 2, dpr = this.dpr;
    const P = this.pos, V = this.vel, C = this.col;
    const bright = (1 + p.pulse * 0.15) * p.brightness;
    const n = this.count, SX = this.sx, SY = this.sy;
    // project once
    for (let i = 0; i < n; i++) {
      const o = i * 4, k = D / Math.max(D - P[o + 2]!, 50);
      SX[i] = (cx + (P[o]! - p.camX) * k) * dpr; SY[i] = (cy - (P[o + 1]! - p.camY) * k) * dpr;
    }
    ctx.lineCap = 'round';
    // 4 speed buckets × 3 classes (held, free near, free far) for uncoloured particles, one path each
    // (counting sort into one reused index array: no per-frame allocation)
    const cls = this.bcls, start = this.bstart, order = this.bucket;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (C[o + 3]! > 0.15) { cls[i] = 255; continue; }
      const sp = Math.sqrt(V[o]! * V[o]! + V[o + 1]! * V[o + 1]!);
      const held = Math.min(Math.max(V[o + 3]!, 0), 1);
      // particles flying to a shape keep most of their warm colour (a full speed hue read as a blue burst)
      const st = Math.min(Math.max((sp - 120) / 580, 0), 1) * (1 - 0.75 * held);
      const c = held > 0.5 ? 0 : this.farS[i]! < p.farFrac ? 2 : 1;
      const b = c * 4 + Math.min(3, Math.floor(st * 4));
      cls[i] = b; start[b + 1]!++;
    }
    for (let b = 0; b < 12; b++) start[b + 1]! += start[b]!;
    const fill = start.slice(0, 12);
    for (let i = 0; i < n; i++) { const b = cls[i]!; if (b !== 255) order[fill[b]!++] = i; }
    const ds = dotScale(n);
    const lite = n <= 6000 ? 1 : 0;
    const dimK = 1 - p.heldDim;
    const heldSize = (1 + 0.3 * p.frameGlow) * (1 + (LITE_HELD_SIZE - 1) * lite * (1 - p.frameGlow)) * (1 - 0.35 * dimK);
    const clsAlpha = [p.shapeExpo * (1 + 0.5 * p.frameGlow) * ds.alpha * p.heldDim, p.freeDim * ds.alpha, p.freeDim * FAR_DIM * ds.alpha];
    const clsSize = [heldSize * ds.size, ds.size, FAR_SIZE * ds.size];
    for (let b = 0; b < 12; b++) {
      const c = Math.floor(b / 4), st = ((b % 4) + 0.5) / 4;
      const s0 = start[b]!, s1 = start[b + 1]!;
      if (s1 <= s0) continue;
      const r = base[0] + (fast[0] - base[0]) * st, gg = base[1] + (fast[1] - base[1]) * st, bl = base[2] + (fast[2] - base[2]) * st;
      ctx.strokeStyle = `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(bl * 255) | 0},${Math.min(1, (dark ? 0.85 : 0.8) * Math.min(bright, 1.2) * clsAlpha[c]!)})`;
      ctx.lineWidth = (dark ? 2.3 : 2.7) * dpr * p.sizeScale * clsSize[c]!;
      ctx.beginPath();
      const tail = 0.018 * st * dpr;
      for (let j = s0; j < s1; j++) {
        const i = order[j]!, o = i * 4, x = SX[i]!, y = SY[i]!;
        ctx.moveTo(x - V[o]! * tail, y + V[o + 1]! * tail);
        ctx.lineTo(x + 0.01, y);
      }
      ctx.stroke();
    }
    const S = this.seed;
    const sz = 2.4 * dpr * p.sizeScale * ds.size * (1 + (LITE_HELD_SIZE - 1) * lite);
    for (let i = 0; i < n; i++) {
      if (cls[i] !== 255) continue;
      const o = i * 4, x = SX[i]!, y = SY[i]!;
      const m = C[o + 3]!;
      const r = base[0] + (C[o]! - base[0]) * m, gg = base[1] + (C[o + 1]! - base[1]) * m, bl = base[2] + (C[o + 2]! - base[2]) * m;
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(bl * 255) | 0},${Math.min(1, (0.6 + 0.4 * S[o + 2]!) * ds.alpha)})`;
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
  }

  /** Debug (QA): same as GpuEngine.debugFieldSum. */
  async debugFieldSum(): Promise<{ sum: number; max: number; nonzero: number }> {
    let sum = 0, max = 0, nonzero = 0;
    for (let i = 3; i < this.field.length; i += 4) { const w = this.field[i]!; sum += w; if (w > max) max = w; if (w > 0) nonzero++; }
    return { sum, max, nonzero };
  }

  screenshot(): Promise<Blob> {
    return new Promise((res, rej) => this.canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
  }

  destroy(): void { /* nothing GPU-side */ }
}
