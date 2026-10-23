import type { Engine, EngineInit, Scene } from './types';
import { COLORS, hexToRgb01 } from './types';
import type { SimParams } from './params';
import { FAR_DIM, FAR_SIZE, FAR_Z, FIELD_H, FIELD_MARGIN, FIELD_W, farOf, groupOf, keepOutForce, MAX_KEEPOUT, trailTarget, TRANSIT_DIP, BOX_TURN } from './params';
import { flowAt, WAVE_K, WAVE_W } from './flow';
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

/**
 * Canvas 2D fallback: same forces as the GPU kernel, in plain JS. Neighbourhood = the same splatted
 * velocity/density grid the GPU uses (bilinear splat + bilinear read), so the flock behaves alike.
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
  private scene: Scene;
  private w = 1; private h = 1; private dpr = 1; private dprCap: number;
  private flow: [number, number, number] = [0, 0, 0];
  private ko: [number, number] = [0, 0];
  private s0 = new Float32Array(4); private s1 = new Float32Array(4); private s2 = new Float32Array(4); private s3 = new Float32Array(4); private s4 = new Float32Array(4);

  constructor(o: EngineInit) {
    this.canvas = o.canvas; this.count = o.count; this.scene = o.scene; this.dprCap = o.dprCap;
    this.pos = new Float32Array(o.count * 4); this.vel = new Float32Array(o.count * 4);
    this.col = new Float32Array(o.count * 4); this.seed = makeSeeds(o.count);
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

  private splat(p: SimParams): { fx0: number; fy0: number; cw: number; ch: number } {
    const f = this.field; f.fill(0);
    const fw = p.halfW * 2 * FIELD_MARGIN, fh = p.halfH * 2 * FIELD_MARGIN;
    const fx0 = -fw / 2, fy0 = -fh / 2, cw = fw / FIELD_W, ch = fh / FIELD_H;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.count; i++) {
      const gx = (P[i * 4]! - fx0) / cw - 0.5, gy = (P[i * 4 + 1]! - fy0) / ch - 0.5;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      if (ix < 0 || iy < 0 || ix >= FIELD_W - 1 || iy >= FIELD_H - 1) continue;
      const fx = gx - ix, fy = gy - iy;
      const vx = V[i * 4]!, vy = V[i * 4 + 1]!, vz = V[i * 4 + 2]!;
      const c00 = (iy * FIELD_W + ix) * 4, c10 = c00 + 4, c01 = c00 + FIELD_W * 4, c11 = c01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      f[c00]! += vx * w00; f[c00 + 1]! += vy * w00; f[c00 + 2]! += vz * w00; f[c00 + 3]! += w00;
      f[c10]! += vx * w10; f[c10 + 1]! += vy * w10; f[c10 + 2]! += vz * w10; f[c10 + 3]! += w10;
      f[c01]! += vx * w01; f[c01 + 1]! += vy * w01; f[c01 + 2]! += vz * w01; f[c01 + 3]! += w01;
      f[c11]! += vx * w11; f[c11 + 1]! += vy * w11; f[c11 + 2]! += vz * w11; f[c11 + 3]! += w11;
    }
    return { fx0, fy0, cw, ch };
  }

  private sample(x: number, y: number, g: { fx0: number; fy0: number; cw: number; ch: number }, out: Float32Array): void {
    const gx = (x - g.fx0) / g.cw - 0.5, gy = (y - g.fy0) / g.ch - 0.5;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    out[0] = out[1] = out[2] = out[3] = 0;
    if (ix < 0 || iy < 0 || ix >= FIELD_W - 1 || iy >= FIELD_H - 1) return;
    const fx = gx - ix, fy = gy - iy, f = this.field;
    const c00 = (iy * FIELD_W + ix) * 4, c10 = c00 + 4, c01 = c00 + FIELD_W * 4, c11 = c01 + 4;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    for (let k = 0; k < 4; k++) out[k] = f[c00 + k]! * w00 + f[c10 + k]! * w10 + f[c01 + k]! * w01 + f[c11 + k]! * w11;
  }

  frame(p: SimParams, draw = true): void {
    this.simulate(p);
    if (draw) this.draw(p);
  }

  private simulate(p: SimParams): void {
    const n = this.count, P = this.pos, V = this.vel, C = this.col, S = this.seed;
    const A = this.ta, B = this.tb, CA = this.ca, CB = this.cb;
    if (B.length < n * 4) return;
    const g = this.splat(p);
    const dt = p.dt, s = this.s0, sx1 = this.s1, sx2 = this.s2, sy1 = this.s3, sy2 = this.s4;
    const densRef = Math.max(0.5, (n / (FIELD_W * FIELD_H)) * 3.2);
    const elapsed = p.time - p.phaseStart;
    const cosR = Math.cos(p.rotY), sinR = Math.sin(p.rotY);
    const fl = this.flow;
    const wildMul = 1 + p.wild * 2.5;
    const wdx = Math.cos(p.time * 0.21), wdy = Math.sin(p.time * 0.21);
    const tt: [number, number] = [0, 0];
    const PP = p as unknown as Record<string, number>;
    const kos: number[] = [];
    for (let k = 0; k < MAX_KEEPOUT; k++) if (PP[`ko${k}w`]! > 0) kos.push(PP[`ko${k}x`]!, PP[`ko${k}y`]!, PP[`ko${k}w`]!, PP[`ko${k}h`]!);
    const kof = this.ko;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const dly = B[o + 3]! * p.spread;
      const switched = elapsed >= dly;
      const T = switched ? B : A, TC = switched ? CB : CA;
      const sel = S[o + 3]! < p.selectFrac ? 1 : 0;
      const wDes = (switched ? p.goal : p.prevGoal) * sel;
      let w = V[o + 3]!;
      const stepW = dt / p.ramp;
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
        const k = 1 + p.ringLevel * (0.34 + 0.16 * Math.sin(ang * 5 + p.time * 6));
        tx = p.shapeCx + rx * k; ty = p.shapeCy + ry * k;
      }
      const px = P[o]!, py = P[o + 1]!, pz = P[o + 2]!;
      let vx = V[o]!, vy = V[o + 1]!, vz = V[o + 2]!;
      const free = 1 - 0.94 * wEff;
      const fb = (1 - wEff) * (1 - wEff); // flocking forces vanish inside a held shape (keeps counters open)
      let ax = 0, ay = 0, az = 0;
      // flow
      flowAt(px, py, p.time, p.flowFreq, fl);
      const fa = p.flowAmp * wildMul;
      const fs = p.flowRate * (1 + p.wild * 3) * free;
      ax += (fl[0] * fa - vx) * fs; ay += (fl[1] * fa - vy) * fs; az += (fl[2] * fa * 0.5 - vz) * fs;
      { // individual jitter: breaks the cell-scale lattice the field would otherwise imprint
        const ja = S[o]! * 6.2832 + p.time * (2.1 + S[o + 1]! * 3);
        ax += Math.cos(ja) * 140 * fb; ay += Math.sin(ja) * 140 * fb;
      }
      if (p.wild > 0) { // celebrate: every particle chases its own spinning heading
        const ja = S[o]! * 6.2832 + p.time * (1.5 + S[o + 1]! * 4);
        ax += Math.cos(ja) * 750 * p.wild * free; ay += Math.sin(ja) * 750 * p.wild * free;
      }
      // boids via field
      this.sample(px, py, g, s);
      if (s[3]! > 1e-3) {
        const k = Math.min(s[3]! / 2, 1) * p.align * fb;
        ax += (s[0]! / s[3]! - vx) * k; ay += (s[1]! / s[3]! - vy) * k; az += (s[2]! / s[3]! - vz) * k;
      }
      // separation: density gradient over ±1 cell (local pressure); cohesion: over ±3 cells, only at the
      // flock's thin edge. Two scales stop the single-scale gradient from feeding stripe/worm patterns.
      const dens = Math.min(s[3]! / densRef, 24);
      this.sample(px + g.cw, py, g, sx2); this.sample(px - g.cw, py, g, sx1);
      this.sample(px, py + g.ch, g, sy2); this.sample(px, py - g.ch, g, sy1);
      const sgx = (sx2[3]! - sx1[3]!) * 0.5 / densRef, sgy = (sy2[3]! - sy1[3]!) * 0.5 / densRef;
      this.sample(px + 3 * g.cw, py, g, sx2); this.sample(px - 3 * g.cw, py, g, sx1);
      this.sample(px, py + 3 * g.ch, g, sy2); this.sample(px, py - 3 * g.ch, g, sy1);
      const cgx = (sx2[3]! - sx1[3]!) / 6 / densRef, cgy = (sy2[3]! - sy1[3]!) / 6 / densRef;
      const edge = 1 - Math.min(Math.max((dens - 0.2) / 0.7, 0), 1);
      // density cap acts on the smooth (±3 cell) gradient: it spreads a ball without feeding a grid-scale lattice
      const rest = Math.min(Math.max((p.densCap - dens) / p.densCap, 0), 1);
      const ck0 = (p.coh * edge * edge * (3 - 2 * edge) + p.restK * rest - p.capK * Math.max(dens - p.densCap, 0)) * fb, sk0 = p.sep * dens * fb;
      ax += cgx * ck0 - sgx * sk0; ay += cgy * ck0 - sgy * sk0;
      // leader + bounds + slab
      { // leader = a roost the flock is steered toward only when it strays (dead zone), not a spring
        let gx = p.leaderX, gy = p.leaderY;
        if (p.snake > 0) {
          trailTarget(p, groupOf(S[o]!), S[o + 1]!, tt);
          gx += (tt[0] - gx) * p.snake; gy += (tt[1] - gy) * p.snake;
        }
        const lx = gx - px, ly = gy - py, ll = Math.max(Math.hypot(lx, ly), 1e-3);
        const r0 = Math.min(p.halfW, p.halfH) * p.leadR;
        const t = Math.min(Math.max((ll - r0) / (r0 * 1.2), 0), 1), k = t * t * (3 - 2 * t) * p.leaderW * 260 * free;
        ax += (lx / ll) * k; ay += (ly / ll) * k;
      }
      const bx = px - p.boundCx, by = py - p.boundCy;
      const ex = Math.max(Math.abs(bx) - p.boundHw, 0) * Math.sign(bx), ey = Math.max(Math.abs(by) - p.boundHh, 0) * Math.sign(by);
      ax -= ex * 8 * free; ay -= ey * 8 * free;
      // past the box, outward velocity is turned back (a spring alone lets the flock flatten on the box)
      ax -= Math.sign(ex) * Math.max(vx * Math.sign(ex), 0) * Math.min(Math.abs(ex) / 40, 1) * BOX_TURN * free;
      ay -= Math.sign(ey) * Math.max(vy * Math.sign(ey), 0) * Math.min(Math.abs(ey) / 40, 1) * BOX_TURN * free;
      const far = farOf(S[o + 2]!, p.farFrac);
      az += (-(pz - FAR_Z * far) * 1.2 - vz * 0.6) * free;
      // keep-outs: soft repulsion (top bar, conversation, chips, command bar); a held shape barely feels it
      if (p.koOn > 0) {
        const kk = p.koOn * (1 - 0.85 * wEff);
        for (let k = 0; k < kos.length; k += 4) {
          keepOutForce(px, py, vx, vy, kos[k]!, kos[k + 1]!, kos[k + 2]!, kos[k + 3]!, p.koMargin, kof, p.boundCx, p.boundCy);
          ax += kof[0] * kk; ay += kof[1] * kk;
        }
      }
      // vortex
      if (p.vortexW > 0) {
        const rx = px - p.vortexCx, ry = py - p.vortexCy, rl = Math.max(Math.hypot(rx, ry), 1);
        // per-particle orbit speed (±30 %) shears any clump into a full ring; per-particle radius gives the ring body
        const vs = p.vortexSpeed * (0.7 + 0.6 * S[o + 1]!), vr = p.vortexR * (0.8 + 0.4 * S[o + 2]!);
        const dvx = (-ry / rl) * vs + (rx / rl) * (vr - rl) * 3;
        const dvy = (rx / rl) * vs + (ry / rl) * (vr - rl) * 3;
        const kk = 4 * p.vortexW * free;
        ax += (dvx - vx) * kk; ay += (dvy - vy) * kk; az += (-pz * 3 * p.vortexFlat - vz) * kk * 0.5;
      }
      // target attraction
      const dx = tx - px, dy = ty - py, dz = tz - pz, dist = Math.hypot(dx, dy, dz);
      let dvx = dx * 6, dvy = dy * 6, dvz = dz * 6;
      const dl = dist * 6;
      if (dl > 1800) { const k = 1800 / dl; dvx *= k; dvy *= k; dvz *= k; }
      ax += (dvx - vx) * 9 * wEff; ay += (dvy - vy) * 9 * wEff; az += (dvz - vz) * 9 * wEff;
      const sw = Math.min(dist / 250, 1) * wEff * 1.8 * p.flowAmp;
      ax += fl[0] * sw; ay += fl[1] * sw;
      // pointer
      const qx = px - p.pointerX, qy = py - p.pointerY, qr = Math.max(Math.hypot(qx, qy), 1e-3);
      if (qr < p.pointerR) {
        const push = (1 - qr / p.pointerR) ** 2 * 5200 * p.pointerOn * (1 - 0.5 * wEff);
        ax += (qx / qr) * push; ay += (qy / qr) * push;
      }
      const ps = Math.hypot(p.pointerVx, p.pointerVy);
      const fall = Math.exp(-((qr / (p.pointerR * 2.2)) ** 2)) * Math.min(ps / 900, 1) * 4 * p.pointerOn * (1 - 0.6 * wEff);
      ax += p.pointerVx * fall; ay += p.pointerVy * fall;
      // burst
      if (p.burst > 0) {
        const bx = px - p.burstX + (S[o + 1]! - 0.5) * 60, by = py - p.burstY + (S[o + 2]! - 0.5) * 60, bl = Math.max(Math.hypot(bx, by), 1e-3);
        const k = p.burst * (0.4 + S[o]!);
        vx += (bx / bl) * k; vy += (by / bl) * k; vz += (S[o + 2]! - 0.5) * p.burst * 0.5;
      }
      const fk = dt * (1 - p.freeze * 0.97);
      vx += ax * fk; vy += ay * fk; vz += az * fk;
      // agitation waves: cruise speed modulated by a travelling wave → density bands roll through the flock
      {
        const sp0 = Math.max(Math.hypot(vx, vy, vz), 1e-3);
        const wa = (px * wdx + py * wdy) * WAVE_K - p.time * WAVE_W;
        const cruise = p.cruise * (1 + p.waveAmp * Math.sin(wa));
        const kk = (cruise - sp0) / sp0 * Math.min(dt * 1.6, 1) * free * (1 - p.freeze);
        vx += vx * kk; vy += vy * kk; vz += vz * kk;
      }
      // speed limits
      const sp = Math.hypot(vx, vy, vz);
      const maxS = p.speedMax * (1 + p.wild * 1.5) * free + 2200 * (1 - free);
      const minS = p.speedMin * free * (1 - p.freeze);
      if (sp > maxS) { const k = maxS / sp; vx *= k; vy *= k; vz *= k; }
      else if (sp < minS) { const k = minS / Math.max(sp, 1e-3); vx *= k; vy *= k; vz *= k; }
      const damp = Math.exp(-p.freeze * 8 * dt);
      vx *= damp; vy *= damp; vz *= damp;
      let nx = px + vx * dt, ny = py + vy * dt, nz = pz + vz * dt;
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
    const P = this.pos, V = this.vel, C = this.col, S = this.seed;
    const bright = (1 + p.pulse * 0.15) * p.brightness;
    ctx.lineCap = 'round';
    // 4 speed buckets × 3 classes (held, free near, free far) for uncoloured particles, one path each
    const buckets: number[][] = Array.from({ length: 12 }, () => []);
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      if (C[o + 3]! > 0.15) continue;
      const sp = Math.hypot(V[o]!, V[o + 1]!);
      const st = Math.min(Math.max((sp - 120) / 580, 0), 1);
      const cls = V[o + 3]! > 0.5 ? 0 : farOf(S[o + 2]!, p.farFrac) ? 2 : 1;
      buckets[cls * 4 + Math.min(3, Math.floor(st * 4))]!.push(i);
    }
    const proj = (i: number): [number, number, number] => {
      const o = i * 4, k = D / Math.max(D - P[o + 2]!, 50);
      return [(cx + (P[o]! - p.camX) * k) * dpr, (cy - (P[o + 1]! - p.camY) * k) * dpr, k];
    };
    const ds = dotScale(this.count);
    const clsAlpha = [p.shapeExpo * (1 + 0.5 * p.frameGlow) * ds.alpha, p.freeDim * ds.alpha, p.freeDim * FAR_DIM * ds.alpha];
    const clsSize = [(1 + 0.3 * p.frameGlow) * ds.size, ds.size, FAR_SIZE * ds.size];
    for (let b = 0; b < 12; b++) {
      const cls = Math.floor(b / 4), st = ((b % 4) + 0.5) / 4;
      if (!buckets[b]!.length) continue;
      const r = base[0] + (fast[0] - base[0]) * st, g = base[1] + (fast[1] - base[1]) * st, bl = base[2] + (fast[2] - base[2]) * st;
      ctx.strokeStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(bl * 255) | 0},${Math.min(1, (dark ? 0.85 : 0.8) * Math.min(bright, 1.2) * clsAlpha[cls]!)})`;
      ctx.lineWidth = (dark ? 2.3 : 2.7) * dpr * p.sizeScale * clsSize[cls]!;
      ctx.beginPath();
      for (const i of buckets[b]!) {
        const [x, y] = proj(i), o = i * 4;
        const tail = 0.018 * st * dpr;
        ctx.moveTo(x - V[o]! * tail, y + V[o + 1]! * tail);
        ctx.lineTo(x + 0.01, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < this.count; i++) {
      const o = i * 4;
      if (C[o + 3]! <= 0.15) continue;
      const [x, y] = proj(i);
      const m = C[o + 3]!;
      const r = base[0] + (C[o]! - base[0]) * m, g = base[1] + (C[o + 1]! - base[1]) * m, bl = base[2] + (C[o + 2]! - base[2]) * m;
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(bl * 255) | 0},${Math.min(1, (0.6 + 0.4 * S[o + 2]!) * ds.alpha)})`;
      const sz = 2.4 * dpr * p.sizeScale * ds.size;
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
