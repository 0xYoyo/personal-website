import type { Mood, Scene, SceneGroup, ShapeSpec } from '@yoyo/protocol';
import type { SimParams } from './params';
import { BOUND_INSET, defaultParams, HOLE_R, MAX_KEEPOUT, shapeExposure, targetArea } from './params';
import type { Targets, Viewport } from '../shapes';
import { emptyTargets, frameTargets, ringTargets, shapeTargets, stageCentre } from '../shapes';
import { hash01 } from '../hash';
import type { Scheduler } from './scheduler';
import {
  GROUP_FLOATS, GROUP_TEXELS, HIST, PoseHistory, T_POSE, applyPose, evalPath, groupCounts, groupLook, matchSlots, partition,
  poseToWorld, reassign, sceneFor, writeGroup, type Pose,
} from '../perform';
import { sceneShapeTargets, stageFrame, type LocalTargets } from '../sceneShapes';

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
/** B3 dim frame: share of the particles that stay on the border, its brightness and band thickness (px). */
export const DIM_SHARE = 0.25;
const DIM_BRIGHT = 0.6;
const DIM_THICKNESS = 5;
const DIM_FREE = 0.38;
/** Below this share of the (inset) viewport free of keep-outs, a dim frame's freed particles fade out. */
export const DIM_ROOM = 0.12;

/** Share of the viewport (inset 48 px) that is at least `pad` px clear of every rect (CSS px), on a 32 × 32 grid. */
export function freeShare(vp: { w: number; h: number }, rects: readonly Rect[], pad = 30): number {
  let free = 0;
  const N = 32;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = 48 + ((i + 0.5) / N) * (vp.w - 96), y = 48 + ((j + 0.5) / N) * (vp.h - 96);
    if (!rects.some((r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad)) free++;
  }
  return free / (N * N);
}
/** B2: a touch point stays present this long; a still cursor turns curious after this (s). */
const TOUCH_HOLD_S = 2;
export const CURIOUS_AFTER = 0.5;

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

/**
 * The dim frame's own keep-out (B3): the frame grown by up to DIM_GAP px per side, so the freed flock keeps a
 * clear gap off the thin border — but never into a neighbouring keep-out (a phone's caption sits 14 px above it).
 */
const DIM_GAP = 28;
export function dimFrameKeepOut(f: Rect, others: readonly Rect[]): Rect {
  let t = DIM_GAP, b = DIM_GAP, l = DIM_GAP, r = DIM_GAP;
  for (const k of others) {
    const hx = k.x < f.x + f.w && f.x < k.x + k.w, vy = k.y < f.y + f.h && f.y < k.y + k.h;
    if (hx && k.y + k.h <= f.y) t = Math.min(t, Math.max(0, f.y - (k.y + k.h) - 4));
    if (hx && k.y >= f.y + f.h) b = Math.min(b, Math.max(0, k.y - (f.y + f.h) - 4));
    if (vy && k.x + k.w <= f.x) l = Math.min(l, Math.max(0, f.x - (k.x + k.w) - 4));
    if (vy && k.x >= f.x + f.w) r = Math.min(r, Math.max(0, k.x - (f.x + f.w) - 4));
  }
  return { x: f.x - l, y: f.y - t, w: f.w + l + r, h: f.h + t + b };
}

/** The dim frame's faces that a neighbouring keep-out sits against (within 40 px): no exit there. */
export function dimFrameBlocks(f: Rect, others: readonly Rect[], gap = 40): { t: number; b: number; l: number; r: number } {
  const o = { t: 0, b: 0, l: 0, r: 0 };
  for (const k of others) {
    const hx = k.x < f.x + f.w && f.x < k.x + k.w, vy = k.y < f.y + f.h && f.y < k.y + k.h;
    if (hx && k.y + k.h <= f.y + 1 && f.y - (k.y + k.h) < gap) o.t = 1;
    if (hx && k.y >= f.y + f.h - 1 && k.y - (f.y + f.h) < gap) o.b = 1;
    if (vy && k.x + k.w <= f.x + 1 && f.x - (k.x + k.w) < gap) o.l = 1;
    if (vy && k.x >= f.x + f.w - 1 && k.x - (f.x + f.w) < gap) o.r = 1;
  }
  return o;
}

interface GroupRT {
  g: SceneGroup;
  /** the group's shape particles, and for each the index of its local target */
  members: number[]; slots: Int32Array;
  trail: number[];
  prev: Pose | null;
  hist: PoseHistory;
  chase: { x: number; y: number; on: number; lean: number } | null;
}

interface ShowRT {
  source: Scene; scene: Scene; start: number;
  counts: number[]; trails: number[];
  assign: Uint8Array;
  /** n × [group, trail u, reveal, 0] */
  gi: Float32Array;
  groups: GroupRT[];
  locals: LocalTargets[];
  /** the layout the groups were sampled for */
  layoutKey: string;
}

