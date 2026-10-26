import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../ui/runner/engine';
import {
  createChannel,
  createPacer,
  fitTurn,
  splitMarks,
  splitTurn,
  stripMarks,
  turnWait,
  TURN_MS_PER_WORD,
  TURN_READ_MIN,
  type MeasureTurn,
  type ShownTurn,
} from '../ui/turns';

const clock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/** Fits while the turn has ≤ `max` words; 50 px when it fits, the 44 px floor when not. */
const byWords =
  (max: number): MeasureTurn =>
  (t) => {
    const n = t.split(/\s+/).filter(Boolean).length;
    return n <= max ? { px: 50, fits: true } : { px: 44, fits: false };
  };

function harness(opts: { measure?: MeasureTurn; pace?: number; channel?: ReturnType<typeof createChannel> } = {}) {
  const t0 = Date.now();
  const log: string[] = [];
  const begun: ShownTurn[] = [];
  const pacer = createPacer(
    {
      begin: (t) => {
        begun.push(t);
        log.push(`${Date.now() - t0} begin:${t.text}`);
      },
      word: () => undefined,
      end: (t) => log.push(`${Date.now() - t0} end:${t.text}`),
    },
    { clock, pace: opts.pace ?? 0, measure: opts.measure ?? byWords(99), channel: opts.channel ?? createChannel() },
  );
  const at = (prefix: string) => {
    const hit = log.find((l) => l.split(' ')[1] === prefix);
    return hit ? Number(hit.split(' ')[0]) : -1;
  };
  return { pacer, log, begun, at };
}
const feed = (p: ReturnType<typeof createPacer>, text: string) => text.split(' ').forEach((w) => p.push(w));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('turn markers', () => {
  it('splits a streamed word around ||, and strips markers from reply text', () => {
    expect(splitMarks('do.||He')).toEqual(['do.', '||', 'He']);
    expect(splitMarks('||')).toEqual(['||']);
    expect(splitMarks('plain')).toEqual(['plain']);
    expect(stripMarks('Three reasons. || He ships. ||')).toBe('Three reasons. He ships.');
  });

  it('waits ≥ 2.8 s after a turn lands and 320 ms a word from its start (WAVE3 S2)', () => {
    expect(turnWait(5, 0, 0)).toBe(TURN_READ_MIN);
    expect(turnWait(20, 500, 0)).toBe(5900); // 6.4 s of words from the start
    expect(turnWait(20, 7000, 3000)).toBe(0);
    expect(turnWait(5, 2000, 2799)).toBe(1);
  });
});

