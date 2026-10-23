import type { Mood, ShapeSpec } from '@yoyo/protocol';
import type { SimParams } from './params';
import { defaultParams, MAX_KEEPOUT, shapeExposure, targetArea } from './params';
import type { Targets, Viewport } from '../shapes';
import { emptyTargets, frameTargets, ringTargets, shapeTargets, stageCentre } from '../shapes';
import { hash01 } from '../hash';
import type { Scheduler } from './scheduler';

export type Rect = { x: number; y: number; w: number; h: number };

/** Numeric knobs that ease between moods (everything else switches instantly). */
type Knobs = Pick<SimParams, 'flowAmp' | 'flowFreq' | 'flowRate' | 'speedMin' | 'speedMax' | 'align' | 'sep' | 'coh' | 'cruise' | 'waveAmp' | 'leaderW' | 'leadR' | 'densCap' | 'capK' | 'restK' | 'vortexW' | 'vortexR' | 'vortexSpeed' | 'vortexFlat' | 'wild' | 'freeze' | 'brightness' | 'freeDim'>;

/**
 * Idle = a murmuration (POLISH1 B1): weak, edge-only cohesion; strong alignment; a low-frequency curl flow
 * the flock relaxes toward fast enough that it shears into ribbons; three sub-flocks chasing their own
 * leaders (small dead zone) so the flock stretches, folds and splits; and a density cap that pushes
 * particles out of over-full cells so it never balls up.
 */
/** Seconds of the post-entry migration boost. */
const MIGRATE_S = 1.4;

export const BASE: Knobs = {
  flowAmp: 200, flowFreq: 1 / 420, flowRate: 0.7, speedMin: 90, speedMax: 380, align: 2.2, sep: 25, coh: 0, cruise: 210, waveAmp: 0.1,
  leaderW: 2.4, leadR: 0.05, densCap: 10, capK: 160, restK: 80,
  vortexW: 0, vortexR: 120, vortexSpeed: 420, vortexFlat: 0, wild: 0, freeze: 0, brightness: 1, freeDim: 0.65,
};

/** Rect overlap helper (CSS px). */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * The stage minus the keep-outs: every keep-out that overlaps the stage cuts it on the side that keeps the
 * most area. Shapes are fitted inside this, and the idle leaders fly inside it.
 */
