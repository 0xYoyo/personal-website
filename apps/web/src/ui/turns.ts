// Turns (POLISH2 A1). A long reply arrives as short turns separated by `||`
// (or by the brain's `turn` boundary). Each turn is one block of large type:
// it is buffered until its text is complete, sized once for its whole text,
// streamed in word by word, and then rests for its read time before the next
// turn replaces it (the previous one fades to muted beneath). A click or Enter
// advances early. A turn that still runs past the line budget at the minimum
// size is split at its last sentence boundary into two turns.
import { realClock, type Clock } from './runner/engine';

/** The turn marker in reply text. */
export const TURN_MARK = '||';
/** A turn rests at least this long once it is fully on screen (WAVE3 S2: 2.2 → 2.8 s). */
export const TURN_READ_MIN = 2800;
/** …and at least this long per word, counted from its first word (WAVE3 S2: 300 → 320 ms). */
export const TURN_MS_PER_WORD = 320;
/** Pace of the words within a turn (the buffer has the whole turn; this is only the reveal). */
export const TURN_WORD_MS = 55;

export const wordsOf = (text: string): string[] => text.split(/\s+/).filter((w) => w && w !== TURN_MARK);
/** Reply text without turn markers (voice, history, read time). */
export const stripMarks = (text: string): string => text.split(TURN_MARK).map((s) => s.trim()).filter(Boolean).join(' ');

/** How long a turn must stay before the next one may start. */
export function turnWait(words: number, shownFor: number, sinceDone: number): number {
  return Math.max(0, words * TURN_MS_PER_WORD - shownFor, TURN_READ_MIN - sinceDone);
}

/** Pieces of one streamed word around turn markers: `do.||He` → ['do.', '||', 'He']. */
export function splitMarks(word: string): string[] {
  if (!word.includes(TURN_MARK)) return [word];
  const out: string[] = [];
  word.split(TURN_MARK).forEach((p, i) => {
    if (i > 0) out.push(TURN_MARK);
    if (p.trim()) out.push(p.trim());
  });
  return out;
}

// ---- fitting & splitting ------------------------------------------------------

export interface TurnFit {
  /** font size for the whole turn, px */
  px: number;
  /** whether the turn fits the line budget at that size (false only at the floor) */
  fits: boolean;
}
export type MeasureTurn = (text: string) => TurnFit;

/** Word indexes after which a sentence ends ("…do." | "…anymore?"), excluding the last word. */
function cutsAfter(words: string[], re: RegExp): number[] {
  const out: number[] = [];
  for (let i = 0; i < words.length - 1; i++) if (re.test(words[i]!)) out.push(i + 1);
  return out;
}
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const CLAUSE_END = /[,;:—–]$/;

/**
 * Split a turn in two: at the last sentence boundary whose first part fits
 * (unless that leaves a stub under a third of the turn and a later clause
 * boundary fits); with none that fits, the last clause boundary that fits,
 * else the first boundary (and the parts split again); else in the middle.
 */
