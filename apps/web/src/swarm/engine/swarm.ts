import type { Mood, Rect, ShapeSpec, SwarmApi, SwarmEntry, SwarmStage } from '@yoyo/protocol';
import type { Backend, Caps, Tier, TierConfig } from './tiers';
import { AdaptiveMonitor, initialTier, nextLowerTier, tierConfig } from './tiers';
import { detectBackend } from './detect';
import { Controller } from './backend/controller';
import type { Engine, Scene } from './backend/types';
import { makeEngine } from './backend/load';
import { loadDisplayFont } from './font';
import { Scheduler } from './backend/scheduler';
import { yoyo3dTargets } from './shapes';
import { playEntry as runEntry } from './entry';

export interface SwarmOptions {
  scene?: Scene;
  /** Force a starting tier (0 = canvas2d … 3 = WebGPU 40k). Default: best available. */
  tier?: Tier;
  /** Respect prefers-reduced-motion (default: read from the media query). */
  reducedMotion?: boolean;
  /** Drop a tier after 20 consecutive frames > 20 ms (default true). */
  adaptive?: boolean;
  /** Initial layout: 'edges' = the entry pour-in, 'scatter' = already flocking. Default 'scatter'. */
  spawn?: 'edges' | 'scatter' | 'center';
  /** Track the canvas' CSS size with a ResizeObserver (default true). */
  autoResize?: boolean;
  /** Override the tier's particle count (QA / debugging). */
  count?: number;
  /** Prefer this GPU backend for tiers 1–2 (QA / debugging). */
  backend?: Backend;
  /** Called whenever the active tier/backend changes (adaptive drop or setQuality). */
  onTierChange?: (s: SwarmStats) => void;
}

export type SwarmStats = ReturnType<SwarmApi['stats']>;

/** SwarmApi plus the stage / entry / pause extensions and a few QA extras. */
export interface Swarm extends SwarmApi, SwarmEntry, SwarmStage {
  /** Idle the render loop (e.g. while the game modal is open); state is kept. */
  pause(): void;
  /** Resume after pause() (no-op while the tab is hidden; it resumes when visible). */
  resume(): void;
  /** `setStage` takes keep-out rects (feature flag for callers). */
  readonly keepOut: true;
  /** POLISH2 B3: pull the flock to the stage centre within `ms` (resolves then). Drops any held shape/frame. */
  gather(ms: number): Promise<void>;
  /** The canvas currently drawn into (replaced when the context type has to change, e.g. GPU → 2D). */
  readonly canvas: HTMLCanvasElement;
  /** @internal QA hook: the active engine. */
  readonly _engine: Engine | null;
  /** @internal QA hook: the behaviour controller (stage, keep-outs, params). */
  readonly _ctrl: Controller;
  /** @internal QA hook: simulation time (s) and the 3D sway angle of a held YOYO. */
  readonly _time: number;
  readonly mood_: Mood;
  /** Become a shape; resolves once it has knitted in (false if something else took the body first). */
  knit(shape: ShapeSpec): Promise<boolean>;
  /** Re-seed particle positions (entry pour-in). */
  respawn(kind: 'edges' | 'scatter' | 'center'): void;
  setReducedMotion(on: boolean): void;
  /** Frame-time percentiles over the last ~300 frames, plus engine CPU time. */
  perf(): { p50: number; p95: number; cpuP50: number; cpuP95: number; frames: number };
  /** Resolves after the next rendered frame. */
  nextFrame(): Promise<void>;
  /** Manual frame stepping for deterministic capture (pauses the rAF loop while set). */
  setManualClock(on: boolean): void;
  step(dt: number, draw?: boolean): void;
  /** Resolves after `ms` of swarm time (pauses with the tab; exact under the manual clock). */
  wait(ms: number, signal?: AbortSignal): Promise<void>;
}

