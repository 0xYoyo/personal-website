// A tiny timeline engine for the tour and the stories (SPEC §3.3).
// Steps fire at `at` ms from the start and last `hold` ms. A step with `say`
// opens a beat; following steps without `say` belong to it (shape changes,
// captions). next/prev jump between beats. In step mode (reduced motion) the
// timeline never advances on its own: each next() applies one whole beat.
import type { Mood, ShapeSpec } from '@yoyo/protocol';

export type Viewport = { w: number; h: number };
export type ShapeRef = ShapeSpec | ((vp: Viewport) => ShapeSpec);

export interface Step {
  at: number;
  hold: number;
  /** The agent line (large type). Opens a beat. */
  say?: string;
  /** A small mono caption under the line (e.g. a project name) */
  sub?: string;
  become?: ShapeRef;
  /** Release the swarm to idle */
  release?: boolean;
  mood?: Mood;
  chips?: string[];
}

/** Author steps by duration; `at` is computed cumulatively. */
export function seq(steps: Omit<Step, 'at'>[], start = 0): Step[] {
  let t = start;
  return steps.map((s) => {
    const step = { ...s, at: t };
    t += s.hold;
    return step;
  });
}

export const duration = (steps: Step[]): number => steps.reduce((m, s) => Math.max(m, s.at + s.hold), 0);

/** Indices of the steps that open a beat. */
export function beatStarts(steps: Step[]): number[] {
  const out: number[] = [];
  steps.forEach((s, i) => {
    if (i === 0 || s.say !== undefined) out.push(i);
  });
  return out;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface RunnerHandlers {
  onStep(step: Step, index: number, beat: number): void;
  onEnd(reason: 'done' | 'skip'): void;
}

export interface Runner {
  start(): void;
  next(): void;
  prev(): void;
  skip(): void;
  /** Index of the current beat (0-based), -1 before start */
  beat(): number;
  beats(): number;
  readonly stepMode: boolean;
  running(): boolean;
}

export function createRunner(steps: Step[], h: RunnerHandlers, opts: { stepMode?: boolean; clock?: Clock } = {}): Runner {
  const clock = opts.clock ?? realClock;
  const stepMode = !!opts.stepMode;
  const starts = beatStarts(steps);
  let timers: unknown[] = [];
  let cur = -1; // step index
  let active = false;

  const beatOf = (i: number) => {
    let b = 0;
    for (let k = 0; k < starts.length; k++) if (starts[k]! <= i) b = k;
    return b;
  };

  const clear = () => {
    timers.forEach((t) => clock.clearTimeout(t));
    timers = [];
  };

  const fire = (i: number) => {
    cur = i;
    h.onStep(steps[i]!, i, beatOf(i));
  };

  const end = (reason: 'done' | 'skip') => {
    if (!active) return;
    clear();
    active = false;
    h.onEnd(reason);
  };

  /** Auto mode: play from step i, scheduling the rest relative to now. */
  const playFrom = (i: number) => {
    clear();
    const origin = steps[i]!.at;
    for (let k = i; k < steps.length; k++) {
      const delay = steps[k]!.at - origin;
      if (k === i) fire(k);
      else timers.push(clock.setTimeout(() => fire(k), delay));
    }
    timers.push(clock.setTimeout(() => end('done'), duration(steps) - origin));
  };

  /** Step mode: apply every step of beat b at once (instant shape changes). */
  const applyBeat = (b: number) => {
    const from = starts[b]!;
    const to = b + 1 < starts.length ? starts[b + 1]! : steps.length;
    for (let k = from; k < to; k++) fire(k);
  };

  const goBeat = (b: number) => {
    if (b < 0) b = 0;
    if (b >= starts.length) return end('done');
    if (stepMode) applyBeat(b);
    else playFrom(starts[b]!);
  };

  return {
    stepMode,
    start() {
      if (!steps.length) return;
      active = true;
      goBeat(0);
    },
    next() {
      if (!active) return;
      goBeat(beatOf(Math.max(cur, 0)) + 1);
    },
    prev() {
      if (!active) return;
      goBeat(beatOf(Math.max(cur, 0)) - 1);
    },
    skip() {
      end('skip');
    },
    beat: () => (cur < 0 ? -1 : beatOf(cur)),
    beats: () => starts.length,
    running: () => active,
  };
}
