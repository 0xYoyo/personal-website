/** Deterministic integer hash → [0, 1). Same on every backend (seeds are computed on the CPU and uploaded). */
export function hash01(i: number, seed = 0): number {
  let h = (Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed + 0x7f4a7c15, 0x85ebca6b)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Seeded PRNG (mulberry32) for shape sampling, so the same shape always samples the same way. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Knit delay fraction for particle i heading to a target at normalised x (0 = left edge of the shape, 1 = right).
 * 60 % random (hash) + 40 % spatial sweep, so a word knits in roughly left→right but never as a clean wipe.
 */
export function knitDelay(i: number, xNorm: number): number {
  const x = Math.min(1, Math.max(0, xNorm));
  return 0.6 * hash01(i, 11) + 0.4 * x;
}

/** Per-particle seeds: [knit/release hash, size, brightness, frame-select]. */
export function makeSeeds(n: number): Float32Array {
  const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    s[i * 4] = hash01(i, 1);
    s[i * 4 + 1] = hash01(i, 2);
    s[i * 4 + 2] = hash01(i, 3);
    s[i * 4 + 3] = hash01(i, 4);
  }
  return s;
}
