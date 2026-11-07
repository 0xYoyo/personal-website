import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { MY_PART_CHIP, projectChips } from '../content/chips';
import { ctl } from '../controller';
import { useStore } from '../state/store';

// A typed question counts exactly as tapping its chip does (WAVE5 QA): by the intent the reply played, so words
// only the router understands count too. On a project's row nothing is retired (WAVE6 X1): the row stays whole.
const flush = async () => {
  for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(4000);
};

describe('a typed question counts as its chip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function rowAfter(how: 'tap' | 'type', text: string, brain = createBrain({ speed: 0.001 })) {
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain, swarm: null, sound: null, voice: null });
    ctl.openProject('polybot');
    expect(useStore.getState().chips).toContain(MY_PART_CHIP);
    const done = how === 'tap' ? (ctl.chip(text), Promise.resolve()) : ctl.say(text);
    await flush();
    await done;
    return useStore.getState().chips;
  }

  it('typed "what did you do on this?" over a card leaves the same row as tapping the chip', async () => {
    const tapped = await rowAfter('tap', MY_PART_CHIP);
    const typed = await rowAfter('type', 'what did you do on this?');
    expect(tapped).toContain(MY_PART_CHIP);
    expect(typed).toEqual(tapped);
  });

  it('words the router resolves to the chip’s intent retire it too', async () => {
    // the local classifier reads this as "built"; the router knows it is the card's "my part"
    const words = 'what did you work on in this one';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ type: 'route', intent: 'my_part', turns: [], shape: null, chips: [] }), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    const row = await rowAfter('type', words, createBrain({ speed: 0.001, agentUrl: 'https://agent.example' }));
    expect(useStore.getState().answered).toContain('i:my_part_polybot');
    expect(row).toContain(MY_PART_CHIP);
    expect(row).toEqual(await rowAfter('tap', MY_PART_CHIP));
    expect(projectChips('polybot')).toContain(MY_PART_CHIP);
  });
});
