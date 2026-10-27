// The show and the visitor (FIX4 W1, W2, W8, W10): a keystroke never stops the show; sending a message or a
// chip stops it, the scene stays (no release) and the reply morphs from it; the greeting never comes back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { copy } from '../content/copy';
import { SHOW_LINES } from '../content/show';
import { ctl } from '../controller';
import { useStore, visibleExchange } from '../state/store';
import { markShowSeen, showSeen } from '../state/visit';
import { runnerKey } from '../ui/runner/keys';
import { toWords } from '../ui/fit';
import { wordsOf } from '../ui/turns';
import type { SwarmHandle } from '../swarm';

const S = () => useStore.getState();

function stubSwarm() {
  const calls: string[] = [];
  const sw = new Proxy({} as Record<string, unknown>, {
    get(_t, k: string) {
      if (k === 'then') return undefined;
      if (k === 'stageBox') return () => ({ x: 0, y: 0, w: 486, h: 620 });
      if (k === 'perform') return () => (calls.push('perform'), Promise.resolve(true));
      return (...a: unknown[]) => void calls.push(a.length && typeof a[0] === 'string' ? `${k}:${a[0]}` : k);
    },
  });
  return { sw: sw as unknown as SwarmHandle, calls };
}

describe('runnerKey: a keystroke only types (FIX4 W1)', () => {
  const o = { typing: false, stepMode: false, onButton: false, tour: true };
  it('in the bar every key is the bar’s: letters, Backspace, ←/→, Enter', () => {
    for (const key of ['w', 'h', 'o', ' ', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Enter', 'Shift']) expect(runnerKey({ key }, { ...o, typing: true })).toBe('none');
  });
  it('elsewhere a letter goes to the bar; ←/→ step; nothing ever stops the show', () => {
    expect(runnerKey({ key: 'w' }, o)).toBe('focus-bar');
    expect(runnerKey({ key: 'c', metaKey: true }, o)).toBe('none');
    expect(runnerKey({ key: ' ' }, o)).toBe('none');
    expect(runnerKey({ key: 'ArrowRight' }, o)).toBe('next');
    expect(runnerKey({ key: 'ArrowLeft' }, o)).toBe('prev');
    expect(runnerKey({ key: 'Enter' }, o)).toBe('none');
    expect(runnerKey({ key: 'Enter' }, { ...o, stepMode: true })).toBe('next');
    expect(runnerKey({ key: 'Enter' }, { ...o, stepMode: true, onButton: true })).toBe('none');
  });
});

describe('the show stopped by a message or a chip (FIX4 W1, W2)', () => {
  let calls: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    S().reset();
    S().setPhase('ready');
    const st = stubSwarm();
    calls = st.calls;
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: st.sw, sound: null, voice: null });
    S().agentLine(copy.entry.greeting);
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.useRealTimers();
  });

  const toScene = async (k: number) => {
    ctl.startTour();
    for (let i = 0; i < 400 && S().runner?.say !== SHOW_LINES[k]; i++) await vi.advanceTimersByTimeAsync(100);
    expect(S().runner?.say).toBe(SHOW_LINES[k]);
  };

  for (const via of ['message', 'chip'] as const) {
    it(`${via}: the show stops, the scene is not released, nothing shows until the reply's first word, the greeting never returns`, async () => {
      await toScene(3);
      calls.length = 0;
      const seen: string[] = [];
      const unsub = useStore.subscribe((s) => {
        if (s.runner) return; // (the first changes come before the show has stopped)
        const v = visibleExchange(s.lines);
        const shown = v.agent?.text ?? '';
        if (seen.at(-1) !== shown) seen.push(shown);
        if (v.prevAgent) seen.push(`prev:${v.prevAgent.text}`);
      });
      const done = via === 'message' ? ctl.say('who are you') : (ctl.chip('Who are you?'), Promise.resolve());
      // stopped at once, the body kept (the reply morphs from the scene)
      expect(ctl.runnerActive()).toBe(false);
      expect(calls.filter((c) => c === 'release')).toEqual([]);
      // the waiting moment: the caption area is empty (only the visitor's echo)
      const w = visibleExchange(S().lines);
      expect(w.agent).toBeUndefined();
      expect(w.prevAgent).toBeUndefined();
      expect(w.visitor?.text).toMatch(/who are you/i);
      for (let i = 0; i < 200 && (ctl.pacing() || S().streaming); i++) await vi.advanceTimersByTimeAsync(250);
      await done;
      unsub();
      const v = visibleExchange(S().lines);
      expect(S().lines.some((l) => l.role === 'agent' && /I'm Yoyo\. I build/.test(l.text))).toBe(true);
      // the interrupted caption and the greeting are never shown again (not even muted beneath the reply's first turn)
      // (seen[0]: the caption rests in place for the same synchronous tick, before the message lands — never painted)
      expect(seen[0]).toBe(SHOW_LINES[3]);
      expect(seen[1]).toBe('');
      expect(seen.slice(1).some((t) => t.includes('hey.') || t.includes(SHOW_LINES[3]!)), JSON.stringify(seen)).toBe(false);
      expect(v.prevAgent?.text ?? '').not.toContain('hey.');
      expect(S().lines.filter((l) => l.text === copy.entry.greeting)).toHaveLength(1);
    });
  }

  it('Skip: the show jumps to its end line, resting alone (no greeting, no muted line beneath)', async () => {
    await toScene(2);
    ctl.runnerSkip();
    const v = visibleExchange(S().lines);
    expect(v.agent?.text).toBe('Ask me anything.');
    expect(v.agent?.quiet).toBe(true);
    expect(v.prevAgent).toBeUndefined();
  });

  it('run to its end: "Ask me anything." rests alone (FIX4 W8)', async () => {
    ctl.startTour();
    for (let i = 0; i < 500 && ctl.runnerActive(); i++) await vi.advanceTimersByTimeAsync(100);
    const v = visibleExchange(S().lines);
    expect(v.agent?.text).toBe('Ask me anything.');
    expect(v.prevAgent).toBeUndefined();
  });

  it('the show is remembered for the tab’s session once it starts (FIX4 W10)', () => {
    expect(showSeen()).toBe(false);
    ctl.startTour();
    expect(showSeen()).toBe(true);
  });
});

describe('showSeen (FIX4 W10)', () => {
  it('reads and writes sessionStorage, and survives blocked storage', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(showSeen(s)).toBe(false);
    markShowSeen(s);
    expect(showSeen(s)).toBe(true);
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(showSeen(bad)).toBe(false);
    expect(() => markShowSeen(bad)).not.toThrow();
  });
});

describe('the greeting has no widow (FIX4 W9)', () => {
  it('its last two words stay together on any line break', () => {
    expect(copy.entry.greeting.endsWith('become it.')).toBe(true);
    expect(toWords(copy.entry.greeting).at(-1)).toEqual({ text: 'become it.', nowrap: true });
    expect(wordsOf(copy.entry.greeting).at(-1)).toBe('become it.');
  });
});
