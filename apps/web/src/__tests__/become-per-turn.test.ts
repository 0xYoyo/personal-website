import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShapeSpec, SwarmApi } from '@yoyo/protocol';
import { createBrain } from '../agent';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { TURN_READ_MIN } from '../ui/turns';

// WAVE4 U10: a turn that carries its own `[[become:…]]` morphs the swarm at that turn's first word,
// not when the tag is parsed (which is long before the turn is shown).
const REPLIES: Record<string, string> = {
  'two shapes': '[[become:loop]] One two three. || [[become:star]] Four five six.',
  'tail shape': 'Only one turn here. [[become:heart]]',
};
vi.mock('../agent/client/scripted', async (orig) => {
  const m = await orig<typeof import('../agent/client/scripted')>();
  return {
    ...m,
    scriptedReply: (text: string, ctx: Parameters<typeof m.scriptedReply>[1]) =>
      REPLIES[text] ? { raw: REPLIES[text]!, classification: { kind: 'unknown' as const } } : m.scriptedReply(text, ctx),
  };
});

function fakeSwarm(log: string[], t0: number): SwarmApi {
  const noop = () => undefined;
  return {
    become: (s: ShapeSpec) => log.push(`${Date.now() - t0} become:${s.kind === 'glyph' ? s.id : s.kind}`),
    release: noop,
    mood: noop,
    buildFrame: noop,
    pointer: noop,
    setScene: noop,
    setQuality: noop,
    setListeningLevel: noop,
    pulse: noop,
    screenshot: () => Promise.resolve(new Blob()),
    stats: () => ({ fps: 60, count: 0, tier: 0, backend: 'canvas2d' }),
    destroy: noop,
  };
}

describe('a turn’s own shape (WAVE4 U10)', () => {
  let log: string[];
  let t0: number;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    log = [];
    t0 = Date.now();
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: fakeSwarm(log, t0), sound: null, voice: null });
    useStore.subscribe((s, p) => {
      if (s.lines.length > p.lines.length && s.lines.at(-1)?.role === 'agent') log.push(`${Date.now() - t0} line`);
    });
  });
  afterEach(() => vi.useRealTimers());

  const at = (k: string) => Number(log.find((l) => l.endsWith(k))?.split(' ')[0] ?? NaN);
  const run = async (text: string) => {
    const done = ctl.say(text);
    for (let i = 0; i < 400 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(100);
    await done;
  };

  it('the second turn’s shape waits for the second turn', async () => {
    await run('two shapes');
    const lines = log.filter((l) => l.endsWith(' line')).map((l) => Number(l.split(' ')[0]));
    expect(lines).toHaveLength(2);
    // the first shape goes with the first turn, the second with the second, a read time later
    expect(at('become:loop')).toBeLessThanOrEqual(lines[0]!);
    expect(at('become:star')).toBeGreaterThanOrEqual(lines[0]! + TURN_READ_MIN);
    expect(at('become:star')).toBeLessThanOrEqual(lines[1]!);
    expect(log.indexOf(log.find((l) => l.endsWith('become:star'))!)).toBe(log.indexOf(log.find((l) => l.endsWith(' line') && Number(l.split(' ')[0]) === lines[1])!) - 1);
  });

  it('a shape at the end of a one-turn reply goes with that turn', async () => {
    await run('tail shape');
    const line = Number(log.find((l) => l.endsWith(' line'))!.split(' ')[0]);
    expect(at('become:heart')).toBeLessThanOrEqual(line);
  });
});