function pct(a: number[], q: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

function contextKind(b: Backend): string { return b === 'canvas2d' ? '2d' : b === 'webgpu' ? 'webgpu' : 'webgl2'; }

export async function createSwarm(canvasIn: HTMLCanvasElement, opts: SwarmOptions = {}): Promise<Swarm> {
  const caps = await detectBackend();
  const capsTier: Caps = { webgpu: caps.webgpu, webgl2: caps.webgl2, mobile: caps.mobile };
  await loadDisplayFont();
  let canvas = canvasIn;
  let usedContext: string | null = null;
  let scene: Scene = opts.scene ?? 'dark';
  const reducedQuery = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = opts.reducedMotion ?? !!reducedQuery?.matches;

  let tier: Tier = opts.tier ?? (caps.weak ? 0 : initialTier(capsTier));
  let cfg = tierConfig(tier, capsTier, opts.backend);
  let engine: Engine | null = null;
  let ctrl: Controller;
  let switching: Promise<void> = Promise.resolve();
  const monitor = new AdaptiveMonitor(20, 20);
  const sched = new Scheduler();
  const adaptive = opts.adaptive !== false;

  const freshCanvas = (): HTMLCanvasElement => {
    const c = canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(c);
    canvas = c;
    if (ro) { ro.disconnect(); ro.observe(c); }
    return c;
  };

  const cssSize = (): { w: number; h: number } => {
    const r = canvas.getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width || window.innerWidth)), h: Math.max(1, Math.round(r.height || window.innerHeight)) };
  };

  let ro: ResizeObserver | null = null;
  let stage: Rect | null = null;
  let keepOut: Rect[] = [];
  let fullFrame = false;

  // Build (or rebuild) the engine for a tier config; keeps behaviour state where it can.
  const build = async (c: TierConfig, spawn: 'edges' | 'scatter' | 'center'): Promise<void> => {
    const want = contextKind(c.backend);
    // A canvas keeps its first context type forever; a GPU → 2D (or WebGPU → WebGL2) switch needs a new one.
    // Even a same-type rebuild gets a fresh canvas so the old renderer's context can be released cleanly.
    if (usedContext) { engine?.destroy(); engine = null; freshCanvas(); }
    if (opts.count) c = { ...c, count: opts.count };
    let e: Engine;
    try {
      e = await makeEngine(c, canvas, scene);
    } catch (err) {
      console.warn('[swarm] backend failed, falling back', c.backend, err);
      if (c.backend === 'canvas2d') throw err;
      const lower = c.backend === 'webgpu' && capsTier.webgl2 ? tierConfig(2, { ...capsTier, webgpu: false }) : tierConfig(0, capsTier);
      freshCanvas(); // the failed attempt may have claimed a context on this canvas
      usedContext = null;
      return build(lower, spawn);
    }
    engine = e;
    usedContext = want;
    // the GPU engine may have been silently given the WebGL2 backend by three
    const actual = (e as { actualBackend?: Backend }).actualBackend ?? e.backend;
    cfg = { ...c, backend: actual };
    tier = c.tier;
    const prev = ctrl as Controller | undefined;
    ctrl = new Controller(c.count, { upload: (a, b) => engine?.setTargets(a, b) }, sched);
    ctrl.setReduced(reduced);
    ctrl.setLite(actual === 'canvas2d');
    ctrl.setStage(stage, keepOut);
    ctrl.setFullFrame(fullFrame);
    const { w, h } = cssSize();
    ctrl.setViewport(w, h);
    e.resize(w, h);
    const st = ctrl.spawn(reduced ? 'scatter' : spawn);
    e.setState(st.pos, st.vel);
    ctrl.update(0);
    const ab = ctrl.targets; e.setTargets(ab[0], ab[1]);
    if (prev) {
      ctrl.p.time = prev.p.time;
      if (prev.p.pointerOn > 0) ctrl.pointer(prev.p.pointerX + w / 2, h / 2 - prev.p.pointerY, 0, 0);
      const m = prev.mood;
      const spec: ShapeSpec | null = prev.spec;
      if (spec) ctrl.become(spec);
      if (m !== 'idle') ctrl.mood_(m);
    }
    monitor.reset();
    // warm the lazy 3D-letter chunk + sampling so the entry beat never waits on it
    // (the 2D tier samples YOYO from the font mask: no three.js chunk is fetched there — POLISH2 B4)
    void yoyo3dTargets(c.count, ctrl.shapeLayout).catch(() => undefined);
    opts.onTierChange?.(api.stats());
  };

  // ---------------------------------------------------------------- loop
  let raf = 0, last = performance.now(), running = true, manual = false, paused = false;
  const frameMs: number[] = [], cpuMs: number[] = [];
  let fpsEma = 60;
  let waiters: (() => void)[] = [];

  const tick = (dtSec: number, draw = true): void => {
    if (!engine) return;
    const t0 = performance.now();
    sched.advance(dtSec);
    const p = ctrl.update(dtSec);
    engine.frame(p, draw);
    const t1 = performance.now();
    cpuMs.push(t1 - t0); if (cpuMs.length > 300) cpuMs.shift();
    const w = waiters; waiters = []; w.forEach((f) => f());
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    if (manual) return;
    const ms = now - last; last = now;
    frameMs.push(ms); if (frameMs.length > 300) frameMs.shift();
    fpsEma += (1000 / Math.max(ms, 1) - fpsEma) * 0.05;
    tick(Math.min(ms / 1000, 1 / 30));
    if (adaptive && monitor.frame(ms)) {
      const lower = nextLowerTier(tier);
      if (lower !== null) {
        console.info('[swarm] adaptive: dropping to tier', lower);
        const next = tierConfig(lower, capsTier, cfg.backend);
        switching = switching.then(() => build(next, 'scatter'));
      }
    }
  };

  const startLoop = (): void => {
    if (running && !paused && !document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  const stopLoop = (): void => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = (): void => { if (document.hidden) stopLoop(); else startLoop(); };

  const api: Swarm = {
    keepOut: true,
    get canvas() { return canvas; },
    /** @internal QA hook */
    get _engine() { return engine; },
    get _ctrl() { return ctrl; },
    get _time() { return ctrl.p.time; },
    get mood_() { return ctrl.mood; },
    become(shape, o) { void ctrl.become(shape, o); },
    knit(shape) { return ctrl.become(shape); },
    release() { ctrl.release(); },
    mood(m) { ctrl.mood_(m); },
    buildFrame(rect, progress, o) { ctrl.buildFrame(rect, progress, o); },
    gather(ms) { return ctrl.gather(ms); },
    pointer(x, y, vx, vy, touch) { ctrl.pointer(x, y, vx, vy, touch); },
    setScene(mode) { scene = mode; engine?.setScene(mode); },
    setQuality(t) {
      const next = tierConfig(t, capsTier);
      switching = switching.then(() => build(next, 'scatter'));
    },
    setListeningLevel(l) { ctrl.setListeningLevel(l); },
    setStage(rect, ko) {
      stage = { ...rect };
      if (ko) keepOut = ko.map((k) => ({ ...k }));
      ctrl.setStage(stage, keepOut);
    },
    async playEntry(o = {}) {
      fullFrame = true; ctrl.setFullFrame(true);
      try {
        if (o.reducedMotion ?? reduced) {
          // reduced motion: the shape appears, holds, and goes; no pour-in
          o.onBeat?.('form');
          await api.knit(o.name ? { kind: 'text', text: o.name } : { kind: 'yoyo3d' });
          o.onBeat?.('hold');
          await api.wait(1600);
          o.onBeat?.('release');
          api.release();
          o.onBeat?.('done');
        } else {
          // the stage applies again from the release, so the flock already heads there as the greeting lands;
          // the beats go on to the caller ('hold' = the letters have knitted, for the name line under them)
          await runEntry(api, { ...(o.name ? { name: o.name } : {}), onBeat: (b) => { if (b === 'release') { fullFrame = false; ctrl.setFullFrame(false); } o.onBeat?.(b); } });
        }
      } finally {
        fullFrame = false; ctrl.setFullFrame(false);
      }
    },
    pause() { paused = true; stopLoop(); },
    resume() { if (!paused) return; paused = false; startLoop(); },
    pulse(s) { ctrl.pulse(s ?? 0.6); },
    async screenshot() {
      await switching;
      if (!engine) throw new Error('no engine');
      const p = engine.screenshot();
      if (manual || !raf) tick(1 / 60);
      return p;
    },
    stats() {
      return { fps: Math.round(fpsEma * 10) / 10, count: engine?.count ?? cfg.count, tier, backend: (cfg.backend) };
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      engine?.destroy(); engine = null;
    },
    respawn(kind) {
      if (!engine) return;
      const st = ctrl.spawn(kind);
      engine.setState(st.pos, st.vel);
    },
    setReducedMotion(on) { reduced = on; ctrl.setReduced(on); },
    perf() {
      return { p50: pct(frameMs, 0.5), p95: pct(frameMs, 0.95), cpuP50: pct(cpuMs, 0.5), cpuP95: pct(cpuMs, 0.95), frames: frameMs.length };
    },
    nextFrame() { return new Promise((r) => waiters.push(r)); },
    setManualClock(on) { manual = on; last = performance.now(); },
    step(dt, draw = true) { tick(dt, draw); },
    wait(ms, signal) {
      return new Promise((res, rej) => {
        const id = sched.after(ms / 1000, res);
        signal?.addEventListener('abort', () => { sched.cancel(id); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
      });
    },
  };

  await build(cfg, opts.spawn ?? 'scatter');

  if (opts.autoResize !== false && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      const { w, h } = cssSize();
      if (!engine) return;
      ctrl.setViewport(w, h); engine.resize(w, h);
    });
    ro.observe(canvas);
  }
  reducedQuery?.addEventListener?.('change', (e) => { if (opts.reducedMotion === undefined) api.setReducedMotion(e.matches); });
  document.addEventListener('visibilitychange', onVis);
  startLoop();
  return api;
}
