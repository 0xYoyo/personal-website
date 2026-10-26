import { describe, expect, it } from 'vitest';
import { CAPTION_DELAY, CAPTION_TAIL, READ_MIN, beat, beatStarts, createRunner, duration, readMs, seq, typeMs, type Clock, type Step } from '../ui/runner/engine';
import { PROJECT_HOLD, tour } from '../content/tour';
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
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  };
  return { clock, advance, now: () => now };
}

const glyph = (id: 'wave' | 'frame' | 'kart' | 'btc') => ({ kind: 'glyph', id }) as const;

/** Records "shape:<id>" at step start and "say:<text>" when a caption lands, with times. */
function recorder(now: () => number) {
  const log: string[] = [];
  return {
    log,
    handlers: {
      onStep: (s: Step) => {
        const b = s.become;
        if (b && typeof b !== 'function' && b.kind === 'glyph') log.push(`${now()} shape:${b.id}`);
      },
      onSay: (s: Step) => log.push(`${now()} say:${s.say}`),
    },
  };
}

describe('beat timing (POLISH1 A2)', () => {
  it('reads ~300 ms a word with a 2.4 s floor', () => {
    expect(readMs('This is what I do.')).toBe(READ_MIN);
    expect(readMs('one two three four five six seven eight nine ten')).toBe(3000);
  });

  it('puts the shape first and the caption 900 ms later, then read time + 600 ms', () => {
    const b = beat({ say: 'This is what I do.', become: glyph('wave') });
    expect(b.sayAt).toBe(CAPTION_DELAY);
    expect(b.hold).toBe(CAPTION_DELAY + READ_MIN + CAPTION_TAIL);
  });

  it('a caption with no shape lands at once; captionHold overrides the read time', () => {
    expect(beat({ say: 'hi' }).sayAt).toBe(0);
    expect(beat({ say: 'Prompt Racers', become: glyph('kart'), captionHold: 2600 }).hold).toBe(CAPTION_DELAY + 2600);
  });
});

