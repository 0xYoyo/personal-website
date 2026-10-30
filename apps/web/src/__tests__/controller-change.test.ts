import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { changeIntent, projectChips } from '../content/chips';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';

describe('changeIntent (FIX4 U1)', () => {
  it('only with a build open', () => {
    expect(changeIntent('make it dark', false)).toBeNull();
    expect(changeIntent('change it', false)).toBeNull();
  });
  it('a bare "change it" opens change mode; an edit that says what is applied', () => {
    for (const t of ['change it', 'Change it.', 'change', 'change this']) expect(changeIntent(t, true)).toBe('begin');
    for (const t of ['make it dark', 'Make it blue!', 'turn it red', 'add a reset button', 'remove the footer', 'use a serif font', 'switch to dark', 'color the header', 'colour it green', 'dark mode', 'lighter please', 'change the title'])
      expect(changeIntent(t, true), t).toBe(t === 'lighter please' ? null : 'apply');
  });
  it('anything else is still a question', () => {
    for (const t of ['who are you?', 'build me a todo app', 'how was this made?', 'makes sense', 'user research']) expect(changeIntent(t, true), t).toBeNull();
  });
});

describe('ctl.say with a build open (FIX4 U1, WAVE4 U7)', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
    const st = useStore.getState();
    st.patchBuild({ status: 'locked', html: '<!doctype html><title>Today</title><p>hi</p>', bytes: 40, progress: 1, title: 'Today', instruction: 'build me a todo app' });
    st.openOverlay('build');
  });
  afterEach(() => vi.restoreAllMocks());

  it('a typed change ("change it", "make it dark") gets the scripted line: no change mode, no new build', async () => {
    for (const t of ['change it', 'make it dark']) {
      const build = vi.spyOn(ctl, 'startBuild').mockResolvedValue(undefined);
      await ctl.say(t);
      const st = useStore.getState();
      expect(st.barMode).toBe('chat');
      expect(build).not.toHaveBeenCalled();
      expect(st.overlay).toBe('build');
      expect([...st.lines].reverse().find((l) => l.role === 'agent')?.text).toBe(copy.build.noChanges);
      expect(st.lines.some((l) => /don't have an answer/.test(l.text))).toBe(false);
      build.mockRestore();
    }
  });

  it('with no build open it is an ordinary message', async () => {
    useStore.getState().closeOverlay();
    const build = vi.spyOn(ctl, 'startBuild').mockResolvedValue(undefined);
    const say = ctl.say('change it');
    await say;
    expect(useStore.getState().barMode).toBe('chat');
    expect(useStore.getState().lines.some((l) => l.role === 'visitor' && l.text === 'change it')).toBe(true);
    expect(build).not.toHaveBeenCalledWith('change it', expect.objectContaining({ previousHtml: expect.anything() }));
  });
});

describe('a reply that opens a card: the card waits until its last turn has been read (WAVE4 U2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
  });
  afterEach(() => vi.useRealTimers());

  it('the overlay opens only after the last turn’s full read time; then the card’s chips', async () => {
    const done = ctl.say('What have you built?');
    // the reply's last turn is on screen once pacing has nothing left but the hold
    let lastShownAt = -1;
    let openedAt = -1;
    for (let t = 0; t < 30_000 && openedAt < 0; t += 50) {
      const st = useStore.getState();
      if (lastShownAt < 0 && !st.streaming && st.lines.some((l) => l.role === 'agent')) lastShownAt = t;
      if (st.overlay === 'card') openedAt = t;
      await vi.advanceTimersByTimeAsync(50);
    }
    await done;
    expect(openedAt).toBeGreaterThan(0);
    expect(openedAt - lastShownAt).toBeGreaterThanOrEqual(3500); // ≥ the 3.6 s floor (50 ms steps)
    expect(useStore.getState().chips.slice(0, 2)).toEqual(projectChips(useStore.getState().project!));
  });

  it('a tap during that hold opens it at once', async () => {
    const done = ctl.say('What have you built?');
    for (let i = 0; i < 400 && !(ctl.pacing() && !useStore.getState().streaming); i++) await vi.advanceTimersByTimeAsync(25);
    expect(useStore.getState().overlay).toBe('none');
    ctl.advance();
    await vi.advanceTimersByTimeAsync(10);
    await done;
    expect(useStore.getState().overlay).toBe('card');
  });

  it('"How fast is it?" answers without a card', async () => {
    const done = ctl.say('How fast is it?');
    for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(useStore.getState().overlay).toBe('none');
  });
});
