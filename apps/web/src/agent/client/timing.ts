// Timing shared by the scripted brain and the mock worker so a scripted reply is
// indistinguishable from a live one: first token ≈ 600 ms, then ≈ 40 tokens/s.

export interface Timing {
  /** delay before the first token of a chat reply */
  firstTokenMs: number;
  /** delay per model token (≈ 4 characters) */
  perTokenMs: number;
  /** ± fraction of random jitter applied to each delay */
  jitter: number;
  /** delay before the first HTML chunk of a build */
  buildFirstChunkMs: number;
  /** total streaming time of a scripted build */
  buildTotalMs: number;
  /** interval between build chunks */
  buildTickMs: number;
}

export const DEFAULT_TIMING: Timing = {
  firstTokenMs: 600,
  perTokenMs: 25,
  jitter: 0.25,
  buildFirstChunkMs: 1200,
  buildTotalMs: 15_000,
  buildTickMs: 60,
};

export const ZERO_TIMING: Timing = { firstTokenMs: 0, perTokenMs: 0, jitter: 0, buildFirstChunkMs: 0, buildTotalMs: 0, buildTickMs: 0 };

export class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortedError';
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AbortedError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export const jittered = (ms: number, jitter: number, random: () => number) =>
  Math.max(0, Math.round(ms * (1 + (random() * 2 - 1) * jitter)));

/** ≈ model tokens in a word (1 per 4 characters, at least 1). */
export const tokensIn = (word: string) => Math.max(1, Math.ceil(word.length / 4));
