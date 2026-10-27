import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { changeIntent, projectChips } from '../content/chips';
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

describe('ctl.say with a build open (FIX4 U1)', () => {
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

  it('typed "change it" goes into change mode, never a reply or a new build', async () => {
    const build = vi.spyOn(ctl, 'startBuild').mockResolvedValue(undefined);
    await ctl.say('change it');
    const st = useStore.getState();
    expect(st.barMode).toBe('change');
    expect(build).not.toHaveBeenCalled();
    expect(st.lines.some((l) => l.role === 'agent')).toBe(false);
  });

  it('typed "make it dark" changes the open build', async () => {
    const build = vi.spyOn(ctl, 'startBuild').mockResolvedValue(undefined);
    await ctl.say('make it dark');
    expect(build).toHaveBeenCalledWith('make it dark', expect.objectContaining({ previousHtml: expect.stringContaining('<title>Today</title>') }));
    expect(useStore.getState().lines.some((l) => /don't have an answer/.test(l.text))).toBe(false);
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

describe('a reply that opens a card keeps its own chips until it has been read (FIX4 U3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
  });
  afterEach(() => vi.useRealTimers());

  it('reply chips while the last turn is read, then the card’s', async () => {
    const done = ctl.say('What have you built?');
    for (let i = 0; i < 100 && useStore.getState().overlay !== 'card'; i++) await vi.advanceTimersByTimeAsync(100);
    await done;
    const st = useStore.getState();
    expect(st.overlay).toBe('card');
    expect(st.chips).toContain('Play the game'); // the reply's own row, not swapped as the card opens
    await vi.advanceTimersByTimeAsync(1500);
    expect(useStore.getState().chips).toContain('Play the game');
    await vi.advanceTimersByTimeAsync(8000);
    expect(useStore.getState().chips.slice(0, 2)).toEqual(projectChips(useStore.getState().project!));
  });

  it('"How fast is it?" answers without a card', async () => {
    const done = ctl.say('How fast is it?');
    for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(useStore.getState().overlay).toBe('none');
  });
});