const layoutKey = (L: Viewport): string => {
  const s = L.stage;
  return `${Math.round(L.w)}x${Math.round(L.h)}:${s ? [s.x, s.y, s.w, s.h].map((v) => Math.round(v)).join(',') : '-'}:${L.lite ? 1 : 0}`;
};

export interface ControllerHooks {
  upload(a: Targets, b: Targets): void;
  /** Per-particle group info for a performed scene (n × [group, trail u, reveal, 0]); null = no groups. */
  groups?(info: Float32Array | null): void;
  /** The group data (poses, looks, trail history), every frame while a scene is performed. */
  groupData?(data: Float32Array): void;
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
  private frame: { rect: Rect; progress: number; locked: boolean; dim: boolean } | null = null;
  private listenLevel = 0;
  private pointerSeen = -1e9;
  // B2: cursor presence (CSS px screen position, last real movement, touch, wake tail in world px)
  private ptrX = 0; private ptrY = 0; private ptrMoved = -1e9; private ptrTouch = false;
  private tailX = 1e5; private tailY = 1e5;
  /** B3: gather() — sim time it ends, its length (s), and the post-gather easing */
  private gatherEnd = -1; private gatherT = 1;
  /** B5: the 2D tier samples shapes edge-weighted and builds YOYO without three.js */
  private lite = false;
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
  /** The scene being performed (wave 3 show): groups, their particles, poses. */
  private show: ShowRT | null = null;
  private groupData = new Float32Array(GROUP_FLOATS);

  constructor(n: number, hooks: ControllerHooks, sched: Scheduler) {
    this.n = n; this.hooks = hooks; this.sched = sched;
    this.A = emptyTargets(n); this.B = emptyTargets(n);
  }

  setViewport(w: number, h: number): void {
    const changed = Math.abs(w - this.vp.w) > 1 || Math.abs(h - this.vp.h) > 1;
    this.vp = { w, h };
    this.p.halfW = w / 2; this.p.halfH = h / 2;
    this.p.pointerR = HOLE_R;
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
    if (this.frame?.dim) this.setMoodKnobs(this.mood);
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
    const v: Viewport = this.free && !this.fullFrame ? { ...this.vp, stage: this.free } : { ...this.vp };
    if (this.lite) v.lite = true;
    return v;
  }

  /** The free stage scenes are laid out in (CSS px): the stage minus keep-outs, or the viewport. */
  get stageBox(): Rect {
    const L = this.layout();
    return L.stage ? { ...L.stage } : { x: 0, y: 0, w: this.vp.w, h: this.vp.h };
  }

  /** The layout shapes are fitted into (QA / warm-up). */
  get shapeLayout(): Viewport { return this.layout(); }

  /** 2D tier (B5): edge-weighted shape sampling, YOYO from the 2D font mask (no three.js chunk). */
  setLite(on: boolean): void { if (this.lite === on) return; this.lite = on; this.relayout(); }

