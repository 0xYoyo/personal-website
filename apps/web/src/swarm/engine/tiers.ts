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

/**
 * Adaptive quality: drop one tier after `limit` consecutive frames slower than `budgetMs`.
 * Never raises again for the session. Ignores a warm-up window after every (re)initialisation.
 */
export class AdaptiveMonitor {
  private slow = 0;
  private warm: number;
  dropped = 0;
  constructor(private budgetMs = 20, private limit = 20, private warmup = 45) { this.warm = warmup; }
  reset(): void { this.slow = 0; this.warm = this.warmup; }
  /** Returns true when the caller should drop a tier. */
  frame(ms: number): boolean {
    if (this.warm > 0) { this.warm--; return false; }
    if (ms > 5000) { this.slow = 0; return false; } // a >5 s gap is a debugger/OS pause, not a trend (hidden tabs stop the loop)
    if (ms > this.budgetMs) this.slow++; else this.slow = 0;
    if (this.slow >= this.limit) { this.slow = 0; this.dropped++; this.warm = this.warmup; return true; }
    return false;
  }
}

export function nextLowerTier(t: Tier): Tier | null {
  return t > 0 ? ((t - 1) as Tier) : null;
}
