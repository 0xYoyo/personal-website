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
  /** read time of a line the agent says before a build: per word, and the floor (POLISH2 C2) */
  readPerWordMs: number;
  readMinMs: number;
}

export const DEFAULT_TIMING: Timing = {
  firstTokenMs: 600,
  perTokenMs: 25,
  jitter: 0.25,
  // examples are local strings: stream them faster than the live builder (≤ 8 s in all, POLISH2 C2)
  buildFirstChunkMs: 600,
  buildTotalMs: 6_000,
  buildTickMs: 60,
  readPerWordMs: 300,
  readMinMs: 2_200,
};

export const ZERO_TIMING: Timing = { firstTokenMs: 0, perTokenMs: 0, jitter: 0, buildFirstChunkMs: 0, buildTotalMs: 0, buildTickMs: 0, readPerWordMs: 0, readMinMs: 0 };

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

/** How long a line rests before the next thing happens: 300 ms a word, at least 2.2 s. */
export const readMs = (line: string, t: Pick<Timing, 'readPerWordMs' | 'readMinMs'>) =>
  Math.max(t.readMinMs, line.split(/\s+/).filter(Boolean).length * t.readPerWordMs);

/** ≈ model tokens in a word (1 per 4 characters, at least 1). */
export const tokensIn = (word: string) => Math.max(1, Math.ceil(word.length / 4));