export function splitTurn(text: string, measure: MeasureTurn): [string, string] | null {
  const words = wordsOf(text);
  if (words.length < 2) return null;
  const head = (i: number) => words.slice(0, i).join(' ');
  /** the latest cut whose head fits */
  const best = (cuts: number[]) => [...cuts].reverse().find((i) => measure(head(i)).fits);
  const sentences = cutsAfter(words, SENTENCE_END);
  const clauses = cutsAfter(words, CLAUSE_END);
  let cut = best(sentences);
  // a sentence boundary that leaves a stub of a turn ("Yoav Zrihan." alone) gives way to a
  // later clause boundary that still fits
  if (cut !== undefined && cut < words.length / 3) {
    const clause = best(clauses);
    if (clause !== undefined && clause > cut) cut = clause;
  }
  cut ??= best(clauses) ?? sentences[0] ?? clauses[0];
  if (cut !== undefined) return [head(cut), words.slice(cut).join(' ')];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

/** One turn → the turns it is shown as (usually itself), each with its size. */
export function fitTurn(text: string, measure: MeasureTurn, depth = 0): { text: string; px: number }[] {
  const f = measure(text);
  if (f.fits || depth >= 6) return [{ text, px: f.px }];
  const parts = splitTurn(text, measure);
  if (!parts) return [{ text, px: f.px }];
  return parts.flatMap((p) => fitTurn(p, measure, depth + 1));
}

// ---- the pacer ------------------------------------------------------------------

export interface ShownTurn {
  text: string;
  px: number;
}

export interface PacerHooks {
  /** a turn starts: a new agent line at this size */
  begin(turn: ShownTurn): void;
  /** one word of the current turn */
  word(w: string): void;
  /** the turn is fully on screen */
  end(turn: ShownTurn): void;
}

/**
 * Shared between pacers so a new reply (or a UI line) still honours the read
 * time of the turn on screen. `say()` clears it: the visitor already moved on.
 */
export interface TurnChannel {
  /** the turn on screen: when it started and finished, and its words */
  last: { startedAt: number; doneAt: number; words: number } | null;
  /** advances the wait in progress, if any */
  skip: (() => void) | null;
}
export const createChannel = (): TurnChannel => ({ last: null, skip: null });

/** How much longer the turn on screen needs before it has been read (0 with none). */
export function readLeft(ch: TurnChannel, now: number): number {
  const l = ch.last;
  return l ? turnWait(l.words, now - l.startedAt, now - l.doneAt) : 0;
}

export interface PacerOptions {
  measure?: MeasureTurn;
  clock?: Clock;
  /** ms between words within a turn; 0 shows a turn at once (reduced motion) */
  pace?: number;
  channel?: TurnChannel;
}

export interface Pacer {
  /** a word from the stream (may carry `||`) */
  push(word: string): void;
  /** a whole line that is its own turn (a notice) */
  line(text: string): void;
  /** the brain's turn boundary */
  boundary(): void;
  /** the reply is complete; resolves once every turn is on screen */
  close(): Promise<void>;
  /** skip the read wait / finish the current turn's words at once */
  advance(): void;
  cancel(): void;
  /** true while a complete turn is waiting for the previous one's read time */
  waiting(): boolean;
  /** number of turns shown so far */
  shown(): number;
}

const defaultMeasure: MeasureTurn = () => ({ px: 0, fits: true });

export function createPacer(h: PacerHooks, o: PacerOptions = {}): Pacer {
  const clock = o.clock ?? realClock;
  const measure = o.measure ?? defaultMeasure;
  const pace = o.pace ?? TURN_WORD_MS;
  const ch = o.channel ?? createChannel();
  let buf: string[] = [];
  const queue: string[] = [];
  let closed = false;
  let cancelled = false;
  let running = false;
  let isWaiting = false;
  let rush = false;
  let inWords = false;
  let count = 0;
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  let poke: (() => void) | null = null;

  /** sleeps `ms`, or less if advanced/cancelled */
  const nap = (ms: number) =>
    new Promise<void>((resolve) => {
      if (ms <= 0 || rush || cancelled) return resolve();
      const t = clock.setTimeout(() => {
        ch.skip = null;
        resolve();
      }, ms);
      ch.skip = () => {
        clock.clearTimeout(t);
        ch.skip = null;
        resolve();
      };
    });

  const kick = () => {
    const p = poke;
    poke = null;
    p?.();
    if (!running) void loop();
  };

  async function loop() {
    running = true;
    try {
      for (;;) {
        if (cancelled) break;
        const next = queue.shift();
        if (next === undefined) {
          if (closed) break;
          await new Promise<void>((r) => (poke = r));
          continue;
        }
        const parts = fitTurn(next, measure);
        queue.unshift(...parts.slice(1).map((p) => p.text));
        const turn = parts[0]!;
        // the turn on screen keeps its read time
        const last = ch.last;
        if (last) {
          const now = clock.now();
          const wait = turnWait(last.words, now - last.startedAt, now - last.doneAt);
          isWaiting = wait > 0;
          await nap(wait);
          isWaiting = false;
          if (cancelled) break;
        }
        rush = false;
        inWords = true;
        const startedAt = clock.now();
        h.begin(turn);
        count++;
        const ws = wordsOf(turn.text);
        for (let i = 0; i < ws.length; i++) {
          if (cancelled) break;
          h.word(ws[i]!);
          if (pace && i < ws.length - 1 && !rush) await nap(pace);
        }
        inWords = false;
        rush = false;
        if (cancelled) break;
        h.end(turn);
        ch.last = { startedAt, doneAt: clock.now(), words: ws.length };
      }
    } finally {
      running = false;
      if (closed || cancelled) finish();
    }
  }

  const boundary = () => {
    if (!buf.length) return;
    queue.push(buf.join(' '));
    buf = [];
    kick();
  };

  return {
    push(word) {
      if (closed || cancelled) return;
      for (const p of splitMarks(word)) {
        if (p === TURN_MARK) boundary();
        else buf.push(p);
      }
    },
    line(text) {
      if (closed || cancelled) return;
      boundary();
      if (stripMarks(text)) {
        for (const part of text.split(TURN_MARK)) if (part.trim()) queue.push(part.trim());
        kick();
      }
    },
    boundary,
    close() {
      if (!closed) {
        boundary();
        closed = true;
        kick();
      }
      return done;
    },
    advance() {
      // mid-turn: the rest of its words at once; waiting: the next turn now;
      // resting: the turn on screen gives up its read time
      if (inWords) {
        rush = true;
        ch.skip?.();
      } else if (isWaiting) ch.skip?.();
      else ch.last = null;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      ch.skip?.();
      kick();
      finish();
    },
    waiting: () => isWaiting,
    shown: () => count,
  };
}
