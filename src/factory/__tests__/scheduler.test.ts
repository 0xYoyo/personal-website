import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFactoryStore } from '../store';
import { buildDuration, capacity, startScheduler, TIMING, type Scheduler } from '../scheduler';
import { META, memoryStorage } from './fixtures';

let scheduler: Scheduler | null = null;

function setup(speed = 1) {
  const store = createFactoryStore({ storage: memoryStorage() });
  store.getState().boot(META);
  scheduler = startScheduler(store, { speed });
  return { store, s: () => store.getState(), state: (id: string) => store.getState().sections[id]!.state };
}

// Build for these fixtures: 1.6 s. Pipeline from claim to awaiting = 1600 + 900 + 800 = 3300 ms.
const PIPE = 1600 + TIMING.ci + TIMING.review;

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  });
  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
    vi.useRealTimers();
  });

  it('clamps build time to 1.6–2.4 s based on source length', () => {
    expect(buildDuration(500)).toBe(1600);
    expect(buildDuration(2800)).toBe(2000);
    expect(buildDuration(9000)).toBe(2400);
    expect(buildDuration(2800, 0.6)).toBe(1200);
  });

  it('starts #2 at 0.6 s and walks it to awaiting-merge with sequential checks', () => {
    const { state, s } = setup();
    vi.advanceTimersByTime(599);
    expect(state('loop')).toBe('queued');
    vi.advanceTimersByTime(1);
    expect(state('loop')).toBe('building');
    vi.advanceTimersByTime(1600);
    expect(state('loop')).toBe('ci');
    expect(s().sections.loop!.ciPassed).toBe(0);
    vi.advanceTimersByTime(300);
    expect(s().sections.loop!.ciPassed).toBe(1);
    vi.advanceTimersByTime(300);
    expect(s().sections.loop!.ciPassed).toBe(2);
    vi.advanceTimersByTime(300);
    expect(state('loop')).toBe('review');
    vi.advanceTimersByTime(800);
    expect(state('loop')).toBe('awaiting-merge');
  });

  it('runs one builder until the first merge, and waits for the human in manual mode', () => {
    const { state } = setup();
    vi.advanceTimersByTime(600 + PIPE + 10_000);
    expect(state('loop')).toBe('awaiting-merge');
    expect(state('projects')).toBe('queued');
    expect(state('early')).toBe('queued');
  });

  it('opens up to two concurrent builders after the first merge', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(600 + PIPE);
    s().merge('loop', 'human');
    vi.advanceTimersByTime(TIMING.claimGap);
    expect(state('projects')).toBe('building');
    vi.advanceTimersByTime(TIMING.claimGap);
    expect(state('early')).toBe('building');
    expect(state('gitlog')).toBe('queued');
    expect(capacity(s())).toEqual({ limit: 2, used: 2 });
    // When both are awaiting, builders are free again and the next two start.
    vi.advanceTimersByTime(PIPE + 2 * TIMING.claimGap);
    expect(state('projects')).toBe('awaiting-merge');
    expect(state('early')).toBe('awaiting-merge');
    expect(state('gitlog')).not.toBe('queued');
  });

  it('never blocks: a rushed awaiting PR merges immediately as a scroll merge', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(600 + PIPE);
    s().rush('loop');
    expect(state('loop')).toBe('merged');
    expect(s().sections.loop!.mergedBy).toBe('scroll');
    expect(s().log.at(-1)!.text).toBe('#2 · auto (you scrolled past)');
  });

  it('never blocks: a queued or building PR scrolled past fast-forwards and merges within 400 ms', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(700); // #2 building
    expect(state('loop')).toBe('building');
    s().rush('loop');
    s().rush('stack'); // still queued, far down the list
    vi.advanceTimersByTime(TIMING.rushTotal - 1);
    expect(state('loop')).not.toBe('merged');
    vi.advanceTimersByTime(1);
    expect(state('loop')).toBe('merged');
    expect(state('stack')).toBe('merged');
    expect(s().sections.stack!.mergedBy).toBe('scroll');
    expect(s().sections.stack!.ciPassed).toBe(3);
    expect(s().hintFor).toBeNull(); // a rushed PR never takes the "your turn" hint
  });

  it('/yoyo-merge-all fast-forwards everything and logs it as a command', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(700);
    for (const m of META.slice(1)) s().rush(m.id, 'command');
    vi.advanceTimersByTime(TIMING.rushTotal);
    expect(META.every((m) => state(m.id) === 'merged')).toBe(true);
    expect(s().log.some((e) => e.tag === 'merged' && e.text === '#5 · /yoyo-merge-all')).toBe(true);
    expect(s().autoMerges).toBe(7);
  });

  it('/yoyo-build starts the next queued PR now, even when builders are busy', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(700);
    expect(state('projects')).toBe('queued');
    expect(s().requestBuild()?.id).toBe('projects');
    expect(state('projects')).toBe('building');
  });

  it('autopilot merges 1.2 s after review', () => {
    const { s, state } = setup();
    s().setMode('autopilot');
    vi.advanceTimersByTime(600 + PIPE);
    expect(state('loop')).toBe('awaiting-merge');
    vi.advanceTimersByTime(TIMING.autopilotDelay - 1);
    expect(state('loop')).toBe('awaiting-merge');
    vi.advanceTimersByTime(1);
    expect(state('loop')).toBe('merged');
    expect(s().sections.loop!.mergedBy).toBe('autopilot');
    // and the loop keeps going on its own to the end
    vi.advanceTimersByTime(60_000);
    expect(META.every((m) => state(m.id) === 'merged')).toBe(true);
    expect(s().endCard).toBe('open');
    expect(s().manualMerges).toBe(0);
  });

  it('turning autopilot on merges PRs that are already waiting', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(600 + PIPE);
    s().setMode('autopilot');
    vi.advanceTimersByTime(TIMING.autopilotDelay);
    expect(state('loop')).toBe('merged');
  });

  it('turning autopilot off cancels a pending autopilot merge', () => {
    const { s, state } = setup();
    s().setMode('autopilot');
    vi.advanceTimersByTime(600 + PIPE + 500);
    s().setMode('manual');
    vi.advanceTimersByTime(5000);
    expect(state('loop')).toBe('awaiting-merge');
  });

  it('skip stops all timers and leaves everything merged', () => {
    const { s, state } = setup();
    vi.advanceTimersByTime(1000);
    s().skipShow();
    vi.advanceTimersByTime(60_000);
    expect(META.every((m) => state(m.id) === 'merged')).toBe(true);
    expect(s().autoMerges).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replay restarts the loop from #2 at 0.6 s', () => {
    const { s, state } = setup();
    s().skipShow();
    s().replay();
    expect(state('loop')).toBe('queued');
    vi.advanceTimersByTime(600);
    expect(state('loop')).toBe('building');
  });

  it('scales every timing by 0.6 on mobile', () => {
    const { state } = setup(0.6);
    vi.advanceTimersByTime(360);
    expect(state('loop')).toBe('building');
    vi.advanceTimersByTime(Math.round(PIPE * 0.6));
    expect(state('loop')).toBe('awaiting-merge');
  });
});
