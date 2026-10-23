import { describe, expect, it } from 'vitest';
import { beatStarts, createRunner, duration, seq, type Clock, type Step } from '../ui/runner/engine';
import { tour } from '../content/tour';
import { stories } from '../content/stories';

function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (t) => void timers.delete(t as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  };
  return { clock, advance };
}

const steps: Step[] = seq([
  { say: 'one', hold: 1000 },
  { sub: 'one-b', hold: 500 },
  { say: 'two', hold: 1000 },
  { say: 'three', hold: 1000 },
]);

describe('runner', () => {
  it('computes beats and duration', () => {
    expect(beatStarts(steps)).toEqual([0, 2, 3]);
    expect(duration(steps)).toBe(3500);
  });

  it('fires steps on time and ends', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    let ended = '';
    const r = createRunner(steps, { onStep: (s) => fired.push(s.say ?? s.sub ?? ''), onEnd: (why) => (ended = why) }, { clock });
    r.start();
    expect(fired).toEqual(['one']);
    advance(999);
    expect(fired).toEqual(['one']);
    advance(1);
    expect(fired).toEqual(['one', 'one-b']);
    advance(500);
    expect(r.beat()).toBe(1);
    advance(2000);
    expect(fired).toEqual(['one', 'one-b', 'two', 'three']);
    expect(ended).toBe('done');
    expect(r.running()).toBe(false);
  });

  it('next/prev jump between beats and reschedule', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    const r = createRunner(steps, { onStep: (s) => fired.push(s.say ?? s.sub ?? ''), onEnd: () => {} }, { clock });
    r.start();
    r.next();
    expect(fired.at(-1)).toBe('two');
    r.prev();
    expect(fired.at(-1)).toBe('one');
    advance(1000);
    expect(fired.at(-1)).toBe('one-b');
  });

  it('step mode never advances on its own and applies whole beats', () => {
    const { clock, advance } = fakeClock();
    const fired: string[] = [];
    let ended = false;
    const r = createRunner(steps, { onStep: (s) => fired.push(s.say ?? s.sub ?? ''), onEnd: () => (ended = true) }, { clock, stepMode: true });
    r.start();
    expect(fired).toEqual(['one', 'one-b']);
    advance(60_000);
    expect(fired).toHaveLength(2);
    r.next();
    r.next();
    r.next();
    expect(ended).toBe(true);
  });

  it('skip ends with reason skip', () => {
    let why = '';
    const r = createRunner(steps, { onStep: () => {}, onEnd: (w) => (why = w) }, { clock: fakeClock().clock });
    r.start();
    r.skip();
    expect(why).toBe('skip');
  });

  it('the tour runs about 45 s and stories about 15 s each', () => {
    expect(duration(tour)).toBeGreaterThan(40_000);
    expect(duration(tour)).toBeLessThan(50_000);
    for (const s of stories) {
      expect(duration(s.steps)).toBeGreaterThanOrEqual(14_000);
      expect(duration(s.steps)).toBeLessThanOrEqual(16_000);
      expect(s.steps.filter((x) => x.say).length).toBe(2);
    }
  });
});
