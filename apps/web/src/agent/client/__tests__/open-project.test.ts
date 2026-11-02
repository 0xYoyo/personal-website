// WAVE5 U3: the card open when the visitor asks is the context ("this", "it", "what did you do on this?").
import { describe, expect, it } from 'vitest';
import { GLYPH_IDS, PROJECT_IDS } from '@yoyo/protocol';
import { createBrain } from '../brain';
import { FAQ_INTENTS } from '../faq';
import { classify, myPartOf, PROJECT_INTRO, SCOPED_INTENTS, strongLocal } from '../intents';
import { routedReply } from '../route';
import { scriptedReply } from '../scripted';
import { ZERO_TIMING } from '../timing';
import { MemStorage, json, mockFetch, recorder } from './helpers';

const reply = (id: string) => FAQ_INTENTS.find((i) => i.id === id)!.reply;
const idOf = (text: string, project: (typeof PROJECT_IDS)[number] | null = null) => {
  const c = classify(text, { project });
  return c.kind === 'intent' ? c.id : c.kind;
};
const ctx = (project: (typeof PROJECT_IDS)[number] | null) => ({ name: null, lastShown: null, random: () => 0, project });

describe('open project (WAVE5 U3)', () => {
  it('every project has an intro and a my_part reply', () => {
    for (const p of PROJECT_IDS) {
      const intro = PROJECT_INTRO[p];
      if (p !== 'vortex') expect(FAQ_INTENTS.some((i) => i.id === intro), p).toBe(true);
      expect(FAQ_INTENTS.some((i) => i.id === myPartOf(p)), p).toBe(true);
    }
  });

  it('"What did you do on this?" answers for the open card, and generically without one', () => {
    for (const p of PROJECT_IDS) {
      expect(idOf('What did you do on this?', p)).toBe(myPartOf(p));
      expect(scriptedReply('What did you do on this?', ctx(p)).raw).toBe(reply(myPartOf(p)));
      expect(idOf('what was your role?', p)).toBe(myPartOf(p));
    }
    expect(idOf('What did you do on this?')).toBe('my_part');
    expect(scriptedReply('What did you do on this?', ctx(null)).raw).toBe(reply('my_part'));
  });

  it('each card chip lands on its own intent with its card open', () => {
    expect(idOf('What was the hardest part?', 'unfiltered')).toBe('unfiltered_hard');
    expect(idOf('How does it teach prompting?', 'prompt-racers')).toBe('racers_teach');
    expect(idOf('What if an agent gets it wrong?', 'yoyo-loop')).toBe('loop_wrong');
    expect(idOf('What can it access?', 'runi-connector')).toBe('connector_access');
  });

  it('a scoped follow-up needs its card open, or the project named', () => {
    expect(idOf('What was the hardest part?')).not.toBe('unfiltered_hard');
    expect(idOf('What was the hardest part?', 'polybot')).not.toBe('unfiltered_hard');
    expect(idOf('what was the hardest part of unfiltered?')).toBe('unfiltered_hard');
    expect(idOf("what's your biggest mistake?")).not.toBe('loop_wrong');
    expect(idOf('what did you learn?')).not.toBe('racers_teach');
    for (const [id, s] of Object.entries(SCOPED_INTENTS)) {
      expect(PROJECT_IDS).toContain(s.project);
      expect(FAQ_INTENTS.some((i) => i.id === id), id).toBe(true);
    }
  });

  it('a specific question beats the open project intro; "tell me about this" is the intro', () => {
    expect(idOf('what was the hardest part of building unfiltered?', 'unfiltered')).toBe('unfiltered_hard');
    expect(idOf('how does the game teach kids?', 'prompt-racers')).toBe('racers_teach');
    expect(idOf('tell me about this', 'polybot')).toBe('polybot');
    expect(idOf('what is this project?', 'yoyo-network')).toBe('network');
    // Vortex has no intro reply: what I did on it
    expect(idOf('tell me about this', 'vortex')).toBe('my_part_vortex');
  });

  it('follow-ups about the open card are answered locally (no router wait)', () => {
    expect(strongLocal('What did you do on this?', { project: 'vortex' })).toBe(true);
    expect(strongLocal('What was the hardest part?', { project: 'unfiltered' })).toBe(true);
    expect(strongLocal('What can it access?', { project: 'runi-connector' })).toBe(true);
  });

  it('a routed my_part, or the open intro for a specific follow-up, plays the open project reply', () => {
    const r = (intent: string) => ({ intent, turns: [], shape: null, chips: [] });
    expect(routedReply(r('my_part'), 'what was your part in it', ctx('polybot'))).toBe(reply('my_part_polybot'));
    expect(routedReply(r('my_part'), 'what was your part in it', ctx(null))).toBe(reply('my_part'));
    expect(routedReply(r('unfiltered'), 'What was the hardest part?', ctx('unfiltered'))).toBe(reply('unfiltered_hard'));
    expect(routedReply(r('unfiltered'), 'tell me about unfiltered', ctx('unfiltered'))).toBe(reply('unfiltered'));
  });

  it('the live request carries the open project; none without a card', async () => {
    const rec = recorder();
    const { fetch, calls } = mockFetch(() => json(200, { type: 'route', intent: 'my_part', turns: [], shape: null, chips: [] }));
    const brain = createBrain({
      agentUrl: 'https://agent.example', swarmGlyphs: GLYPH_IDS, onEvent: rec.onEvent, fetch, storage: new MemStorage(),
      sessionStorage: new MemStorage(), timing: ZERO_TIMING, random: () => 0, device: 'desktop', lang: 'en', firstTokenTimeoutMs: 500,
    });
    await brain.send('so how much of it was yours, honestly', { project: 'vortex' });
    expect((calls[0]!.body as { context?: unknown }).context).toEqual({ project: 'vortex' });
    expect(rec.text()).toContain('I built all three parts');
    await brain.send('so how much of it was yours, honestly');
    expect((calls[1]!.body as { context?: unknown }).context).toBeUndefined();
  });
});

describe('answered chips per card (WAVE5 U3)', () => {
  it('"What did you do on this?" asked on one card is still open on another', async () => {
    const { moveChipsOn, withAnswered } = await import('../../../state/answered');
    const row = ['Next one', 'What did you do on this?', 'Who are you?'];
    const answered = withAnswered([], 'What did you do on this?', 'polybot');
    expect(moveChipsOn(row, answered, { project: 'vortex' })).toEqual(row);
    expect(moveChipsOn(row, answered, { project: 'polybot' })).not.toContain('What did you do on this?');
  });
});
