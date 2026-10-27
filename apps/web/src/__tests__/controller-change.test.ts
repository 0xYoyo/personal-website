import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { changeIntent } from '../content/chips';
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
