import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { TURN_READ_MIN } from '../ui/turns';

// The whole path with the current client: a scripted reply paced with `||` becomes one agent
// line per turn, each sized once and shown only after the previous one's read time. (Once the
// client emits its own turn boundary the shell takes that too: `onTurn` → the same pacer.)
describe('ctl.say paces a reply into turns (POLISH2 A1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
  });
  afterEach(() => {
    ctl.setMeasure(null);
    vi.useRealTimers();
  });

  it('one line per turn, never a marker on screen, each sized once before it shows', async () => {
    const measured: string[] = [];
    ctl.setMeasure((t) => (measured.push(t), { px: 52, fits: true }));
    const starts: { at: number; n: number }[] = [];
    const unsub = useStore.subscribe((s, p) => {
      if (s.lines.length > p.lines.length && s.lines.at(-1)?.role === 'agent') starts.push({ at: Date.now(), n: s.lines.length });
    });
    const done = ctl.say('why should we hire him?');
    for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    unsub();

    const agent = useStore.getState().lines.filter((l) => l.role === 'agent');
    expect(agent.length).toBeGreaterThanOrEqual(3);
    for (const l of agent) {
      expect(l.text).not.toContain('||');
      expect(l.size).toBe(52); // the pacer's one fit
      expect(l.full).toBe(l.text); // the whole turn was known before it streamed
    }
    expect(measured).toEqual(agent.map((l) => l.text)); // measured once per turn, in order
    for (let i = 1; i < starts.length; i++) expect(starts[i]!.at - starts[i - 1]!.at).toBeGreaterThanOrEqual(TURN_READ_MIN);
    expect(useStore.getState().streaming).toBe(false);
  });

  it('a new message drops the rest of the old reply', async () => {
    void ctl.say('why should we hire him?');
    await vi.advanceTimersByTimeAsync(1500);
    const done = ctl.say('gm');
    for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
    await done;
    const lines = useStore.getState().lines;
    const gm = lines.findIndex((l) => l.role === 'visitor' && l.text === 'gm');
    // nothing from the first reply lands after the second question
    expect(lines.slice(gm + 1).every((l) => l.role === 'agent')).toBe(true);
    expect(lines.slice(gm + 1).some((l) => /917|adjectives/.test(l.text))).toBe(false);
  });
});