export function freeStage(stage: Rect, keepOut: readonly Rect[], gap = 12): Rect {
  let r = { ...stage };
  for (const k0 of keepOut) {
    const k = { x: k0.x - gap, y: k0.y - gap, w: k0.w + 2 * gap, h: k0.h + 2 * gap };
    if (!overlaps(r, k)) continue;
    const cands: Rect[] = [
      { x: r.x, y: r.y, w: k.x - r.x, h: r.h }, // left of it
      { x: k.x + k.w, y: r.y, w: r.x + r.w - (k.x + k.w), h: r.h }, // right of it
      { x: r.x, y: r.y, w: r.w, h: k.y - r.y }, // above it
      { x: r.x, y: k.y + k.h, w: r.w, h: r.y + r.h - (k.y + k.h) }, // below it
    ].filter((c) => c.w > 0 && c.h > 0);
    if (!cands.length) continue; // fully covered: keep the stage as given rather than nothing
    r = cands.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  }
  return r;
}

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
  /** Where shapes form (CSS px, viewport); null = the whole viewport. */
  private stage: Rect | null = null;
  /** Areas the flock avoids (top bar, conversation, chips, command bar), CSS px. */
  private keepOut: Rect[] = [];
  /** stage minus keep-outs (what shapes are fitted into) */
  private free: Rect | null = null;
  /** Entry beat: shapes use the whole viewport even when a stage is set. */
  private fullFrame = false;
  /** Murmuration roost centre (world px), eased toward the stage centre. */
  private roostX = 0; private roostY = 0;

  constructor(n: number, hooks: ControllerHooks, sched: Scheduler) {
    this.n = n; this.hooks = hooks; this.sched = sched;
    this.A = emptyTargets(n); this.B = emptyTargets(n);
  }

  setViewport(w: number, h: number): void {
    const changed = Math.abs(w - this.vp.w) > 1 || Math.abs(h - this.vp.h) > 1;
    this.vp = { w, h };
    this.p.halfW = w / 2; this.p.halfH = h / 2;
    this.p.pointerR = 90;
    if (changed) this.relayout();
  }

  /**
   * The free area where shapes form (CSS px, viewport), and optionally the rects the flock keeps out of
   * (soft repulsion, in idle and while holding shapes; shapes are fitted inside the stage minus these).
   * A held shape moves there without a re-knit. Omitting `keepOut` keeps the current keep-outs.
   */
  setStage(rect: Rect | null, keepOut?: readonly Rect[]): void {
    const r = rect && rect.w > 0 && rect.h > 0 ? { ...rect } : null;
    const ko = keepOut ? keepOut.filter((k) => k.w > 0 && k.h > 0).slice(0, MAX_KEEPOUT).map((k) => ({ ...k })) : this.keepOut;
    const s = this.stage;
    const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) < 1;
    const koSame = ko.length === this.keepOut.length && ko.every((k, i) => same(k, this.keepOut[i]!));
    if (s && r && same(s, r) && koSame) return;
    this.stage = r; this.keepOut = ko;
    this.free = r ? freeStage(r, ko) : null;
    this.relayout();
  }

  get keepOuts(): readonly Rect[] { return this.keepOut; }

  /** While on, shapes use the whole viewport (the entry's YOYO / name beat) and keep-outs are off. */
  setFullFrame(on: boolean): void {
    if (this.fullFrame === on) return;
    this.fullFrame = on;
    if (!on) {
      // B8: from the first frame after the entry releases, the roost is the stage (not the viewport centre)
      const rc = stageCentre(this.layout());
      this.roostX = rc.x; this.roostY = rc.y;
      this.snapBounds = true;
      // and the flock migrates there fast (~1.4 s): the agent's first words land on the left meanwhile
      this.migrate = MIGRATE_S;
    }
    this.relayout();
  }
  private snapBounds = false;
  private migrate = 0;

  /** The layout shapes are fitted into: the viewport plus the stage minus keep-outs (unless full-frame). */
  private layout(): Viewport {
    return this.free && !this.fullFrame ? { ...this.vp, stage: this.free } : this.vp;
  }

  private relayout(): void {
    if (!this.holding || !this.lastSpec || this.frame || this.ringActive) return;
    // re-layout the held shape for the new viewport/stage, without a re-knit
    const spec = this.lastSpec;
    void shapeTargets(spec, this.n, this.layout(), this.lastDepth).then((t) => {
      if (!t || this.lastSpec !== spec) return;
      this.A = t; this.B = t; this.applyShapeMeta(t); this.hooks.upload(this.A, this.B);
    });
  }

  get now(): number { return this.p.time; }
  get targets(): [Targets, Targets] { return [this.A, this.B]; }
  get spec(): ShapeSpec | null { return this.lastSpec; }

  // ------------------------------------------------------------ shapes

  private applyShapeMeta(t: Targets): void {
    this.p.shapeCx = t.cx; this.p.shapeCy = t.cy; this.p.spinOn = t.spin ? 1 : 0;
    // B5: dense shapes are exposed down (and bloom less) so glyph edges stay readable
    this.expoTarget = t.spin ? 0.85 : shapeExposure(this.n, targetArea(t.pos, t.n), this.vp.w, this.vp.h);
  }
  private expoTarget = 1;

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
    void shapeTargets(spec, this.n, this.layout(), depth).then((t) => {
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
        const L = this.layout();
        const c = L.stage ? stageCentre(L) : { x: 0, y: this.vp.h * 0.04 };
        const rr = L.stage ? Math.min(L.stage.w, L.stage.h) * 0.3 : Math.min(this.vp.w, this.vp.h) * 0.16;
        const t = ringTargets(this.n, Math.min(rr, Math.min(this.vp.w, this.vp.h) * 0.16), 18, 5, c.x, c.y);
        this.token++;
        this.frame = null;
        this.knit(t, { transit: true });
        this.ringActive = true;
        this.p.ringOn = 1;
        this.lastSpec = null;
        break;
      }
      case 'thinking':
        // B4: a held shape stays held while the reply is thought about; the next become() retargets it directly
        // (shape → shape with the staggered knit). Only release() (or idle) disperses it.
        this.mood = 'thinking';
        if (this.holding && !this.ringActive) { this.setMoodKnobs('speaking'); return; }
        if (this.ringActive) this.release();
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
    if (m === 'thinking' && this.holding && !this.ringActive) m = 'speaking';
    const mn = Math.min(this.vp.w, this.vp.h);
    const k: Knobs = { ...BASE };
    switch (m) {
      case 'thinking': Object.assign(k, { flowFreq: 1 / 900, flowRate: 0.25, capK: 0, restK: 0, vortexW: 1, vortexR: mn * 0.1, vortexSpeed: 560, vortexFlat: 1, speedMax: 650, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 560, waveAmp: 0 }); break;
      case 'building': Object.assign(k, { flowFreq: 1 / 900, flowRate: 0.25, capK: 0, restK: 0 }, this.frame
        ? { vortexW: 1, vortexR: Math.min(this.frame.rect.w, this.frame.rect.h) * 0.2, vortexSpeed: 380, vortexFlat: 1, speedMax: 520, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 380, waveAmp: 0 }
        : { vortexW: 1, vortexR: mn * 0.2, vortexSpeed: 400, vortexFlat: 1, speedMax: 560, flowAmp: 40, align: 0.3, coh: 0, sep: 140, leaderW: 0, cruise: 400, waveAmp: 0 }); break;
      case 'celebrate': Object.assign(k, { wild: 1, flowAmp: 200, flowFreq: 5 / 900, flowRate: 0.25, sep: 80, restK: 0, speedMax: 900, align: 0.5, coh: 120, leaderW: 2.2, leadR: 0.35, capK: 0 }); break;
      case 'excited': Object.assign(k, { speedMax: 900, flowAmp: 190 }); break;
      case 'asleep': Object.assign(k, { freeze: 1, brightness: 0.75, flowAmp: 0, freeDim: 1 }); break;
      case 'listening': Object.assign(k, { flowAmp: 90 }); break;
      default: break;
    }
    if (this.reduced) Object.assign(k, { freeze: 1, flowAmp: 0, wild: 0, freeDim: 1 });
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
    if (this.migrate > 0) {
      // post-entry migration boost: stronger, faster pull to the stage (B8), fading out
      this.migrate = Math.max(0, this.migrate - dt);
      const m = this.migrate / MIGRATE_S;
      p.leaderW *= 1 + 2.5 * m; p.speedMax += 520 * m; p.cruise += 300 * m; p.leadR *= 1 - 0.5 * m;
    }
    // leader wander (murmuration centre of mass drifts around the viewport)
    const t = p.time;
    // leader sweeps a slow Lissajous (~150 px/s): the flock streams after it instead of milling in place
    // the roost eases toward the stage centre (≈ 99 % there after 4 s), and its sweep shrinks to the stage
    const L = this.layout();
    const rc = stageCentre(L);
    const re = this.snapBounds ? 1 : 1 - Math.exp(-dt / 0.6);
    this.roostX += (rc.x - this.roostX) * re; this.roostY += (rc.y - this.roostY) * re;
    const ax = L.stage ? Math.min(p.halfW, L.stage.w * 0.5) : p.halfW * 0.6, ay = L.stage ? Math.min(p.halfH, L.stage.h * 0.5) : p.halfH * 0.6;
    // free flight stays in a soft box: the viewport (inset), or around the stage when there is one
    // (a UI frame being built takes the whole viewport: its construction vortex sits on the frame)
    const boxed = !!L.stage && !this.frame;
    const bw = boxed ? Math.min(p.halfW * 0.8, L.stage!.w * 0.5) : p.halfW * 0.72, bh = boxed ? Math.min(p.halfH * 0.8, L.stage!.h * 0.44) : p.halfH * 0.7;
    p.boundCx += ((boxed ? this.roostX : 0) - p.boundCx) * re; p.boundCy += ((boxed ? this.roostY : 0) - p.boundCy) * re;
    p.boundHw += (bw - p.boundHw) * re; p.boundHh += (bh - p.boundHh) * re;
    this.snapBounds = false;
    // idle-like moods fly as three trailing sub-flocks (ribbons); the others follow one point leader
    const groups = this.mood === 'idle' || this.mood === 'speaking' || this.mood === 'listening' || this.mood === 'excited' || (this.mood === 'thinking' && this.holding);
    // point leader (non-idle moods) sweeps a slow Lissajous around the roost
    p.leaderX = this.roostX + Math.sin(t * 0.47) * ax * 0.5 + Math.sin(t * 0.83 + 2) * ax * 0.08;
    p.leaderY = this.roostY + Math.sin(t * 0.61 + 1) * ay * 0.5 + Math.cos(t * 1.07) * ay * 0.06;
    // idle: three trails (see SimParams.snake). Paths stay inside the stage; speeds ~120–220 px/s
    p.snake += ((groups ? 1 : 0) - p.snake) * (1 - Math.exp(-dt * 2));
    p.snakeCx = this.roostX; p.snakeCy = this.roostY;
    p.snakeLag = 2.6; p.snakeW = Math.min(ax, ay) * 0.1;
    // [amp x, amp y, ω x, ω y, phase x, phase y, centre offset x, centre offset y] (amps/offsets × stage half)
    const G = [
      [0.62, 0.5, 0.9, 1.23, 0.0, 1.0, -0.18, 0.2],
      [0.55, 0.6, 1.07, 0.81, 2.1, 0.4, 0.2, -0.12],
      [0.5, 0.46, 1.31, 0.97, 4.0, 2.7, 0.05, -0.3],
    ] as const;
    const PP = p as unknown as Record<string, number>;
    G.forEach(([kx, ky, wx, wy, px, py, ox, oy], g) => {
      // the trail centre offset is folded into the phase-free part: x = c + o + a·sin(…)
      PP[`g${g}ax`] = ax * kx; PP[`g${g}ay`] = ay * ky; PP[`g${g}wx`] = wx; PP[`g${g}wy`] = wy; PP[`g${g}px`] = px; PP[`g${g}py`] = py;
      PP[`g${g}ox`] = ax * ox; PP[`g${g}oy`] = ay * oy;
    });
    if (this.mood === 'celebrate') { p.leaderX = this.roostX + (p.leaderX - this.roostX) * 0.3; p.leaderY = this.roostY + (p.leaderY - this.roostY) * 0.3; }
    // keep-outs (world px); off during the entry's full-frame beat and while a UI frame is built
    const ko = this.fullFrame || this.frame ? [] : this.keepOut;
    const P = p as unknown as Record<string, number>;
    for (let i = 0; i < MAX_KEEPOUT; i++) {
      const k = ko[i];
      P[`ko${i}x`] = k ? k.x + k.w / 2 - this.vp.w / 2 : 0; P[`ko${i}y`] = k ? this.vp.h / 2 - (k.y + k.h / 2) : 0;
      P[`ko${i}w`] = k ? k.w / 2 : -1; P[`ko${i}h`] = k ? k.h / 2 : -1;
    }
    p.koOn = ko.length ? 1 : 0;
    p.farFrac = this.reduced ? 0 : 0.2;
    // frame / vortex centre
    if (this.frame) {
      const r = this.frame.rect;
      p.vortexCx = r.x + r.w / 2 - this.vp.w / 2; p.vortexCy = this.vp.h / 2 - (r.y + r.h / 2);
      // B7: the border fills 1.6× faster (density ×1.6 at a given progress) and glows, so it reads on every tier
      p.selectFrac += (Math.min(1.01, this.frame.progress * 1.6) - p.selectFrac) * (1 - Math.exp(-dt * 8));
      if (this.frame.progress >= 1) p.selectFrac = 1.01;
    } else if (L.stage) { p.vortexCx = rc.x; p.vortexCy = rc.y; } else { p.vortexCx = 0; p.vortexCy = this.vp.h * 0.04; }
    const ge = 1 - Math.exp(-dt * 4);
    p.frameGlow += ((this.frame ? 1 : 0) - p.frameGlow) * ge;
    const ex = this.holding && !this.frame && !this.ringActive ? this.expoTarget : 1;
    p.shapeExpo += (ex - p.shapeExpo) * ge;
    p.bloomK = p.shapeExpo ** 2;
    // speaking breathing + listening ring
    // breathing while speaking, plus the per-word pulse (~6 % scale, decays in ~120 ms)
    p.targetScale = this.reduced ? 1 : (this.mood === 'speaking' ? 1 + 0.012 * Math.sin(t * 2.4) : 1) * (1 + 0.1 * p.pulse);
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
    p.pulse *= Math.exp(-dt * 14);
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
