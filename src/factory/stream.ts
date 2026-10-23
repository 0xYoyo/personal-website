import type { PRState, SectionRuntime } from './types';

/**
 * The diff stream's clock, shared by every counter that shows it (the diff's
 * "+N", the PR card's state line, the control room bar), so they always agree.
 */

/** Characters streamed so far: paced by the clock, so the stream ends exactly when building does. */
export function streamedChars(state: PRState, startedAt: number, buildMs: number, total: number, now = Date.now()): number {
  if (state === 'queued') return 0;
  if (state !== 'building' || buildMs <= 0) return total;
  const t = Math.min(1, Math.max(0, (now - startedAt) / buildMs));
  return Math.floor(t * total);
}

/** Offset of the first character of each line. */
export function lineStarts(source: string): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const l of source.split('\n')) {
    starts.push(acc);
    acc += l.length + 1;
  }
  return starts;
}

/** Lines fully or partly revealed once `chars` characters have streamed. */
export function visibleLines(starts: readonly number[], chars: number): number {
  let n = 0;
  while (n < starts.length && starts[n]! < chars) n++;
  return n;
}

/** Lines on screen for a PR right now; `source` falls back to an even split of `totalLines`. */
export function streamedLines(rt: SectionRuntime, totalLines: number, source?: string, now = Date.now()): number {
  if (rt.state === 'queued') return 0;
  if (!source) {
    if (rt.state !== 'building' || rt.buildMs <= 0) return totalLines;
    const t = Math.min(1, Math.max(0, (now - rt.stateSince) / rt.buildMs));
    return Math.ceil(t * totalLines);
  }
  return visibleLines(lineStarts(source), streamedChars(rt.state, rt.stateSince, rt.buildMs, source.length, now));
}