describe('the pacer (POLISH2 A1)', () => {
  it('shows a turn only once its text is complete', async () => {
    const { pacer, begun } = harness();
    feed(pacer, 'Three reasons. No');
    await vi.advanceTimersByTimeAsync(5000);
    expect(begun).toHaveLength(0); // buffered: the stream has not closed the turn yet
    feed(pacer, 'adjectives. ||');
    expect(begun.map((t) => t.text)).toEqual(['Three reasons. No adjectives.']);
    void pacer.close();
  });

  it('starts the next turn only after the previous one’s read time', async () => {
    const { pacer, at } = harness({ pace: 55 });
    feed(pacer, 'Three reasons. No adjectives. || He ships: 917 public commits this year, a real game, a published connector. || And he tells the truth.');
    const done = pacer.close();
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    const b1 = at('begin:Three'), e1 = at('end:Three'), b2 = at('begin:He'), e2 = at('end:He'), b3 = at('begin:And');
    expect(b1).toBe(0);
    expect(b2 - e1).toBeGreaterThanOrEqual(TURN_READ_MIN); // 4 words: the 2.8 s floor rules
    expect(b3 - b2).toBeGreaterThanOrEqual(13 * TURN_MS_PER_WORD); // 13 words: 320 ms a word from its start
    expect(b3 - e2).toBeGreaterThanOrEqual(TURN_READ_MIN);
  });

  it('a click / Enter advances: mid-turn it finishes the words, waiting it starts the next turn', async () => {
    const { pacer, at, log } = harness({ pace: 55 });
    feed(pacer, 'one two three four five six seven eight. || next turn here.');
    void pacer.close();
    await vi.advanceTimersByTimeAsync(100);
    pacer.advance(); // mid-turn: the rest of the words at once
    await vi.advanceTimersByTimeAsync(0);
    expect(at('end:one')).toBeLessThan(200);
    await vi.advanceTimersByTimeAsync(500);
    expect(at('begin:next')).toBe(-1); // still reading
    pacer.advance(); // waiting: go
    await vi.advanceTimersByTimeAsync(0);
    expect(at('begin:next')).toBeLessThan(1000);
    expect(log.filter((l) => l.includes('begin:'))).toHaveLength(2);
  });

  it('takes the brain’s turn boundary as well as ||', async () => {
    const { pacer, begun } = harness();
    feed(pacer, 'First turn.');
    pacer.boundary();
    feed(pacer, 'Second turn.');
    const done = pacer.close();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(begun.map((t) => t.text)).toEqual(['First turn.', 'Second turn.']);
  });

  it('fits each turn once, before it is shown, and shows it at that size', async () => {
    const measure = vi.fn(byWords(99));
    const { pacer, begun } = harness({ measure, pace: 55 });
    feed(pacer, 'Honest ones. LeetCode-style interviews aren’t his strong side. || Distribution is harder for him than building.');
    const done = pacer.close();
    await vi.advanceTimersByTimeAsync(20_000);
    await done;
    expect(measure).toHaveBeenCalledTimes(2); // once per turn, never per word
    expect(measure.mock.calls.map((c) => c[0])).toEqual(['Honest ones. LeetCode-style interviews aren’t his strong side.', 'Distribution is harder for him than building.']);
    expect(begun.map((t) => t.px)).toEqual([50, 50]);
  });

  it('splits a turn that overflows at the floor at its last sentence boundary', async () => {
    const { pacer, begun } = harness({ measure: byWords(8) });
    feed(pacer, 'He is early. Solidity in 2022. Ordinals in early 2023. Agent factories before they had a name.');
    const done = pacer.close();
    await vi.advanceTimersByTimeAsync(30_000);
    await done;
    // 18 words never fit in 8: the last boundary whose head fits, then the rest the same way
    expect(begun.map((t) => t.text)).toEqual(['He is early. Solidity in 2022.', 'Ordinals in early 2023.', 'Agent factories before they had a name.']);
    expect(begun.every((t) => t.px === 50)).toBe(true);
  });

  it('a cancelled reply shows nothing more', async () => {
    const { pacer, begun } = harness();
    feed(pacer, 'one. || two. || three.');
    pacer.cancel();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(begun.map((t) => t.text)).toEqual(['one.']);
  });

  it('a following line waits for the turn on screen; a new visitor message does not', async () => {
    const channel = createChannel();
    const a = harness({ channel });
    a.pacer.line('the first line rests a while.');
    await a.pacer.close();
    const b = harness({ channel });
    b.pacer.line('on it.');
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.begun).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(TURN_READ_MIN);
    expect(b.begun).toHaveLength(1);
    channel.last = null; // what ctl.say() does
    const c = harness({ channel });
    c.pacer.line('answer.');
    expect(c.begun).toHaveLength(1);
  });
});

describe('splitTurn / fitTurn', () => {
  it('a sentence boundary that would leave a stub gives way to a later clause boundary', () => {
    const t = 'Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS at Reichman.';
    expect(splitTurn(t, byWords(9))).toEqual(['Yoav Zrihan. Self-taught, building since 2022, crypto since 2021,', 'second-year CS at Reichman.']);
    // a sentence boundary with a real first part still wins
    expect(splitTurn('He ships every week. Solidity in 2022, Ordinals in 2023, agents now.', byWords(9))).toEqual(['He ships every week.', 'Solidity in 2022, Ordinals in 2023, agents now.']);
  });

  it('falls back to a clause boundary, then the middle', () => {
    const m = byWords(3);
    expect(splitTurn('one two, three four five', m)).toEqual(['one two,', 'three four five']);
    expect(splitTurn('one two three four', m)).toEqual(['one two', 'three four']);
    expect(fitTurn('short one.', m)).toEqual([{ text: 'short one.', px: 50 }]);
  });
});
