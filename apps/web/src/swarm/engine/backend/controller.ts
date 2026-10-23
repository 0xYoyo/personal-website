import type { Mood, ShapeSpec } from '@yoyo/protocol';
import type { SimParams } from './params';
import { defaultParams } from './params';
import type { Targets, Viewport } from '../shapes';
import { emptyTargets, frameTargets, ringTargets, shapeTargets } from '../shapes';
import { hash01 } from '../hash';
import type { Scheduler } from './scheduler';

type Rect = { x: number; y: number; w: number; h: number };

/** Numeric knobs that ease between moods (everything else switches instantly). */
type Knobs = Pick<SimParams, 'flowAmp' | 'speedMin' | 'speedMax' | 'align' | 'sep' | 'coh' | 'cruise' | 'waveAmp' | 'leaderW' | 'vortexW' | 'vortexR' | 'vortexSpeed' | 'vortexFlat' | 'wild' | 'freeze' | 'brightness'>;

const BASE: Knobs = { flowAmp: 150, speedMin: 40, speedMax: 340, align: 0.7, sep: 80, coh: 260, cruise: 230, waveAmp: 0.25, leaderW: 1.2, vortexW: 0, vortexR: 120, vortexSpeed: 420, vortexFlat: 0, wild: 0, freeze: 0, brightness: 1 };

export interface ControllerHooks {
  upload(a: Targets, b: Targets): void;
  /** Called when a frame reaches progress 1 (the "lock" flash). */
  onLock?(): void;
}

/**
 * Backend-independent behaviour: owns the shape/mood state machine and writes SimParams every frame.
 * Same controller drives the GPU kernel and the canvas2d simulator, so all tiers act alike.
 */
export class Controller {
  p: SimParams = defaultParams();
  vp: Viewport = { w: 1280, h: 720 };
  n: number;
  mood: Mood = 'idle';
  reduced = false;
  private A: Targets; private B: Targets;
  private holding = false; // a shape is attracted (goal = 1)
  private lastSpec: ShapeSpec | null = null;
  private lastDepth = 1;
  private token = 0;
  private holdTimer: number | null = null;
  private moodTimer: number | null = null;
  private sched: Scheduler;
  private knobs: Knobs = { ...BASE };
  private moodBeforeTransient: Mood = 'idle';
  private frame: { rect: Rect; progress: number; locked: boolean } | null = null;
  private listenLevel = 0;
  private pointerSeen = -1e9;
  private camTX = 0; private camTY = 0;
  private burstPending = 0;
  private hooks: ControllerHooks;
  private ringActive = false;

  constructor(n: number, hooks: ControllerHooks, sched: Scheduler) {
    this.n = n; this.hooks = hooks; this.sched = sched;
    this.A = emptyTargets(n); this.B = emptyTargets(n);
  }

  setViewport(w: number, h: number): void {
    const changed = Math.abs(w - this.vp.w) > 1 || Math.abs(h - this.vp.h) > 1;
    this.vp = { w, h };
    this.p.halfW = w / 2; this.p.halfH = h / 2;
    this.p.pointerR = 90;
    if (changed && this.holding && this.lastSpec && !this.frame && !this.ringActive) {
      // re-layout the held shape for the new viewport, without a re-knit
      const spec = this.lastSpec;
      void shapeTargets(spec, this.n, this.vp, this.lastDepth).then((t) => {
        if (!t || this.lastSpec !== spec) return;
        this.A = t; this.B = t; this.applyShapeMeta(t); this.hooks.upload(this.A, this.B);
      });
    }
  }

  get now(): number { return this.p.time; }
  get targets(): [Targets, Targets] { return [this.A, this.B]; }
  get spec(): ShapeSpec | null { return this.lastSpec; }

  // ------------------------------------------------------------ shapes

  private applyShapeMeta(t: Targets): void {
    this.p.shapeCx = t.cx; this.p.shapeCy = t.cy; this.p.spinOn = t.spin ? 1 : 0;
  }

  /** Install new targets with a staggered hand-off from whatever is held now. */
  private knit(t: Targets, opts: { transit?: boolean; delay?: number } = {}): void {
    const wasHolding = this.holding && this.p.goal > 0;
    this.A = wasHolding ? this.B : t;
    this.B = t;
    this.p.prevGoal = wasHolding ? 1 : 0;
    this.p.goal = 1;
    this.p.transit = wasHolding && opts.transit !== false ? 1 : 0;
    this.p.phaseStart = this.p.time + (opts.delay ?? 0);
    this.p.spread = this.reduced ? 0 : 0.6;
    this.p.ramp = this.reduced ? 0.05 : 0.35;
    this.holding = true;
    this.applyShapeMeta(t);
    this.hooks.upload(this.A, this.B);
  }

