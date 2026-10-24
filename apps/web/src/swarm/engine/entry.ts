import type { Swarm } from './swarm';

export interface EntryOptions {
  /** Returning visitor: form their name instead of YOYO for the beat (SPEC §2.1). */
  name?: string;
  signal?: AbortSignal;
  /** 'hold' fires once the letters have actually knitted (not on a fixed clock: target sampling can lag). */
  onBeat?: (beat: EntryBeat) => void;
}
export type EntryBeat = 'pour' | 'form' | 'hold' | 'release' | 'done';


/**
 * SPEC §2.1 entry: a point of light, particles pour in from the edges (0–1.2 s), slot into the extruded
 * YOYO letters (~1.2–2.15 s), hold 900 ms with a slow sway, then release into the idle murmuration (~4 s).
 * Resolves when idle; rejects with AbortError if `signal` aborts (the swarm is released immediately).
 */
export async function playEntry(swarm: Swarm, o: EntryOptions = {}): Promise<void> {
  const wait = (ms: number, signal?: AbortSignal): Promise<void> => swarm.wait(ms, signal);
  try {
    swarm.mood('idle');
    swarm.release();
    swarm.respawn('edges');
    o.onBeat?.('pour');
    await wait(1200, o.signal);
    o.onBeat?.('form');
    // knit-in: the targets (async) + the staggered knit (spread 0.6 s + ramp 0.35 s)
    const knit = swarm.knit(o.name ? { kind: 'text', text: o.name } : { kind: 'yoyo3d' });
    await Promise.race([knit, new Promise<never>((_, rej) => o.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')), { once: true }))]);
    o.signal?.throwIfAborted?.();
    o.onBeat?.('hold');
    await wait(900, o.signal);
    o.onBeat?.('release');
    swarm.release();
    await wait(950, o.signal);
    o.onBeat?.('done');
  } catch (e) {
    swarm.release();
    throw e;
  }
}
