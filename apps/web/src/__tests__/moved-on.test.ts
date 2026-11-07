import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { MY_PART_CHIP } from '../content/chips';
import { ctl } from '../controller';
import { useStore } from '../state/store';

// A card opened while a reply is still being said ("Next one", → , Work) keeps its own chips: the reply's
// end-of-reply row is the previous card's and must not replace it (WAVE5 QA).
const flush = async () => {
  for (let i = 0; i < 200 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(4000);
};

describe("a reply's end row never replaces a card opened while it was said", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
  });
  afterEach(() => vi.useRealTimers());

  async function midReply() {
    ctl.openProject('polybot');
    ctl.chip(MY_PART_CHIP);
    // the reply is on screen and still pacing (its last turn not yet read)
    for (let i = 0; i < 40 && !useStore.getState().lines.some((l) => l.role === 'agent' && l.text); i++) await vi.advanceTimersByTimeAsync(50);
    expect(ctl.pacing()).toBe(true);
  }

  for (const [name, move] of [
    ['Next one', () => ctl.chip('Next one')],
    ['→', () => ctl.nextProject(1)],
  ] as const) {
    it(`${name} pressed mid-reply: the new card keeps its row`, async () => {
      await midReply();
      move();
      const s = useStore.getState();
      expect(s.overlay).toBe('card');
      const next = s.project!;
      expect(next).not.toBe('polybot');
      const row = s.chips;
      await flush();
      const after = useStore.getState();
      expect(after.overlay).toBe('card');
      expect(after.project).toBe(next);
      expect(after.chips).toEqual(row);
      // and "Next one" from that row is still about the card on screen
      ctl.chip('Next one');
      expect(useStore.getState().project).not.toBe(next);
    });
  }

  it("a reply's own chips arriving after a card opened don't replace its row either", async () => {
    // a brain at full speed: the tag streams in while the first turn is on screen
    ctl.init({ brain: createBrain({ speed: 1 }), swarm: null, sound: null, voice: null });
    let tagged = false;
    const unsub = useStore.subscribe((s, p) => {
      if (s.chips.includes('Tell me about Polybot') && !p.chips.includes('Tell me about Polybot')) tagged = true;
    });
    void ctl.say('why should we hire you?'); // its reply ends with a chips tag
    for (let i = 0; i < 40 && !useStore.getState().lines.some((l) => l.role === 'agent' && l.text); i++) await vi.advanceTimersByTimeAsync(50);
    expect(tagged).toBe(false);
    ctl.nextProject(1);
    const row = useStore.getState().chips;
    for (let i = 0; i < 400 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
    await flush();
    unsub();
    expect(useStore.getState().overlay).toBe('card');
    expect(useStore.getState().chips).toEqual(row);
    expect(tagged).toBe(false);
  });

  it('no card opened meanwhile: the follow-up row comes back, the whole project row with the way back (WAVE6 X1/X2)', async () => {
    await midReply();
    await flush();
    const s = useStore.getState();
    expect(s.overlay).toBe('none');
    expect(s.chips[0]).toBe('Next one');
    expect(s.chips).toEqual(['Next one', MY_PART_CHIP, 'Who are you?', 'Back to Polybot']);
  });
});
