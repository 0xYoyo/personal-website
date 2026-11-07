import { describe, expect, it } from 'vitest';
import { GLYPH_IDS } from '@yoyo/protocol';
import { scriptedReply } from '../scripted';
import { extractActions } from '../tags';
import { projectById } from '../../../content/projects';
import { SCENE6_LINES, SHOW_CAPTIONS, SHOW_LINES } from '../../../content/show';

// WAVE6 C1–C4: the copy, verbatim.
const ctx = { name: null, lastShown: null, random: () => 0 };
const reply = (q: string) => {
  const raw = scriptedReply(q, ctx).raw;
  const { text, actions } = extractActions(raw, { glyphs: GLYPH_IDS });
  return { raw, turns: text.split('||').map((t) => t.replace(/\s+/g, ' ').trim()), actions };
};
const becomes = (a: ReturnType<typeof reply>['actions']) => a.flatMap((x) => (x.type === 'become' ? [x.shape] : []));

describe('wave 6 copy', () => {
  it('C1: the hire reply has four beats, the keyboard on the third, and its own chips', () => {
    const r = reply('Why should we hire you?');
    expect(r.turns).toEqual([
      'I ship real products: a search engine, a 3D game, a tool my whole university can use.',
      'I like being early. I was building with AI agents when most people called it a toy.',
      'Self-taught, full-stack. I built complete applications by hand before I started working with agents.',
      "And I'll tell you what didn't work. Ask me about Polybot.",
    ]);
    expect(becomes(r.actions)).toEqual(['check', 'loop', 'keyboard', 'diverge'].map((id) => ({ kind: 'glyph', id })));
    expect(r.actions.filter((a) => a.type === 'chips')).toEqual([{ type: 'chips', chips: ['Show my hand-written work', 'Tell me about Polybot', 'How do I reach you?'] }]);
  });

  it('C2: who says "Self-taught developer", the show "Self-taught dev since 2022."', () => {
    expect(reply('Who are you?').turns[1]).toBe('Computer Science and Entrepreneurship at Reichman. Self-taught developer before that.');
    expect(SCENE6_LINES[1]).toBe('Self-taught dev since 2022.');
    expect(SHOW_LINES[5]).toBe('Crypto since 2021. Self-taught dev since 2022. Reichman since 2025.');
    expect(SHOW_CAPTIONS.join(' ')).not.toMatch(/Self-taught (since|before)/);
  });

  it('C3: the Prompt Racers card facts', () => {
    expect(projectById('prompt-racers').cardFacts).toEqual([
      'Kids build better kart parts by writing better prompts, then race with what they built.',
      'A full game: seven AI rivals, upgrades and races that get harder.',
      'Made for an AI-education contest for Israeli schools.',
    ]);
  });

  it('C4: hobbies keeps its words and morphs into monochrome glyph compositions, no emoji', () => {
    const r = reply('What do you do for fun?');
    expect(r.turns).toEqual(['Festivals, travel, video games.', 'Lifting, running on the beach. Sometimes coding, just for fun.']);
    expect(becomes(r.actions)).toEqual([{ kind: 'glyph', id: 'weekend' }, { kind: 'glyph', id: 'workout' }]);
    expect(r.raw).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