  private relayout(): void {
    if (this.show) { void this.relayoutShow(); return; }
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
  /** The scene being performed (null outside the show). */
  get scene(): Scene | null { return this.show?.source ?? null; }

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

  /** Resolves true once the shape has knitted in (targets ready + the staggered knit), false if superseded. */
  become(spec: ShapeSpec, opts?: { hold?: number; depth?: number }): Promise<boolean> {
    if (spec.kind === 'none') { this.release(); return Promise.resolve(false); }
    const tok = ++this.token;
    this.clearHold();
    this.ringActive = false; this.p.ringOn = 0;
    if (spec.kind !== 'frame') this.frame = null;
    this.p.selectFrac = 1.01;
    const depth = opts?.depth ?? 1;
    let knitted: (ok: boolean) => void = () => undefined;
    const done = new Promise<boolean>((r) => { knitted = r; });
    void shapeTargets(spec, this.n, this.layout(), depth).then((t) => {
      if (tok !== this.token || !t) { knitted(false); return; }
      this.lastSpec = spec; this.lastDepth = depth;
      this.leaveShow();
      this.knit(t);
      if (this.mood === 'idle' || this.mood === 'thinking' || this.mood === 'listening') { this.mood = 'speaking'; this.setMoodKnobs('speaking'); }
      if (opts?.hold && opts.hold > 0) {
        // hold counts from when the shape has knitted in (~0.95 s)
        this.holdTimer = this.sched.after(opts.hold / 1000 + this.p.spread + this.p.ramp, () => { if (tok === this.token) this.release(); });
      }
      this.sched.after(this.p.spread + this.p.ramp, () => knitted(tok === this.token));
    }).catch((e: unknown) => { console.warn('[swarm] shape failed', e); knitted(false); });
    return done;
  }

  release(): void {
    this.token++;
    this.leaveShow();
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

  /**
   * A UI frame drawn by the swarm. `dim` (B3, only once locked): a thin, low-brightness border made of ~25 %
   * of the particles; the rest are freed to idle around it (keep-outs on, and the frame itself is one).
   */
  buildFrame(rect: Rect, progress: number, opts?: { dim?: boolean }): void {
    const pr = Math.max(0, Math.min(1, progress));
    const same = this.frame && Math.abs(this.frame.rect.x - rect.x) + Math.abs(this.frame.rect.y - rect.y) + Math.abs(this.frame.rect.w - rect.w) + Math.abs(this.frame.rect.h - rect.h) < 2;
    const dim = !!opts?.dim && pr >= 1;
    if (!same) {
      this.token++;
      this.leaveShow();
      this.clearHold();
      this.ringActive = false; this.p.ringOn = 0;
      const t = frameTargets(this.n, rect, this.vp, dim ? DIM_THICKNESS : 11);
      this.lastSpec = { kind: 'frame', rect };
      this.knit(t, { transit: false });
      this.frame = { rect: { ...rect }, progress: pr, locked: dim, dim };
      if (dim) this.knobs.vortexW = 0;
    }
    const f = this.frame!;
    f.progress = pr;
    if (dim !== f.dim) {
      // same rect, thinner band: the held particles slide a few px, no re-knit
      f.dim = dim;
      // the construction vortex stops at once (easing it out would suck the freed flock into the frame)
      if (dim) this.knobs.vortexW = 0;
      const t = frameTargets(this.n, f.rect, this.vp, dim ? DIM_THICKNESS : 11);
      this.A = t; this.B = t; this.applyShapeMeta(t); this.hooks.upload(this.A, this.B);
    }
    this.mood = dim ? 'idle' : 'building';
    this.setMoodKnobs(this.mood);
    if (pr >= 1 && !f.locked) { f.locked = true; this.pulse(1); this.hooks.onLock?.(); }
    if (pr < 1) f.locked = false;
  }

  /**
   * B3: pull the flock to the stage centre within `ms` (used before releases after overlays). Drops any held
   * shape or frame; the flight is free (keep-outs at full strength, goals routed around them), so the flock
   * never crosses the words on its way. Resolves when the time is up; the flock then idles from there.
   */
  gather(ms: number): Promise<void> {
    const T = Math.max(0.2, ms / 1000);
    this.release();
    // a quicker hand-off than a plain release, so the flight fits in `ms` (all at once crowds the corners)
    this.p.spread = Math.min(this.p.spread, 0.25); this.p.ramp = Math.min(this.p.ramp, 0.2);
    this.gatherT = T; this.gatherEnd = this.p.time + T;
    return new Promise((res) => { this.sched.after(T, res); });
  }
  get gathering(): boolean { return this.p.time < this.gatherEnd; }

  // ------------------------------------------------------------ the show (wave 3): groups, paths, trails

  /**
   * Perform a scene: the particles split into its groups (nearest-first when the group count changes, so a
   * split or merge reads as one flow; kept as they are when it doesn't), each group knits into its shape, and
   * from then on every frame only the groups' poses move (the backends transform the sampled points — the
   * shape moves, it never re-knits). Resolves true once knitted in, false if something else took the body.
   */
  perform(scene: Scene): Promise<boolean> {
    const tok = ++this.token;
    this.clearHold();
    this.ringActive = false; this.p.ringOn = 0;
    this.frame = null;
    this.p.selectFrac = 1.01;
    const sc = sceneFor(scene, this.lite);
    const L = this.layout();
    let knitted: (ok: boolean) => void = () => undefined;
    const done = new Promise<boolean>((r) => { knitted = r; });
    void this.sampleScene(sc, L).then((locals) => {
      if (tok !== this.token || !locals) { knitted(false); return; }
      this.installShow(scene, sc, locals, L);
      if (this.mood === 'idle' || this.mood === 'thinking' || this.mood === 'listening') { this.mood = 'speaking'; this.setMoodKnobs('speaking'); }
      this.sched.after(this.p.spread + this.p.ramp, () => knitted(tok === this.token));
    }).catch((e: unknown) => { console.warn('[swarm] scene failed', e); knitted(false); });
    return done;
  }

  /** Group sizes for a scene on this tier: [shape particles, trail particles] per group. */
  private sceneCounts(sc: Scene): { counts: number[]; trails: number[] } {
    const counts = groupCounts(this.n, sc.groups.map((g) => g.share));
    const trails = sc.groups.map((g, k) => (this.lite ? 0 : Math.round(Math.min(0.6, Math.max(0, g.trail ?? 0)) * counts[k]!)));
    return { counts, trails };
  }

  private async sampleScene(sc: Scene, L: Viewport): Promise<LocalTargets[] | null> {
    const { counts, trails } = this.sceneCounts(sc);
    return Promise.all(sc.groups.map((g, k) => sceneShapeTargets(g.shape, counts[k]! - trails[k]!, L, k + 1)));
  }

  /** Where every particle is held now (world, n × 4), or null when nothing is held. */
  private heldWorld(): Float32Array | null {
    if (!this.holding || this.p.goal <= 0) return null;
    if (!this.show) return this.B.pos;
    const out = new Float32Array(this.n * 4);
    const S = this.show, B = this.B.pos, d = this.groupData;
    const pose: Pose = { x: 0, y: 0, rot: 0, scale: 1, sx: 1 };
    for (let i = 0; i < this.n; i++) {
      const o = i * 4, g = S.gi[o]!;
      if (g < 0) { out.set(B.subarray(o, o + 4), o); continue; }
      const r = g * GROUP_TEXELS * 4 + T_POSE * 4;
      pose.x = d[r]!; pose.y = d[r + 1]!; pose.rot = d[r + 2]!; pose.scale = d[r + 3]!; pose.sx = d[r + 4]!;
      applyPose(B[o]!, B[o + 1]!, B[o + 2]!, pose, out, o);
      out[o + 3] = B[o + 3]!;
    }
    return out;
  }

  private installShow(source: Scene, sc: Scene, locals: LocalTargets[], L: Viewport): void {
    const n = this.n, G = sc.groups.length;
    const { counts, trails } = this.sceneCounts(sc);
    const F = stageFrame(L);
    const pose0 = sc.groups.map((g) => poseToWorld(evalPath(g.path, this.reduced ? (sc.tableau ?? sc.duration * 0.85) : 0), F.cx, F.cy, F.hw, F.hh));
    // each group's shape targets in the world at the scene's first pose (for the nearest-first split / merge)
    const world0 = locals.map((lt, k) => {
      const m = lt.pos.length / 4, w = new Float32Array(m * 4);
      for (let j = 0; j < m; j++) applyPose(lt.pos[j * 4]!, lt.pos[j * 4 + 1]!, lt.pos[j * 4 + 2]!, pose0[k]!, w, j * 4);
      return w;
    });
    const prev = this.heldWorld();
    const old = this.show;
    const keep = !!old && old.counts.length === G && old.counts.every((c, k) => c === counts[k]);
    const assign = keep ? old.assign : prev ? reassign(prev, n, world0, counts) : partition(n, sc.groups.map((g) => g.share));
    const B = emptyTargets(n);
    const gi = new Float32Array(n * 4);
    const groups: GroupRT[] = [];
    for (let k = 0; k < G; k++) {
      const members: number[] = [];
      for (let i = 0; i < n; i++) if (assign[i] === k) members.push(i);
      // trail particles: the group's members with the lowest trail hash
      const byTrail = trails[k]! > 0 ? [...members].sort((a, b) => hash01(a, 55) - hash01(b, 55)) : [];
      const trailSet = new Set(byTrail.slice(0, trails[k]!));
      const shapeMembers = members.filter((i) => !trailSet.has(i));
      const lt = locals[k]!;
      const m = lt.pos.length / 4;
      const slots = prev && !keep ? matchSlots(shapeMembers, prev, world0[k]!) : Int32Array.from(shapeMembers, (_, j) => j % Math.max(m, 1));
      // the trail rides at the shape's rear (local −x, the lower half: a kart's exhaust)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let j = 0; j < m; j++) { x0 = Math.min(x0, lt.pos[j * 4]!); x1 = Math.max(x1, lt.pos[j * 4]!); y0 = Math.min(y0, lt.pos[j * 4 + 1]!); y1 = Math.max(y1, lt.pos[j * 4 + 1]!); }
      const diag = Math.max(Math.hypot(x1 - x0, y1 - y0), 1);
      shapeMembers.forEach((i, j) => {
        const s = slots[j]!, o = i * 4, so = s * 4;
        B.pos[o] = lt.pos[so]!; B.pos[o + 1] = lt.pos[so + 1]!; B.pos[o + 2] = lt.pos[so + 2]!;
        // the hand-off delay: nearest first after a split / merge, else the usual hash + left→right sweep
        const near = prev && !keep ? Math.min(1, Math.hypot(prev[o]! - world0[k]![so]!, prev[o + 1]! - world0[k]![so + 1]!) / (diag * 1.6)) : (lt.pos[so]! - x0) / Math.max(x1 - x0, 1);
        B.pos[o + 3] = 0.3 * hash01(i, 11) + 0.7 * near;
        B.col.set(lt.col.subarray(so, so + 4), o);
        gi[o] = k; gi[o + 1] = 0; gi[o + 2] = lt.pos[so + 3]!;
      });
      for (const i of trailSet) {
        const o = i * 4, u = 0.04 + 0.96 * hash01(i, 56);
        B.pos[o] = x0 + (x1 - x0) * (0.06 + 0.06 * hash01(i, 57));
        B.pos[o + 1] = y0 + (y1 - y0) * (0.12 + (0.22 + 0.25 * u) * (hash01(i, 58) - 0.5) + 0.12);
        B.pos[o + 2] = (hash01(i, 59) - 0.5) * 20;
        B.pos[o + 3] = 0.4 + 0.6 * hash01(i, 11);
        gi[o] = k; gi[o + 1] = u; gi[o + 2] = 0;
      }
      if (!lt.col.some((v, j) => j % 4 === 3 && v > 0)) { /* uncoloured */ } else B.colored = true;
      groups.push({ g: sc.groups[k]!, members: shapeMembers, slots, trail: [...trailSet], prev: null, hist: new PoseHistory(), chase: null });
    }
    // meta: the scene's footprint at its first pose
    const all = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const k = gi[i * 4]!;
      applyPose(B.pos[i * 4]!, B.pos[i * 4 + 1]!, B.pos[i * 4 + 2]!, pose0[k]!, all, i * 4);
    }
    B.cx = F.cx; B.cy = F.cy; B.spin = false;
    // hand-off: from where the particles are held now (baked to the world) to the groups
    const wasHolding = this.holding && this.p.goal > 0;
    const A = emptyTargets(n);
    if (prev) { A.pos.set(prev); A.col.set(this.B.col); } else { A.pos.set(all); }
    this.A = wasHolding ? A : B; this.B = B;
    this.p.prevGoal = wasHolding ? 1 : 0;
    this.p.goal = 1;
    this.p.transit = wasHolding ? 1 : 0;
    this.p.phaseStart = this.p.time;
    this.p.spread = this.reduced ? 0 : 0.6;
    this.p.ramp = this.reduced ? 0.05 : 0.35;
    this.holding = true;
    this.lastSpec = null;
    this.p.shapeCx = F.cx; this.p.shapeCy = F.cy; this.p.spinOn = 0;
    this.expoTarget = shapeExposure(n, targetArea(all, n), this.vp.w, this.vp.h);
    this.show = { source, scene: sc, start: this.p.time, counts, trails, assign, gi, groups, locals, layoutKey: layoutKey(L) };
    this.hooks.groups?.(gi);
    this.updateShow(0);
    this.hooks.upload(this.A, this.B);
  }

  /** The stage changed mid-scene: re-sample the groups for the new layout, same particles, no re-knit. */
  private async relayoutShow(): Promise<void> {
    const S = this.show;
    if (!S) return;
    const L = this.layout();
    // keep-outs change with every caption word: only a different free stage needs new samples
    const key = layoutKey(L);
    if (key === S.layoutKey) return;
    S.layoutKey = key;
    const locals = await this.sampleScene(S.scene, L);
    if (this.show !== S || !locals) return;
    const B = this.B;
    S.groups.forEach((G, k) => {
      const lt = locals[k]!;
      G.members.forEach((i, j) => {
        const so = G.slots[j]! * 4, o = i * 4;
        B.pos[o] = lt.pos[so]!; B.pos[o + 1] = lt.pos[so + 1]!; B.pos[o + 2] = lt.pos[so + 2]!;
      });
    });
    S.locals = locals;
    const F = stageFrame(L);
    B.cx = F.cx; B.cy = F.cy;
    this.p.shapeCx = F.cx; this.p.shapeCy = F.cy;
    if (this.A !== B) this.A = B;
    this.hooks.upload(this.A, this.B);
  }

  /** Leave the scene: its current pose is baked into world targets (what follows morphs from exactly there). */
  private leaveShow(): void {
    if (!this.show) return;
    const w = this.heldWorld();
    const t = emptyTargets(this.n);
    if (w) t.pos.set(w); else t.pos.set(this.B.pos);
    t.col.set(this.B.col); t.colored = this.B.colored; t.cx = this.B.cx; t.cy = this.B.cy;
    this.show = null;
    this.p.grpOn = 0;
    this.A = t; this.B = t;
    this.hooks.groups?.(null);
    this.hooks.upload(this.A, this.B);
  }

  /** Per frame: every group's pose, look and trail history → the group data the backends read. */
  private updateShow(dt: number): void {
    const S = this.show!;
    const p = this.p;
    const tms = this.reduced ? (S.scene.tableau ?? S.scene.duration * 0.85) : (p.time - S.start) * 1000;
    const F = stageFrame(this.layout());
    const d = this.groupData;
    d.fill(0);
    S.groups.forEach((G, k) => {
      let pose = poseToWorld(evalPath(G.g.path, tms), F.cx, F.cy, F.hw, F.hh);
      if (G.g.follow === 'pointer') pose = this.chase(G, pose, dt);
      const look = groupLook(G.g, tms);
      G.hist.push(p.time, pose);
      const span = (G.g.trailMs ?? 420) / 1000;
      const hist: Pose[] = [];
      for (let j = 0; j < HIST; j++) hist.push(G.hist.at(p.time - (j / (HIST - 1)) * span));
      const prev = G.prev ?? pose;
      writeGroup(d, k, pose, prev, look.bright, look.fill, prev.sx, hist);
      G.prev = pose;
    });
    p.grpOn = 1;
    this.hooks.groupData?.(d);
  }

  /**
   * A group that follows the pointer: while a cursor is present it chases it (lagging ~0.3 s, stopping short
   * of the hole the pointer opens, leaning into its turns); otherwise, and as it blends back, the path.
   */
  private chase(G: GroupRT, path: Pose, dt: number): Pose {
    const p = this.p;
    const c = G.chase ??= { x: path.x, y: path.y, on: 0, lean: 0 };
    const present = p.pointerOn > 0.5 && p.time - this.ptrMoved < 3 && !this.reduced;
    c.on += ((present ? 1 : 0) - c.on) * (1 - Math.exp(-dt * 3));
    let gx = path.x, gy = path.y;
    if (present) {
      const dx = p.pointerX - c.x, dy = p.pointerY - c.y, dl = Math.max(Math.hypot(dx, dy), 1e-3);
      const stop = HOLE_R * 1.25;
      gx = p.pointerX - (dx / dl) * stop; gy = p.pointerY - (dy / dl) * stop;
      gx = Math.max(-p.boundHw, Math.min(p.boundHw, gx)); gy = Math.max(-p.boundHh, Math.min(p.boundHh, gy));
    }
    const e = 1 - Math.exp(-dt / 0.3);
    const ox = c.x;
    c.x += (gx - c.x) * e; c.y += (gy - c.y) * e;
    const vx = dt > 0 ? (c.x - ox) / dt : 0;
    c.lean += (Math.max(-0.35, Math.min(0.35, -vx / 2400)) - c.lean) * (1 - Math.exp(-dt * 6));
    const k = c.on;
    return { x: path.x + (c.x - path.x) * k, y: path.y + (c.y - path.y) * k, rot: path.rot + c.lean * k, scale: path.scale, sx: path.sx };
  }

  /** QA: the current world pose of each performed group. */
  get groupPoses(): Pose[] {
    const S = this.show;
    if (!S) return [];
    return S.groups.map((_, k) => {
      const r = k * GROUP_TEXELS * 4;
      const d = this.groupData;
      return { x: d[r]!, y: d[r + 1]!, rot: d[r + 2]!, scale: d[r + 3]!, sx: d[r + 4]! };
    });
  }
  /** QA: the group of every particle (−1 = none) while a scene is performed. */
  get groupOf(): Float32Array | null { return this.show ? this.show.gi.filter((_, j) => j % 4 === 0) : null; }

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
        this.leaveShow();
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
        this.leaveShow();
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
        this.leaveShow();
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
    // a dim locked frame (B3): the freed flock flies dimmer than the border, so the border reads as a line
    // (with no room left to idle in — a phone with a build open — the freed particles fade out instead)
    if (this.frame?.dim) k.freeDim = freeShare(this.vp, [...this.keepOut, this.frame.rect]) >= DIM_ROOM ? DIM_FREE : 0;
    if (this.reduced) Object.assign(k, { freeze: 1, flowAmp: 0, wild: 0, freeDim: 1 });
    this.moodKnobTarget = k;
  }