  become(spec: ShapeSpec, opts?: { hold?: number; depth?: number }): void {
    if (spec.kind === 'none') { this.release(); return; }
    const tok = ++this.token;
    this.clearHold();
    this.ringActive = false; this.p.ringOn = 0;
    if (spec.kind !== 'frame') this.frame = null;
    this.p.selectFrac = 1.01;
    const depth = opts?.depth ?? 1;
    void shapeTargets(spec, this.n, this.vp, depth).then((t) => {
      if (tok !== this.token || !t) return;
      this.lastSpec = spec; this.lastDepth = depth;
      this.knit(t);
      if (this.mood === 'idle' || this.mood === 'thinking' || this.mood === 'listening') { this.mood = 'speaking'; this.setMoodKnobs('speaking'); }
      if (opts?.hold && opts.hold > 0) {
        // hold counts from when the shape has knitted in (~0.95 s)
        this.holdTimer = this.sched.after(opts.hold / 1000 + this.p.spread + this.p.ramp, () => { if (tok === this.token) this.release(); });
      }
    }).catch((e: unknown) => { console.warn('[swarm] shape failed', e); });
  }

  release(): void {
    this.token++;
    this.clearHold();
    this.ringActive = false; this.p.ringOn = 0;
    this.frame = null;
    this.lastSpec = null;
    if (this.holding) {
      this.A = this.B;
      this.p.prevGoal = 1; this.p.goal = 0; this.p.transit = 0;
      this.p.phaseStart = this.p.time;
      this.hooks.upload(this.A, this.B);
    }
    this.holding = false;
    this.p.selectFrac = 1.01;
    this.p.spinOn = 0;
    if (this.reduced) {
      // reduced motion has no free flight: snap back to the still, scattered field
      const t = emptyTargets(this.n);
      t.pos.set(this.spawn('scatter').pos);
      this.knit(t, { transit: false });
    }
    if (this.mood === 'speaking' || this.mood === 'building' || this.mood === 'listening') this.mood = 'idle';
    this.setMoodKnobs(this.mood);
  }

  buildFrame(rect: Rect, progress: number): void {
    const pr = Math.max(0, Math.min(1, progress));
    const same = this.frame && Math.abs(this.frame.rect.x - rect.x) + Math.abs(this.frame.rect.y - rect.y) + Math.abs(this.frame.rect.w - rect.w) + Math.abs(this.frame.rect.h - rect.h) < 2;
    if (!same) {
      this.token++;
      this.clearHold();
      this.ringActive = false; this.p.ringOn = 0;
      const t = frameTargets(this.n, rect, this.vp);
      this.lastSpec = { kind: 'frame', rect };
      this.knit(t, { transit: false });
      this.frame = { rect: { ...rect }, progress: pr, locked: false };
    }
    const f = this.frame!;
    f.progress = pr;
    this.mood = 'building';
    this.setMoodKnobs('building');
    if (pr >= 1 && !f.locked) { f.locked = true; this.pulse(1); this.hooks.onLock?.(); }
    if (pr < 1) f.locked = false;
  }

  // ------------------------------------------------------------ moods

  mood_(m: Mood): void {
    this.sched.cancel(this.moodTimer); this.moodTimer = null;
    const prev = this.mood;
    if (m === 'excited' || m === 'celebrate') {
      if (prev !== 'excited' && prev !== 'celebrate') this.moodBeforeTransient = prev;
    }
    if (prev === 'listening' && m !== 'listening' && this.ringActive) this.release();
    this.mood = m;
    switch (m) {
      case 'idle':
        if (this.holding && !this.frame) this.release();
        break;
      case 'listening': {
        const t = ringTargets(this.n, Math.min(this.vp.w, this.vp.h) * 0.16, 18, 5, 0, this.vp.h * 0.04);
        this.token++;
        this.frame = null;
        this.knit(t, { transit: true });
        this.ringActive = true;
        this.p.ringOn = 1;
        this.lastSpec = null;
        break;
      }
      case 'thinking':
        if (this.holding) this.release();
        this.mood = 'thinking';
        break;
      case 'speaking':
        break;
      case 'building':
        if (this.holding && !this.frame) this.release();
        this.mood = 'building';
        break;
      case 'excited': {
        this.burstPending = this.reduced ? 0 : 1100;
        if (this.holding) {
          // burst, then re-knit the same shape
          this.A = this.B;
          this.p.prevGoal = 0; this.p.goal = 1; this.p.transit = 0;
          this.p.phaseStart = this.p.time + 0.45;
          this.hooks.upload(this.A, this.B);
        }
        this.moodTimer = this.sched.after(1.4, () => { this.mood = this.holding ? 'speaking' : (this.moodBeforeTransient === 'excited' ? 'idle' : this.moodBeforeTransient); this.setMoodKnobs(this.mood); });
        break;
      }
      case 'celebrate': {
        const wasHolding = this.holding;
        if (wasHolding) { this.p.prevGoal = 0; this.p.goal = 0; this.p.phaseStart = this.p.time; }
        this.burstPending = this.reduced ? 0 : 900;
        this.moodTimer = this.sched.after(3, () => {
          const back = this.moodBeforeTransient === 'celebrate' ? 'idle' : this.moodBeforeTransient;
          this.mood = back;
          if (wasHolding && this.holding) {
            this.A = this.B; this.p.prevGoal = 0; this.p.goal = 1; this.p.transit = 0; this.p.phaseStart = this.p.time;
            this.hooks.upload(this.A, this.B);
            this.mood = back === 'idle' ? 'speaking' : back;
          }
          this.setMoodKnobs(this.mood);
        });
        break;
      }
      case 'asleep':
        break;
    }
    this.setMoodKnobs(this.mood);
  }

