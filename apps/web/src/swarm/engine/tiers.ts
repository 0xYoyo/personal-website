export type Backend = 'webgpu' | 'webgl2' | 'canvas2d';
export type Tier = 0 | 1 | 2 | 3;

export interface TierConfig {
  tier: Tier;
  backend: Backend;
  count: number;
  bloom: boolean;
  dprCap: number;
}

export interface Caps { webgpu: boolean; webgl2: boolean; mobile: boolean }

/** Particle counts per tier. Tier 3/2 follow SPEC §3.1; tier 1 is a reduced GPU tier; tier 0 is the 2D fallback. */
export const COUNTS: Record<'desktop' | 'mobile', Record<Tier, number>> = {
  desktop: { 3: 40000, 2: 20000, 1: 8000, 0: 3000 },
  mobile: { 3: 12000, 2: 6000, 1: 4000, 0: 2000 },
};

/**
 * Resolve a tier to a concrete config.
 * `preferBackend` keeps the current GPU backend when the adaptive monitor drops a tier (no context switch).
 */
export function tierConfig(tier: Tier, caps: Caps, preferBackend?: Backend): TierConfig {
  const kind = caps.mobile ? 'mobile' : 'desktop';
  if (tier === 0 || (!caps.webgpu && !caps.webgl2)) {
    return { tier: 0, backend: 'canvas2d', count: COUNTS[kind][0], bloom: false, dprCap: caps.mobile ? 1.5 : 2 };
  }
  let t: Tier = tier;
  let backend: Backend;
  if (t === 3) {
    if (caps.webgpu) backend = 'webgpu';
    else { backend = 'webgl2'; t = 2; }
  } else if (preferBackend === 'webgpu' && caps.webgpu) {
    backend = 'webgpu';
  } else {
    backend = caps.webgl2 ? 'webgl2' : 'webgpu';
  }
  const dprCap = caps.mobile ? 1.5 : t === 1 ? 1 : 2;
  return { tier: t, backend, count: COUNTS[kind][t], bloom: t === 3 && backend === 'webgpu', dprCap };
}

export function initialTier(caps: Caps): Tier {
  if (caps.webgpu) return 3;
  if (caps.webgl2) return 2;
  return 0;
}

/** What the browser says about the device (null = not exposed: Safari and Firefox have no deviceMemory). */
export interface DeviceSignals {
  cores: number | null;
  memory: number | null;
  /** WebGPU adapter info (null when there is no adapter or the browser hides it) */
  gpuVendor: string | null;
  gpuArch: string | null;
  gpuFallback: boolean;
  /** WebGL's (unmasked) renderer string */
  glRenderer: string | null;
}

/** A software rasteriser: the GPU tiers would run on the CPU. */
export const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

/** WebGPU adapters a phone may start on: Apple GPUs, and Android's Adreno / Mali / Xclipse / PowerVR (when the browser names them). */
export const MOBILE_GPU_VENDORS = /^(apple|qualcomm|arm|samsung|imagination)/i;

/**
 * The starting tier (POSTFIX4 E1). Desktop: the best available (the adaptive monitor takes it down if it has to).
 * A phone starts conservatively: WebGPU only on an adapter that names a mobile GPU vendor (not a fallback / software
 * adapter); WebGL2 only with ≥ 6 cores and ≥ 4 GB (memory unknown counts as enough: only Chromium tells, and it does
 * tell on the small Androids this is for); anything else, and any software renderer, starts on the 2D tier.
 */
export function startTier(caps: Caps, s: DeviceSignals, weak = false): Tier {
  if (weak) return 0;
  const software = (s.glRenderer !== null && SOFTWARE_GL.test(s.glRenderer)) || /swiftshader/i.test(`${s.gpuVendor ?? ''} ${s.gpuArch ?? ''}`);
  if (!caps.mobile) return initialTier(caps);
  if (software) return 0;
  if (caps.webgpu && !s.gpuFallback && s.gpuVendor && MOBILE_GPU_VENDORS.test(s.gpuVendor)) return 3;
  if (caps.webgl2 && (s.cores ?? 0) >= 6 && (s.memory ?? 4) >= 4) return 2;
  return 0;
}

/** What the adaptive monitor asks for after a frame: nothing, one tier down, or straight to tier 0. */
export type Drop = false | 'one' | 'floor';

/**
 * Adaptive quality (POSTFIX4 E1), measured in time rather than frames, so a phone at 3 fps decides as fast as a
 * laptop at 50: after a warm-up of `warmupMs` (shader compiles, the first uploads), it drops one tier once
 * `slowMs` of frames have run over `budgetMs`, and straight to tier 0 once `floorMs` of frames have run under
 * `floorFps`. A fast frame takes back four times its own length from the slow tally (one good frame among slow
 * ones is not a recovery). Never raises again for the session; a >5 s gap is a pause (debugger / OS), not a trend.
 */
export class AdaptiveMonitor {
  private slow = 0;
  private crawl = 0;
  private warm: number;
  dropped = 0;
  constructor(private budgetMs = 20, private slowMs = 1200, private warmupMs = 1500, private floorFps = 10, private floorMs = 1000) { this.warm = warmupMs; }
  reset(): void { this.slow = 0; this.crawl = 0; this.warm = this.warmupMs; }
  /** Feed one frame's length (ms). Returns what the caller should do. */
  frame(ms: number): Drop {
    if (ms > 5000) { this.slow = 0; this.crawl = 0; return false; }
    if (this.warm > 0) { this.warm -= ms; return false; }
    if (ms > this.budgetMs) this.slow += ms; else this.slow = Math.max(0, this.slow - 4 * ms);
    if (ms > 1000 / this.floorFps) this.crawl += ms; else this.crawl = Math.max(0, this.crawl - 4 * ms);
    if (this.crawl >= this.floorMs) { this.dropped++; this.reset(); return 'floor'; }
    if (this.slow >= this.slowMs) { this.dropped++; this.reset(); return 'one'; }
    return false;
  }
}

/**
 * POSTFIX4 E1: the swarm's clock follows real time — timers, beats, knits and the show's paths take their length in
 * seconds at any frame rate down to 2 fps (MAX_CLOCK_DT a frame; a longer frame is a hitch, not time to skip). The physics
 * integrates at most MAX_PHYS_DT a step (its forces are stable well past it); below 15 fps the flight lags a little,
 * the timing does not. (Before, both were capped at 1/30 s a frame: at 3 fps the 4 s entry took 40 s.)
 */
export const MAX_CLOCK_DT = 0.5;
export const MAX_PHYS_DT = 1 / 15;
export const clockStep = (frameMs: number): number => Math.min(Math.max(frameMs, 0) / 1000, MAX_CLOCK_DT);
export const physStep = (clock: number): number => Math.min(clock, MAX_PHYS_DT);

export function nextLowerTier(t: Tier): Tier | null {
  return t > 0 ? ((t - 1) as Tier) : null;
}
