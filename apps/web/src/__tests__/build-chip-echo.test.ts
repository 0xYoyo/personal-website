import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { WATCH_BUILD_CHIP } from '../content/chips';
import { ctl } from '../controller';
import { useStore } from '../state/store';

// "Another build" and "Watch me build" echo the chip the visitor tapped (not "Build me something"),
// and the build runs exactly as before (WAVE5 QA).
describe('build chips echo their own words', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
  });
  afterEach(() => vi.useRealTimers());

  async function tap(label: string) {
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.chip(label);
    for (let i = 0; i < 80 && useStore.getState().overlay !== 'build'; i++) await vi.advanceTimersByTimeAsync(250);
    const s = useStore.getState();
    return { visitor: s.lines.filter((l) => l.role === 'visitor').map((l) => l.text), overlay: s.overlay, instruction: s.build.instruction };
  }

  for (const label of ['Another build', WATCH_BUILD_CHIP]) {
    it(`"${label}"`, async () => {
      const r = await tap(label);
      expect(r.visitor).toEqual([label]);
      expect(r.overlay).toBe('build');
    });
  }

  it('"Another build" builds what "Build me something" builds', async () => {
    const a = await tap('Another build');
    ctl.closeOverlay();
    const b = await tap('Build me something');
    expect(b.visitor).toEqual(['Build me something']);
    expect(a.instruction).toBeTruthy();
    expect(a.instruction).toBe(b.instruction);
  });
});