  private moodKnobTarget: Knobs = { ...BASE };

  private setMoodKnobs(m: Mood): void {
    const mn = Math.min(this.vp.w, this.vp.h);
    const k: Knobs = { ...BASE };
    switch (m) {
      case 'thinking': Object.assign(k, { vortexW: 1, vortexR: mn * 0.1, vortexSpeed: 560, vortexFlat: 1, speedMax: 650, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 560, waveAmp: 0 }); break;
      case 'building': Object.assign(k, this.frame
        ? { vortexW: 1, vortexR: Math.min(this.frame.rect.w, this.frame.rect.h) * 0.2, vortexSpeed: 380, vortexFlat: 1, speedMax: 520, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 380, waveAmp: 0 }
        : { vortexW: 1, vortexR: mn * 0.2, vortexSpeed: 400, vortexFlat: 1, speedMax: 560, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 400, waveAmp: 0 }); break;
      case 'celebrate': Object.assign(k, { wild: 1, flowAmp: 200, speedMax: 900, align: 0.5, coh: 120, leaderW: 2.2 }); break;
      case 'excited': Object.assign(k, { speedMax: 900, flowAmp: 190 }); break;
      case 'asleep': Object.assign(k, { freeze: 1, brightness: 0.75, flowAmp: 0 }); break;
      case 'listening': Object.assign(k, { flowAmp: 90 }); break;
      default: break;
    }
    if (this.reduced) Object.assign(k, { freeze: 1, flowAmp: 0, wild: 0 });
    this.moodKnobTarget = k;
  }

  // ------------------------------------------------------------ input

  pointer(x: number, y: number, vx: number, vy: number): void {
    this.p.pointerX = x - this.vp.w / 2; this.p.pointerY = this.vp.h / 2 - y;
    this.p.pointerVx = vx; this.p.pointerVy = -vy;
    this.pointerSeen = this.p.time;
    const cl = (v: number): number => Math.max(-1, Math.min(1, v));
    this.camTX = cl(((x / this.vp.w) - 0.5) * 2); this.camTY = cl((0.5 - (y / this.vp.h)) * 2);
  }

  setListeningLevel(l: number): void { this.listenLevel = Math.max(0, Math.min(1, l)); }
  pulse(s = 0.6): void { this.p.pulse = Math.max(this.p.pulse, Math.max(0, Math.min(1, s))); }

  setReduced(r: boolean): void { this.reduced = r; this.p.snap = r ? 1 : 0; this.setMoodKnobs(this.mood); }

  private clearHold(): void { this.sched.cancel(this.holdTimer); this.holdTimer = null; }

  // ------------------------------------------------------------ per frame

