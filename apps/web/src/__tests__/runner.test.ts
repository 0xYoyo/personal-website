import { describe, expect, it } from 'vitest';
import { CAPTION_DELAY, CAPTION_TAIL, READ_MIN, beat, beatStarts, createRunner, duration, readMs, seq, type Clock, type Step } from '../ui/runner/engine';
import { SCENE_MS, SHOW_LINES, showSteps } from '../content/show';
import { stories } from '../content/stories';
import { ENTRY_CHIPS } from '../content/chips';

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

const show = showSteps();

describe('the show and the stories', () => {
  it('story beats form the shape 900 ms before the caption; every caption holds ≥ 2.4 s + 600 ms', () => {
    for (const steps of stories.map((s) => s.steps)) {
      for (const s of steps) {
        if (s.say === undefined) continue;
        if (s.become) expect(s.sayAt).toBe(CAPTION_DELAY);
        expect(s.hold - (s.sayAt ?? 0)).toBeGreaterThanOrEqual(Math.min(2600, READ_MIN + CAPTION_TAIL));
      }
    }
  });

  it('seven scenes, one line each, verbatim, typed in with the scene start (wave 3 SHOW)', () => {
    const captioned = show.filter((s) => s.say !== undefined);
    expect(captioned.map((s) => s.say)).toEqual([...SHOW_LINES]);
    expect(SHOW_LINES).toEqual([
      "I'm Yoyo.",
      "I don't write most of my code anymore. I direct the things that do.",
      "Unfiltered. Type what you want the way you'd say it. It finds the product.",
      'Prompt Racers. A kart racer that teaches kids how to talk to AI.',
      'yoyo-loop. I write the spec. Agents build. Another agent reviews. I merge.',
      'Crypto since 2021. Self-taught since 2022. Reichman since 2025.',
      'Ask me anything.',
    ]);
    for (const s of captioned) expect(s.sayAt ?? 0).toBe(0);
    expect(beat({ say: 'x', become: glyph('wave'), sync: true }).sayAt).toBe(0);
  });

  it('each line holds for its whole scene: the scenes run 3.5 / 5 / 5.5 / 6 / 6 / 5 / 4 s, ~35 s in all', () => {
    const starts = show.map((s, i) => (s.say !== undefined ? i : -1)).filter((i) => i >= 0);
    const lens = starts.map((i, k) => (k + 1 < starts.length ? show[starts[k + 1]!]!.at : duration(show)) - show[i]!.at);
    expect(lens).toEqual([...SCENE_MS]);
    expect(duration(show)).toBe(35_000);
  });

  it('opens on its first caption at once, with the letters', () => {
    const { clock, advance } = fakeClock();
    const seen: string[] = [];
    const r = createRunner(show, { onStep: () => undefined, onSay: (s) => seen.push(s.say!), onEnd: () => undefined }, { clock });
    r.start();
    expect(seen).toEqual(["I'm Yoyo."]);
    expect(show[0]!.become).toEqual({ kind: 'yoyo3d' });
    advance(10);
    r.skip();
  });

  it('the swarm performs scenes 1–5 (groups with paths) and morphs straight on; it lets go only at the very end', () => {
    expect(show.filter((s) => s.perform).length).toBe(5);
    expect(show.findIndex((s) => s.release)).toBe(show.length - 1);
    const box = { w: 486, h: 620 };
    for (const s of show) {
      if (!s.perform) continue;
      const sc = typeof s.perform === 'function' ? s.perform(box) : s.perform;
      expect(sc.groups.length).toBeGreaterThan(0);
      expect(sc.groups.length).toBeLessThanOrEqual(6);
      if (sc.lite) expect(sc.lite.groups.length).toBeLessThanOrEqual(3);
    }
  });

  it('ends on the question and the three entry chips; reduced motion: one still tableau a scene', () => {
    const last = show.filter((s) => s.say !== undefined).at(-1)!;
    expect(last.become).toEqual({ kind: 'glyph', id: 'question' });
    expect(last.chips).toEqual(ENTRY_CHIPS);
    const still = showSteps(true);
    expect(still.length).toBe(7);
    expect(still.every((s) => s.say !== undefined && (s.become || s.perform))).toBe(true);
  });

  it('stories have two lines each and end with reach-me chips', () => {
    for (const s of stories) {
      expect(s.steps.filter((x) => x.say).length).toBe(2);
      expect(duration(s.steps)).toBeLessThanOrEqual(16_000);
      expect(s.steps.at(-1)?.chips).toContain('How do I reach you?');
    }
  });
});