describe('runner', () => {
  const steps = seq([
    beat({ say: 'one', become: glyph('wave') }), // 0 .. 3900, caption at 900
    beat({ become: glyph('frame'), hold: 1000 }), // 3900 .. 4900, shape only
    beat({ say: 'two', become: glyph('kart'), captionHold: 2600 }), // 4900 .. 8400, caption at 5800
    beat({ say: 'three' }), // 8400 .. 11400, caption at once
  ]);

  it('computes beats and duration', () => {
    expect(beatStarts(steps)).toEqual([0, 2, 3]);
    expect(duration(steps)).toBe(3900 + 1000 + 3500 + 3000);
  });

  it('forms each shape before its caption and ends after the last hold', () => {
    const c = fakeClock();
    const rec = recorder(c.now);
    let ended = '';
    const r = createRunner(steps, { ...rec.handlers, onEnd: (why) => (ended = why) }, { clock: c.clock });
    r.start();
    expect(rec.log).toEqual(['0 shape:wave']);
    c.advance(899);
    expect(rec.log).toHaveLength(1);
    c.advance(1);
    expect(rec.log.at(-1)).toBe('900 say:one');
    c.advance(3000);
    expect(rec.log.at(-1)).toBe('3900 shape:frame');
    c.advance(1000);
    expect(rec.log.at(-1)).toBe('4900 shape:kart');
    c.advance(900);
    expect(rec.log.at(-1)).toBe('5800 say:two');
    c.advance(2600);
    expect(rec.log.at(-1)).toBe('8400 say:three');
    expect(r.running()).toBe(true);
    c.advance(3000);
    expect(ended).toBe('done');
    expect(r.running()).toBe(false);
  });

  it('next/prev jump between beats and reschedule from there', () => {
    const c = fakeClock();
    const rec = recorder(c.now);
    const r = createRunner(steps, { ...rec.handlers, onEnd: () => {} }, { clock: c.clock });
    r.start();
    r.next();
    expect(rec.log.at(-1)).toBe('0 shape:kart');
    expect(r.beat()).toBe(1);
    c.advance(900);
    expect(rec.log.at(-1)).toBe('900 say:two');
    r.prev();
    expect(rec.log.at(-1)).toBe('900 shape:wave');
    c.advance(900);
    expect(rec.log.at(-1)).toBe('1800 say:one');
  });

  it('step mode applies every step (shape and caption together) and never advances on its own', () => {
    const c = fakeClock();
    const rec = recorder(c.now);
    let ended = false;
    const r = createRunner(steps, { ...rec.handlers, onEnd: () => (ended = true) }, { clock: c.clock, stepMode: true });
    r.start();
    expect(rec.log).toEqual(['0 shape:wave', '0 say:one']);
    c.advance(60_000);
    expect(rec.log).toHaveLength(2);
    r.next(); // the shape-only step gets its own click
    expect(rec.log.at(-1)).toBe('60000 shape:frame');
    r.next();
    expect(rec.log.slice(-2)).toEqual(['60000 shape:kart', '60000 say:two']);
    r.prev();
    expect(rec.log.at(-1)).toBe('60000 shape:frame');
    r.next();
    r.next();
    expect(rec.log.at(-1)).toBe('60000 say:three');
    expect(ended).toBe(false);
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
});

describe('the tour and the stories', () => {
  it('story beats form the shape 900 ms before the caption; every caption holds ≥ 2.4 s + 600 ms', () => {
    for (const steps of [tour, ...stories.map((s) => s.steps)]) {
      for (const s of steps) {
        if (s.say === undefined) continue;
        if (s.become && steps !== tour) expect(s.sayAt).toBe(CAPTION_DELAY);
        expect(s.hold - (s.sayAt ?? 0)).toBeGreaterThanOrEqual(Math.min(2600, READ_MIN + CAPTION_TAIL));
      }
    }
  });

  it('tour captions and shapes change together (0 ms): the caption types in while the shape knits (POLISH2 A3)', () => {
    const captioned = tour.filter((s) => s.say !== undefined);
    expect(captioned.length).toBeGreaterThan(8);
    for (const s of captioned) expect(s.sayAt ?? 0).toBe(0);
    expect(beat({ say: 'x', become: glyph('wave'), sync: true }).sayAt).toBe(0);
  });

  it('the tour opens on its first caption at once, so "or just watch." is never followed by a wordless gap', () => {
    const { clock, advance } = fakeClock();
    const seen: string[] = [];
    const r = createRunner(tour, { onStep: () => undefined, onSay: (s) => seen.push(s.say!), onEnd: () => undefined }, { clock });
    r.start();
    expect(seen).toEqual(["I'm Yoyo."]); // at t = 0, with the 3D yoyo
    advance(10);
    r.skip();
  });

  it('shapes morph straight into each other: no release between tour beats', () => {
    expect(tour.some((s) => s.release)).toBe(false);
  });

  it('the project names hold 2.4 s each from the moment the caption has typed in, under one lead (WAVE3 V3)', () => {
    const names = tour.filter((s) => s.lead === "Things I've shipped:");
    expect(names.map((s) => s.say)).toEqual(['Unfiltered', 'Prompt Racers', 'yoyo-loop', 'Reichman Courses connector']);
    expect(PROJECT_HOLD).toBe(2400);
    for (const s of names) expect(s.hold - (s.sayAt ?? 0) - typeMs(s.say!)).toBe(2400);
  });

  it('first person, no army line; the tour ends on the question with the three end chips (WAVE3 V3)', () => {
    expect(tour[0]!.become).toEqual({ kind: 'yoyo3d' });
    expect(tour.some((s) => /combat|army|unit/i.test(s.say ?? ''))).toBe(false);
    const last = tour[tour.length - 1]!;
    expect(last.become).toEqual({ kind: 'glyph', id: 'question' });
    expect(last.say).toBe('Ask me anything.');
    expect(last.chips).toEqual(['Who are you?', 'What have you built?', 'Play the game']);
  });

  it('the tour runs ~35 s; stories have two lines each and end with reach-me chips', () => {
    expect(duration(tour)).toBeGreaterThan(33_000);
    expect(duration(tour)).toBeLessThan(37_000);
    for (const s of stories) {
      expect(s.steps.filter((x) => x.say).length).toBe(2);
      expect(duration(s.steps)).toBeLessThanOrEqual(16_000);
      expect(s.steps.at(-1)?.chips).toContain('How do I reach you?');
    }
  });
});