  update(dt: number): SimParams {
    const p = this.p;
    p.dt = dt; p.time += dt;
    // ease knobs
    const e = 1 - Math.exp(-dt * 3);
    const kt = this.moodKnobTarget as unknown as Record<string, number>, kc = this.knobs as unknown as Record<string, number>;
    for (const key in kt) { kc[key]! += (kt[key]! - kc[key]!) * e; (p as unknown as Record<string, number>)[key] = kc[key]!; }
    if (this.reduced) { p.freeze = 1; p.flowAmp = 0; }
    // leader wander (murmuration centre of mass drifts around the viewport)
    const t = p.time;
    // leader sweeps a slow Lissajous (~150 px/s): the flock streams after it instead of milling in place
    p.leaderX = Math.sin(t * 0.47) * p.halfW * 0.3 + Math.sin(t * 0.83 + 2) * p.halfW * 0.08;
    p.leaderY = Math.sin(t * 0.61 + 1) * p.halfH * 0.32 + Math.cos(t * 1.07) * p.halfH * 0.06;
    if (this.mood === 'celebrate') { p.leaderX *= 0.3; p.leaderY *= 0.3; }
    p.flowFreq = (1 / 900) * (1 + 4 * p.wild); // wild = small-scale turbulence, not a coherent gust
    // frame / vortex centre
    if (this.frame) {
      const r = this.frame.rect;
      p.vortexCx = r.x + r.w / 2 - this.vp.w / 2; p.vortexCy = this.vp.h / 2 - (r.y + r.h / 2);
      p.selectFrac += (Math.max(this.frame.progress, 0.0) - p.selectFrac) * (1 - Math.exp(-dt * 8));
      if (this.frame.progress >= 1) p.selectFrac = 1.01;
    } else { p.vortexCx = 0; p.vortexCy = this.vp.h * 0.04; }
    // speaking breathing + listening ring
    p.targetScale = this.mood === 'speaking' && !this.reduced ? 1 + 0.012 * Math.sin(t * 2.4) : 1;
    if (this.ringActive) p.ringLevel += (this.listenLevel - p.ringLevel) * (1 - Math.exp(-dt * 14));
    // 3D sway while held
    p.rotY = p.spinOn ? Math.sin(t * 0.7) * 0.32 : 0;
    // pointer presence + velocity decay
    p.pointerOn = t - this.pointerSeen < 2.5 ? 1 : Math.max(0, p.pointerOn - dt);
    const vd = Math.exp(-dt * 6); p.pointerVx *= vd; p.pointerVy *= vd;
    // camera parallax (none while a UI frame is being built so the outline aligns with the DOM)
    const par = this.frame || this.reduced ? 0 : 1;
    const ce = 1 - Math.exp(-dt * 2);
    p.camX += (this.camTX * 16 * par - p.camX) * ce; p.camY += (this.camTY * 10 * par - p.camY) * ce;
    // pulses and bursts
    p.pulse *= Math.exp(-dt * 5);
    p.burst = this.burstPending; this.burstPending = 0;
    p.burstX = p.shapeCx; p.burstY = p.shapeCy;
    return p;
  }

  /** Spawn layouts for the entry pour-in and for reduced motion. */
  spawn(kind: 'edges' | 'scatter' | 'center'): { pos: Float32Array; vel: Float32Array } {
    const n = this.n, pos = new Float32Array(n * 4), vel = new Float32Array(n * 4);
    const hw = this.vp.w / 2, hh = this.vp.h / 2;
    for (let i = 0; i < n; i++) {
      const o = i * 4, a = hash01(i, 21) * Math.PI * 2, r1 = hash01(i, 22), r2 = hash01(i, 23);
      if (kind === 'scatter') {
        pos[o] = (r1 * 2 - 1) * hw * 0.92; pos[o + 1] = (r2 * 2 - 1) * hh * 0.88; pos[o + 2] = (hash01(i, 24) - 0.5) * 60;
        continue;
      }
      if (kind === 'center' || hash01(i, 25) < 0.006) {
        pos[o] = Math.cos(a) * r1 * 3; pos[o + 1] = Math.sin(a) * r1 * 3; pos[o + 2] = 0;
        continue;
      }
      // 4 ribbons pour in from beyond the edges, staggered along their length so they arrive over ~1 s
      const k = Math.floor(hash01(i, 26) * 4);
      const ang = [0.35, 2.2, 3.6, 5.1][k]! + (hash01(i, 27) - 0.5) * 0.35;
      const ex = Math.cos(ang), ey = Math.sin(ang);
      const edge = 1 / Math.max(Math.abs(ex) / hw, Math.abs(ey) / hh);
      const along = edge * (1.02 + r1 * 0.9);          // distance from centre: ribbon length
      const side = (r2 - 0.5) * (60 + r1 * 160);        // ribbon width, widening towards its tail
      const tx = -ey, ty = ex;                          // perpendicular
      pos[o] = ex * along + tx * side; pos[o + 1] = ey * along + ty * side; pos[o + 2] = (hash01(i, 28) - 0.5) * 120;
      const sp = 820 + hash01(i, 29) * 260, sw = 0.5 * (k % 2 ? 1 : -1); // each ribbon curls in
      vel[o] = (-ex * Math.cos(sw) - tx * Math.sin(sw)) * sp;
      vel[o + 1] = (-ey * Math.cos(sw) - ty * Math.sin(sw)) * sp;
    }
    return { pos, vel };
  }
}
