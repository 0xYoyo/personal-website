import { describe, expect, it } from 'vitest';
import { GLYPH_IDS } from '@yoyo/protocol';
import { ROUTER_INTENT_IDS, ROUTER_SYSTEM_PROMPT } from '../src/prompt.generated';
import { ROUTER_CHIPS, buildRouterSystem, clampRoute, cleanTurn, cutWords, parseRoute, routerUserText } from '../src/router-core.mjs';

const known = { intents: [...ROUTER_INTENT_IDS], glyphs: [...GLYPH_IDS] };

describe('clampRoute (WAVE4 A1: validate and clamp everything server-side)', () => {
  it('a known intent wins: turns are dropped, the client plays the scripted copy', () => {
    expect(clampRoute({ intent: 'hobbies', turns: ['I love football.'], shape: 'heart', chips: [] }, known)).toEqual({
      intent: 'hobbies',
      turns: [],
      shape: 'heart',
      chips: [],
    });
  });

  it('"none" / null / an unknown id play the turns; no usable turns → unknown', () => {
    expect(clampRoute({ intent: 'none', turns: ['Sure.'], shape: 'star', chips: [] }, known).intent).toBeNull();
    expect(clampRoute({ intent: null, turns: ['Sure.'] }, known).intent).toBeNull();
    expect(clampRoute({ intent: 'made_up', turns: ['Sure.'] }, known).intent).toBeNull();
    expect(clampRoute({ intent: 'none', turns: ['  ', '[[contact]]'] }, known)).toMatchObject({ intent: 'unknown', turns: [] });
    expect(clampRoute('not an object', known)).toEqual({ intent: 'unknown', turns: [], shape: null, chips: [] });
  });

  it('turns: at most 2, each ≤ 22 words cut at a sentence end, no em dashes, tags or markdown', () => {
    const long =
      'I build with agents every day. They write the code, I write the spec, and another agent reviews every change before I approve it and ship it.';
    const r = clampRoute({ intent: 'none', turns: [long, 'Two — **three**.', 'four [[show:unfiltered]] five'], shape: '', chips: [] }, known);
    expect(r.turns).toHaveLength(2);
    expect(r.turns[0]).toBe('I build with agents every day.');
    expect(r.turns[1]).toBe('Two, three.');
    for (const t of r.turns) {
      expect(t).not.toMatch(/—|\[\[|\*\*/);
      expect(t.split(/\s+/).length).toBeLessThanOrEqual(22);
    }
  });

  it('a turn with no sentence end inside 22 words is cut at 22 with a period', () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const out = cutWords(words);
    expect(out.split(' ')).toHaveLength(22);
    expect(out.endsWith('w21.')).toBe(true);
  });

  it('cleanTurn: dashes become commas, " -- " too, spacing tidied', () => {
    expect(cleanTurn('Fast — but careful -- always .')).toBe('Fast, but careful, always.');
    expect(cleanTurn('2023–2025 is fine')).toBe('2023–2025 is fine');
  });

  it('shape: a glyph id, one emoji, or one word (≤ 12 chars); unknown glyphs become words', () => {
    const shape = (s: unknown) => clampRoute({ intent: 'none', turns: ['ok.'], shape: s, chips: [] }, known).shape;
    expect(shape('Magnifier')).toBe('magnifier');
    expect(shape('🍕')).toBe('🍕');
    expect(shape('pizza slice')).toBe('pizza');
    expect(shape('supercalifragilistic')).toBe('supercalifra');
    expect(shape('rocket_ship')).toBe('rocket');
    expect(shape('[[x]]')).toBe('x');
    expect(shape('')).toBeNull();
    expect(shape(42)).toBeNull();
  });

  it('chips: only from the site list (case and punctuation forgiven), unique, at most 3', () => {
    const r = clampRoute(
      { intent: 'who', chips: ['what have you built', 'What have you built?', 'Buy my course', 'And crypto?', 'How do I reach you?', 'Spell my name'] },
      known,
    );
    expect(r.chips).toEqual(['What have you built?', 'And crypto?', 'How do I reach you?']);
    for (const c of r.chips) expect(ROUTER_CHIPS).toContain(c);
  });

  it('parseRoute: JSON (fenced or not) → route; anything else → not ok', () => {
    expect(parseRoute('```json\n{"intent":"army","turns":[],"shape":"shield","chips":[]}\n```', known)).toEqual({
      ok: true,
      route: { intent: 'army', turns: [], shape: 'shield', chips: [] },
    });
    expect(parseRoute('{"intent": "ar', known).ok).toBe(false);
    expect(parseRoute('', known).ok).toBe(false);
  });
});

describe('the router prompt', () => {
  it('lists every scripted intent id with a line, the glyphs and the chips; facts included', () => {
    for (const id of ROUTER_INTENT_IDS) expect(ROUTER_SYSTEM_PROMPT).toMatch(new RegExp(`^- ${id}: \\S`, 'm'));
    expect(ROUTER_INTENT_IDS).toEqual(expect.arrayContaining(['who', 'built', 'hire', 'stack', 'hobbies', 'crypto', 'jailbreak']));
    expect(ROUTER_SYSTEM_PROMPT).toContain(GLYPH_IDS.join(', '));
    expect(ROUTER_SYSTEM_PROMPT).toContain('"How do I reach you?"');
    expect(ROUTER_SYSTEM_PROMPT).toContain('## Facts');
  });

  it('an intent without a written description falls back to its hints', () => {
    const sys = buildRouterSystem({ facts: 'F', intents: [{ id: 'brand_new', hints: ['a', 'b'] }], glyphs: ['star'] });
    expect(sys).toContain('- brand_new: a, b');
  });

  it('user text: the last 2 messages before this one, tags and turn marks stripped, then the fenced message', () => {
    const text = routerUserText([
      { role: 'user', content: 'first' },
      { role: 'model', content: 'skip me' },
      { role: 'user', content: 'who?' },
      { role: 'model', content: '[[become:curls]] I am Yoyo. || More. [[chips:a|b]]' },
      { role: 'user', content: 'and crypto?' },
    ]);
    expect(text).toBe('<recent>\nvisitor: who?\nyoyo: I am Yoyo. More.\n</recent>\n<visitor_message>\nand crypto?\n</visitor_message>');
    expect(routerUserText([{ role: 'user', content: 'hi' }])).toBe('<visitor_message>\nhi\n</visitor_message>');
  });
});