  // ------------------------------------------------------------ input

  /** CSS px (viewport) and px/s. `touch`: the point stays present for 2 s after the last touch (B2). */
  pointer(x: number, y: number, vx: number, vy: number, touch = false): void {
    const t = this.p.time;
    const jump = t - this.pointerSeen > 0.3;
    if (jump || Math.abs(x - this.ptrX) + Math.abs(y - this.ptrY) > 2 || vx * vx + vy * vy > 1600) this.ptrMoved = t;
    this.ptrX = x; this.ptrY = y; this.ptrTouch = touch;
    this.p.pointerVx = vx; this.p.pointerVy = -vy;
    this.pointerSeen = t;
    if (jump) { this.tailX = x - this.vp.w / 2 + this.p.camX; this.tailY = this.vp.h / 2 - y + this.p.camY; }
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
      p.leaderW *= 1 + 2.5 * m; p.speedMax += 320 * m; p.cruise += 220 * m; p.leadR *= 1 - 0.5 * m;
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
    // B1 free range: free flight is boxed by the whole viewport inset 48 px (keep-outs are the only other law)
    const bw = Math.max(p.halfW - BOUND_INSET, 40), bh = Math.max(p.halfH - BOUND_INSET, 40);
    p.boundCx += (0 - p.boundCx) * re; p.boundCy += (0 - p.boundCy) * re;
    p.boundHw += (bw - p.boundHw) * re; p.boundHh += (bh - p.boundHh) * re;
    this.snapBounds = false;
    // a particle caught inside a keep-out leaves toward the roost (the stage side)
    p.homeX = this.roostX; p.homeY = this.roostY;
    // idle-like moods fly as three trailing sub-flocks (ribbons); the others follow one point leader
    const groups = this.mood === 'idle' || this.mood === 'speaking' || this.mood === 'listening' || this.mood === 'excited' || (this.mood === 'thinking' && this.holding);
    // point leader (non-idle moods) sweeps a slow Lissajous around the roost
    p.leaderX = this.roostX + Math.sin(t * 0.47) * ax * 0.5 + Math.sin(t * 0.83 + 2) * ax * 0.08;
    p.leaderY = this.roostY + Math.sin(t * 0.61 + 1) * ay * 0.5 + Math.cos(t * 1.07) * ay * 0.06;
    // idle: three trails (see SimParams.snake). Paths stay inside the stage; speeds ~120–220 px/s
    p.snake += ((groups ? 1 : 0) - p.snake) * (1 - Math.exp(-dt * 2));
    // B1: the sub-flock leaders roam the whole free area (centred between the viewport and the roost, so the
    // flock still leans to the stage side), except in the entry's full-frame beat
    const roam = !this.fullFrame;
    const tx0 = roam ? this.roostX * 0.3 : this.roostX, ty0 = roam ? this.roostY * 0.3 : this.roostY;
    // (the trails' widest reach is ~0.8 / 0.76 of the amplitude: scaled so they span the inset box)
    const gax = roam ? Math.max((bw - Math.abs(tx0)) * 1.15, 60) : ax, gay = roam ? Math.max((bh - Math.abs(ty0)) * 1.2, 60) : ay;
    p.snakeCx = tx0; p.snakeCy = ty0;
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
      PP[`g${g}ax`] = gax * kx; PP[`g${g}ay`] = gay * ky; PP[`g${g}wx`] = wx; PP[`g${g}wy`] = wy; PP[`g${g}px`] = px; PP[`g${g}py`] = py;
      PP[`g${g}ox`] = gax * ox; PP[`g${g}oy`] = gay * oy;
    });
    // B3 gather: one point leader on the stage centre, pulled hard enough to arrive within the given time
    const gk = t < this.gatherEnd ? 1 : Math.max(0, 1 - (t - this.gatherEnd) / 1.2);
    p.tunnel = gk > 0 ? 1 : 0;
    if (gk > 0) {
      const diag = Math.hypot(p.halfW, p.halfH);
      const need = Math.min(1600, Math.max(380, (1.5 * diag) / this.gatherT));
      p.snake *= 1 - gk;
      p.leaderX += (rc.x - p.leaderX) * gk; p.leaderY += (rc.y - p.leaderY) * gk;
      p.leadR += (0.03 - p.leadR) * gk; p.leaderW *= 1 + 9 * gk;
      p.speedMax += (need - p.speedMax) * gk; p.cruise += (need * 0.65 - p.cruise) * gk;
      p.flowRate *= 1 - 0.7 * gk; p.vortexW *= 1 - gk;
    }
    if (this.mood === 'celebrate') { p.leaderX = this.roostX + (p.leaderX - this.roostX) * 0.3; p.leaderY = this.roostY + (p.leaderY - this.roostY) * 0.3; }
    // keep-outs (world px); off during the entry's full-frame beat and while a UI frame is built
    // a dim locked frame (B3) keeps the keep-outs on and is one itself (inset so its own border is not pushed)
    const fr = this.frame;
    // (the UI's own keep-out for the frame's inside is replaced by the frame's: it would push the freed flock
    // into the caption with its wide margin)
    const kept = fr?.dim ? this.keepOut.filter((k) => !(k.x >= fr.rect.x - 20 && k.y >= fr.rect.y - 20 && k.x + k.w <= fr.rect.x + fr.rect.w + 20 && k.y + k.h <= fr.rect.y + fr.rect.h + 20)) : this.keepOut;
    const ko = this.fullFrame || (fr && !fr.dim) ? [] : fr ? [...kept.slice(0, MAX_KEEPOUT - 1), dimFrameKeepOut(fr.rect, kept)] : this.keepOut;
    p.koFrame = fr?.dim && !this.fullFrame ? 1 : 0;
    if (p.koFrame) { const b = dimFrameBlocks(fr!.rect, kept); p.koFbT = b.t; p.koFbB = b.b; p.koFbL = b.l; p.koFbR = b.r; }
    const P = p as unknown as Record<string, number>;
    for (let i = 0; i < MAX_KEEPOUT; i++) {
      const k = ko[i];
      P[`ko${i}x`] = k ? k.x + k.w / 2 - this.vp.w / 2 : 0; P[`ko${i}y`] = k ? this.vp.h / 2 - (k.y + k.h / 2) : 0;
      P[`ko${i}w`] = k ? k.w / 2 : -1; P[`ko${i}h`] = k ? k.h / 2 : -1;
    }
    p.koOn = ko.length ? 1 : 0;
    p.steerOn = ko.length && !this.reduced ? 1 : 0;
    p.farFrac = this.reduced ? 0 : 0.2;
    // frame / vortex centre
    if (this.frame) {
      const r = this.frame.rect;
      p.vortexCx = r.x + r.w / 2 - this.vp.w / 2; p.vortexCy = this.vp.h / 2 - (r.y + r.h / 2);
      // B7: the border fills 1.6× faster (density ×1.6 at a given progress) and glows, so it reads on every tier
      p.selectFrac += (Math.min(1.01, this.frame.progress * 1.6) - p.selectFrac) * (1 - Math.exp(-dt * 8));
      if (this.frame.progress >= 1) p.selectFrac = 1.01;
      if (this.frame.dim) p.selectFrac = DIM_SHARE;
    } else if (L.stage) { p.vortexCx = rc.x; p.vortexCy = rc.y; } else { p.vortexCx = 0; p.vortexCy = this.vp.h * 0.04; }
    const ge = 1 - Math.exp(-dt * 4);
    p.frameGlow += ((this.frame && !this.frame.dim ? 1 : 0) - p.frameGlow) * ge;
    p.heldDim += ((this.frame?.dim ? DIM_BRIGHT : 1) - p.heldDim) * ge;
    const ex = this.holding && !this.frame && !this.ringActive ? this.expoTarget : 1;
    p.shapeExpo += (ex - p.shapeExpo) * (1 - Math.exp(-dt * 1.5)); // follows the ~1 s knit, so the outgoing shape never flares
    p.bloomK = p.shapeExpo ** 2;
    if (this.show) this.updateShow(dt);
    else p.grpOn = 0;
    // speaking breathing + listening ring
    // breathing while speaking, plus the per-word pulse (~6 % scale, decays in ~120 ms)
    p.targetScale = this.reduced ? 1 : (this.mood === 'speaking' ? 1 + 0.012 * Math.sin(t * 2.4) : 1) * (1 + 0.1 * p.pulse);
    if (this.ringActive) p.ringLevel += (this.listenLevel - p.ringLevel) * (1 - Math.exp(-dt * 14));
    // 3D sway while held
    p.rotY = p.spinOn ? Math.sin(t * 0.7) * 0.32 : 0;
    // B2 pointer presence: a mouse cursor stays present where it was left; a touch point for 2 s
    const seen = this.pointerSeen > -1e8 && (!this.ptrTouch || t - this.pointerSeen < TOUCH_HOLD_S);
    p.pointerOn = seen ? 1 : Math.max(0, p.pointerOn - dt / 0.3);
    const vd = Math.exp(-dt * 6); p.pointerVx *= vd; p.pointerVy *= vd;
    // camera parallax (none while a UI frame is being built so the outline aligns with the DOM)
    const par = this.frame || this.reduced ? 0 : 1;
    const ce = 1 - Math.exp(-dt * 2);
    p.camX += (this.camTX * 16 * par - p.camX) * ce; p.camY += (this.camTY * 10 * par - p.camY) * ce;
    // pointer in world px, where the dots are drawn (the camera parallax shifts them by camX / camY)
    if (this.pointerSeen > -1e8) {
      p.pointerX = this.ptrX - this.vp.w / 2 + p.camX; p.pointerY = this.vp.h / 2 - this.ptrY + p.camY;
      // wake: a tail point trailing the cursor by ~0.12 s, at most 170 px (a short capsule behind fast motion)
      const te = 1 - Math.exp(-dt / 0.12);
      this.tailX += (p.pointerX - this.tailX) * te; this.tailY += (p.pointerY - this.tailY) * te;
      const lx = this.tailX - p.pointerX, ly = this.tailY - p.pointerY, ll = Math.hypot(lx, ly);
      if (ll > 170) { this.tailX = p.pointerX + (lx / ll) * 170; this.tailY = p.pointerY + (ly / ll) * 170; }
      p.wakeX = this.tailX; p.wakeY = this.tailY;
    }
    const still = t - this.ptrMoved;
    p.pointerHole += ((still < 0.5 ? 1 : 0) - p.pointerHole) * (1 - Math.exp(-dt * 3));
    p.pointerR = HOLE_R * (0.8 + 0.2 * p.pointerHole); // a still cursor keeps a slightly smaller hole
    // curious: a still cursor (> CURIOUS_AFTER s) outside the words draws a few particles into a loose orbit
    // (not during a performed scene: a resting mouse would pull holes in it)
    const inKo = this.keepOut.some((k) => this.ptrX > k.x - 8 && this.ptrX < k.x + k.w + 8 && this.ptrY > k.y - 8 && this.ptrY < k.y + k.h + 8);
    const curiousOk = p.pointerOn > 0.5 && still > CURIOUS_AFTER && !inKo && !this.reduced && !this.fullFrame && !(this.frame && !this.frame.dim) && this.mood !== 'celebrate' && !(gk > 0) && !this.show;
    p.curious += ((curiousOk ? 1 : 0) - p.curious) * (1 - Math.exp(-dt * (curiousOk ? 3.5 : 10)));
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
