// A tiny timeline engine for the show and the stories (SPEC §3.3, POLISH1 A2, wave 3 SHOW).
//
// A step lasts `hold` ms from `at`. At its start the step's shape (or the
// scene it performs), mood, release and chips apply (`onStep`); its caption (`say`, plus an optional
// muted `lead` above it) follows `sayAt` ms later (`onSay`), so the shape is
// already knitted when the words land. A step with `say` opens a beat; steps
// without one (shape-only) belong to the beat before. next/prev jump between
// beats. In step mode (reduced motion) nothing advances on its own: every
// next() applies exactly one step, shape and caption at once.
import type { Mood, Scene, ShapeSpec } from '@yoyo/protocol';

export type Viewport = { w: number; h: number };
export type ShapeRef = ShapeSpec | ((vp: Viewport) => ShapeSpec);
/** A scene for the swarm to perform (wave 3 show), laid out for the free stage it is given (CSS px). */
export type PerformRef = Scene | ((stage: Viewport) => Scene);

export interface Step {
  at: number;
  /** total length of the step, ms */
  hold: number;
  /** The agent line (large type). Opens a beat. */
  say?: string;
  /** ms after the step starts at which `say` appears (the shape goes first) */
  sayAt?: number;
  /** A muted line above the caption (e.g. "Things I've shipped:"); cleared by a step with `say` and no `lead` */
  lead?: string;
  become?: ShapeRef;
  /** Perform a scene (particle groups with paths; wave 3 show) instead of one shape */
  perform?: PerformRef;
  /** Release the swarm to idle */
  release?: boolean;
  mood?: Mood;
  chips?: string[];
}

/** The shape goes first; the caption lands this long after it (the knit takes ~800 ms). */
export const CAPTION_DELAY = 900;
/** A caption types in at this pace, ms a word (the word fade is 280 ms). */
export const CAPTION_TYPE_MS = 60;
/** How long a caption takes to type in completely. */
export const typeMs = (text: string): number => Math.max(0, text.split(/\s+/).filter(Boolean).length - 1) * CAPTION_TYPE_MS + 280;
/** Extra time a caption stays after it has been read. */
export const CAPTION_TAIL = 600;
/** Floor for a caption's read time. */
export const READ_MIN = 2400;

/** How long a caption takes to read: ~300 ms a word, never under 2.4 s. */
export const readMs = (text: string): number => Math.max(READ_MIN, text.split(/\s+/).filter(Boolean).length * 300);

export type BeatSpec = Omit<Step, 'at' | 'hold' | 'sayAt'> & {
  /** override the computed length (ms the caption stays, read time + tail by default) */
  captionHold?: number;
  /** caption and shape change together: the caption types in while the shape knits (POLISH2 A3) */
  sync?: boolean;
  /** a shape-only step's length */
  hold?: number;
};

/**
 * One authored beat → a Step with the A2 timing: `become` first, the caption
 * CAPTION_DELAY later (immediately when there is no shape), then the caption's
 * read time + CAPTION_TAIL (or `captionHold`).
 */
export function beat(b: BeatSpec): Omit<Step, 'at'> {
  const { captionHold, hold, sync, ...rest } = b;
  if (rest.say === undefined) return { ...rest, hold: hold ?? READ_MIN };
  const sayAt = rest.become && !sync ? CAPTION_DELAY : 0;
  const stay = captionHold ?? readMs(rest.say) + CAPTION_TAIL;
  return { ...rest, sayAt, hold: sayAt + stay };
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
  /** the step starts: shape, mood, release, chips */
  onStep(step: Step, index: number, beat: number): void;
  /** the step's caption lands (only steps with `say`) */
  onSay?(step: Step, index: number, beat: number): void;
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
  /** Index of the current step, -1 before start */
  step(): number;
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
  const caption = (i: number) => {
    if (steps[i]!.say !== undefined) h.onSay?.(steps[i]!, i, beatOf(i));
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
      const s = steps[k]!;
      const delay = s.at - origin;
      const sayDelay = delay + (s.sayAt ?? 0);
      if (k === i) fire(k);
      else timers.push(clock.setTimeout(() => fire(k), delay));
      if (s.say !== undefined) {
        if (sayDelay <= 0) caption(k);
        else timers.push(clock.setTimeout(() => caption(k), sayDelay));
      }
    }
    timers.push(clock.setTimeout(() => end('done'), duration(steps) - origin));
  };

  /** Step mode: one whole step, shape and caption together. */
  const applyStep = (i: number) => {
    fire(i);
    caption(i);
  };

  const goBeat = (b: number) => {
    if (b < 0) b = 0;
    if (b >= starts.length) return end('done');
    playFrom(starts[b]!);
  };

  const goStep = (i: number) => {
    if (i < 0) i = 0;
    if (i >= steps.length) return end('done');
    applyStep(i);
  };

  return {
    stepMode,
    start() {
      if (!steps.length) return;
      active = true;
      if (stepMode) goStep(0);
      else goBeat(0);
    },
    next() {
      if (!active) return;
      if (stepMode) goStep(cur + 1);
      else goBeat(beatOf(Math.max(cur, 0)) + 1);
    },
    prev() {
      if (!active) return;
      if (stepMode) goStep(cur - 1);
      else goBeat(beatOf(Math.max(cur, 0)) - 1);
    },
    skip() {
      end('skip');
    },
    beat: () => (cur < 0 ? -1 : beatOf(cur)),
    beats: () => starts.length,
    step: () => cur,
    running: () => active,
  };
}
