import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createFactoryStore, formatDuration, formatStamp, selectProgress, selectStatus, SEEN_KEY } from '../store';
import { META, memoryStorage } from './fixtures';
import { loopTitle } from '../useLoopChrome';

function setup(seen = false) {
  const storage = memoryStorage();
  if (seen) storage.setItem(SEEN_KEY, '1');
  const store = createFactoryStore({ storage });
  store.getState().boot(META);
  return { store, storage, s: () => store.getState() };
}

/** Walk one PR through the whole pipeline to awaiting-merge. */
function ready(store: ReturnType<typeof setup>['store'], id: (typeof META)[number]['id']) {
  const g = store.getState();
  g.advance(id, 'queued', { buildMs: 1600 });
  g.advance(id, 'building');
  g.passCheck(id);
  g.passCheck(id);
  g.passCheck(id);
  g.advance(id, 'ci');
  g.advance(id, 'review');
}

describe('factory store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  });

  it('boots with the hero pre-merged and everything else queued', () => {
    const { s } = setup();
    expect(s().sections.hero!.state).toBe('merged');
    expect(s().sections.hero!.mergedBy).toBe('init');
    expect(META.slice(1).every((m) => s().sections[m.id]!.state === 'queued')).toBe(true);
    expect(s().log[0]!.text).toBe('7 sections queued · #1 hero merged at init');
    expect(selectProgress(s())).toBe(0);
  });

  it('moves through queued → building → ci → review → awaiting-merge in order only', () => {
    const { s } = setup();
    s().advance('loop', 'building'); // wrong "from": ignored
    expect(s().sections.loop!.state).toBe('queued');
    s().advance('loop', 'queued', { buildMs: 1800 });
    expect(s().sections.loop!.state).toBe('building');
    expect(s().sections.loop!.buildMs).toBe(1800);
    s().advance('loop', 'building');
    expect(s().sections.loop!.state).toBe('ci');
    s().passCheck('loop');
    s().passCheck('loop');
    s().passCheck('loop');
    s().passCheck('loop'); // a fourth check does not exist
    expect(s().sections.loop!.ciPassed).toBe(3);
    s().advance('loop', 'ci');
    s().advance('loop', 'review');
    expect(s().sections.loop!.state).toBe('awaiting-merge');
    // advance never merges; only merge() does
    s().advance('loop', 'awaiting-merge');
    expect(s().sections.loop!.state).toBe('awaiting-merge');
  });

  it('logs with timestamps relative to the loop start', () => {
    const { s } = setup();
    vi.advanceTimersByTime(3200);
    s().advance('loop', 'queued', { buildMs: 1600 });
    const last = s().log.at(-1)!;
    expect(last.t).toBe(3200);
    expect(formatStamp(last.t)).toBe('+00:03.2');
    expect(last.tag).toBe('build');
    expect(last.text).toBe('#2 · writing src/sections/loop/Component.tsx (50 lines)');
  });

  it('a human can only merge what is awaiting merge', () => {
    const { s, store } = setup();
    expect(s().merge('loop', 'human')).toBe(false);
    ready(store, 'loop');
    expect(s().hintFor).toBe('loop');
    expect(s().merge('loop', 'human')).toBe(true);
    expect(s().merge('loop', 'human')).toBe(false); // already merged
    expect(s().manualMerges).toBe(1);
    expect(s().log.at(-1)!.tag).toBe('merged');
    expect(s().log.at(-1)!.text).toBe('#2 by you');
    expect(selectProgress(s())).toBeCloseTo(1 / 7);
  });

  it('offers autopilot after the first manual merge, and only then', () => {
    const { s, store } = setup();
    expect(s().autopilotOffer).toBe('hidden');
    ready(store, 'loop');
    s().merge('loop', 'human');
    expect(s().autopilotOffer).toBe('open');
    s().answerAutopilotOffer(true);
    expect(s().mode).toBe('autopilot');
    expect(s().autopilotOffer).toBe('answered');
  });

  it('counts scroll and autopilot merges as auto', () => {
    const { s, store } = setup();
    ready(store, 'loop');
    s().merge('loop', 'scroll');
    expect(s().log.at(-1)!.text).toBe('#2 · auto (you scrolled past)');
    ready(store, 'projects');
    s().merge('projects', 'autopilot');
    expect(s().autoMerges).toBe(2);
    expect(s().manualMerges).toBe(0);
  });

  it('completes after #8, opens the end card once and marks the visitor as seen', () => {
    const { s, store, storage } = setup();
    for (const m of META.slice(1)) {
      ready(store, m.id);
      s().merge(m.id, 'human');
    }
    expect(selectProgress(s())).toBe(1);
    expect(s().completedAt).not.toBeNull();
    expect(s().endCard).toBe('open');
    expect(storage.map.get(SEEN_KEY)).toBe('1');
    expect(selectStatus(s())).toBe('loop complete · all PRs merged');
    s().setEndCard('dismissed');
    expect(s().endCard).toBe('dismissed');
  });

  it('skipShow merges everything at once without the end card', () => {
    const { s, storage } = setup();
    s().skipShow();
    expect(META.every((m) => s().sections[m.id]!.state === 'merged')).toBe(true);
    expect(s().skipped).toBe(true);
    expect(s().endCard).toBe('closed');
    expect(selectProgress(s())).toBe(1);
    expect(storage.map.get(SEEN_KEY)).toBe('1');
  });

  it('a returning visitor starts fully merged', () => {
    const { s } = setup(true);
    expect(s().seen).toBe(true);
    expect(s().skipped).toBe(true);
    expect(selectProgress(s())).toBe(1);
  });

  it('replay resets the run but keeps seen', () => {
    const { s, store } = setup(true);
    const before = s().runId;
    vi.advanceTimersByTime(5000);
    s().replay();
    expect(s().runId).toBe(before + 1);
    expect(s().skipped).toBe(false);
    expect(s().seen).toBe(true);
    expect(s().sections.loop!.state).toBe('queued');
    expect(s().log).toHaveLength(1);
    expect(s().startedAt).toBe(Date.now());
    ready(store, 'loop');
    expect(s().hintFor).toBe('loop');
  });

  it('the Lights command flips the palette and then follows the build again', () => {
    const { s } = setup();
    s().toggleLights();
    expect(selectProgress(s())).toBe(1);
    s().toggleLights();
    expect(selectProgress(s())).toBe(0);
  });

  it('formats durations for the end card', () => {
    expect(formatDuration(102_400)).toBe('1:42');
    expect(formatDuration(9_000)).toBe('0:09');
  });

  it('logs a keyboard merge as a merge by you and times the run from the first PR opening', () => {
    const { store, s } = setup();
    const t0 = Date.now();
    vi.setSystemTime(t0 + 2000);
    ready(store, META[1]!.id);
    expect(s().firstOpenedAt).toBe(t0 + 2000);
    expect(s().merge(META[1]!.id, 'human', 'keyboard')).toBe(true);
    expect(s().log.at(-1)!.text).toBe(`#${META[1]!.pr} by you (keyboard)`);
    expect(s().manualMerges).toBe(1);
    s().replay();
    expect(s().firstOpenedAt).toBeNull();
  });

  it('puts the loop in the tab title and returns to the normal title when done', () => {
    const { store, s } = setup();
    expect(loopTitle(s())).toBeNull();
    store.getState().advance(META[1]!.id, 'queued', { buildMs: 1600 });
    expect(loopTitle(s())).toBe(`PR #${META[1]!.pr} building — Yoav Zrihan`);
    ready(store, META[2]!.id);
    store.getState().advance(META[1]!.id, 'building');
    expect(loopTitle(s())).toBe(`PR #${META[2]!.pr} waiting on you — Yoav Zrihan`);
    s().skipShow();
    expect(loopTitle(s())).toBeNull();
  });
});
