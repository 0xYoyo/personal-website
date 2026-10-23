import { describe, expect, it } from 'vitest';
import { FAQ_INTENTS, FAQ_UNKNOWN } from '../faq';
import { GLYPH_IDS } from '@yoyo/protocol';
import { createTagStream, extractActions, leadingEmoji, isEmojiOnly, shapeFromArg } from '../tags';

const opts = { glyphs: GLYPH_IDS };

function streamAll(pieces: string[]) {
  const s = createTagStream(opts);
  let text = '';
  const actions: unknown[] = [];
  const firstActionAtText: number[] = [];
  for (const p of pieces) {
    const r = s.push(p);
    for (const a of r.actions) {
      actions.push(a);
      firstActionAtText.push(text.length);
    }
    text += r.text;
  }
  const r = s.end();
  text += r.text;
  actions.push(...r.actions);
  return { text, actions };
}

const ALL_REPLIES = [...FAQ_INTENTS.map((i) => i.reply), FAQ_UNKNOWN,
  "[[become:curls]] Yoav Zrihan. Self-taught, building since 2022. [[chips:What has he built?|Tell me a story|What's he bad at?|How do I reach him?]]",
  'hey [[mood:excited]] there [[become:🚀]].',
];

describe('tag stream', () => {
  it('produces the same text and actions no matter where tokens split (every split point)', () => {
    for (const raw of ALL_REPLIES) {
      const whole = extractActions(raw, opts);
      for (let i = 1; i < raw.length; i++) {
        const r = streamAll([raw.slice(0, i), raw.slice(i)]);
        expect(r.text, `split at ${i} of ${raw}`).toBe(whole.text);
        expect(r.actions).toEqual(whole.actions);
      }
      // and one character at a time
      expect(streamAll([...raw])).toEqual({ text: whole.text, actions: whole.actions });
      // and in 4-char "model tokens"
      expect(streamAll(raw.match(/[\s\S]{1,4}/g) ?? [])).toEqual({ text: whole.text, actions: whole.actions });
    }
  });

  it('never shows tag text, even partially', () => {
    for (const raw of ALL_REPLIES) {
      const s = createTagStream(opts);
      let shown = '';
      for (const ch of raw) {
        shown += s.push(ch).text;
        expect(shown).not.toMatch(/\[\[|\]\]|become:|chips:|show:/);
      }
    }
  });

  it('emits an action as soon as its closing ]] arrives', () => {
    const s = createTagStream(opts);
    expect(s.push('[[beco').actions).toEqual([]);
    expect(s.push('me:kart]').actions).toEqual([]);
    expect(s.push('] Seven').actions).toEqual([{ type: 'become', shape: { kind: 'glyph', id: 'kart' } }]);
  });

  it('strips tags and normalises the space they leave behind', () => {
    expect(extractActions('[[become:Dana]] done. [[chips:Now a rocket|Build me something|Who is Yoyo?]]', opts)).toEqual({
      text: 'done.',
      actions: [
        { type: 'become', shape: { kind: 'text', text: 'Dana' } },
        { type: 'chips', chips: ['Now a rocket', 'Build me something', 'Who is Yoyo?'] },
      ],
    });
    expect(extractActions('obviously [[mood:excited]].', opts).text).toBe('obviously.');
    expect(extractActions('a [[tour]] b', opts).text).toBe('a b');
    expect(extractActions('  [[play]]  ', opts)).toEqual({ text: '', actions: [{ type: 'play' }] });
  });

  it('drops unknown or invalid tags but still strips them', () => {
    expect(extractActions('hi [[explode:now]] [[show:not-a-project]] [[mood:angry]] there', opts)).toEqual({ text: 'hi there', actions: [] });
  });

  it('keeps single brackets and drops an unterminated tag at the end', () => {
    expect(extractActions('array[0] is fine', opts).text).toBe('array[0] is fine');
    expect(extractActions('cut off [[chips:a|b', opts)).toEqual({ text: 'cut off', actions: [] });
    expect(extractActions('ends with [', opts).text).toBe('ends with [');
  });

  it('treats a [[ with no ]] for a long stretch as text', () => {
    const raw = `see [[ ${'x'.repeat(400)} done`;
    expect(extractActions(raw, opts).text).toBe(raw);
  });

  it('parses every action type from the protocol', () => {
    const raw = '[[become:🚀]][[mood:thinking]][[show:polybot]][[play]][[story:2021]][[story:next]][[tour]][[build:a timer]][[contact]][[lights:light]][[lights:toggle]][[chips:a|b]]';
    expect(extractActions(raw, opts).actions).toEqual([
      { type: 'become', shape: { kind: 'emoji', emoji: '🚀' } },
      { type: 'mood', mood: 'thinking' },
      { type: 'show', project: 'polybot' },
      { type: 'play' },
      { type: 'story', id: '2021' },
      { type: 'story', id: 'next' },
      { type: 'tour' },
      { type: 'build', instruction: 'a timer' },
      { type: 'contact' },
      { type: 'lights', mode: 'light' },
      { type: 'lights', mode: 'toggle' },
      { type: 'chips', chips: ['a', 'b'] },
    ]);
  });
});

describe('become → shape', () => {
  it('maps glyph ids, yoyo, emoji and text', () => {
    expect(shapeFromArg('kart', opts)).toEqual({ kind: 'glyph', id: 'kart' });
    expect(shapeFromArg('envelope-open', opts)).toEqual({ kind: 'glyph', id: 'envelope-open' });
    expect(shapeFromArg('yoyo', opts)).toEqual({ kind: 'yoyo3d' });
    expect(shapeFromArg('👋', opts)).toEqual({ kind: 'emoji', emoji: '👋' });
    expect(shapeFromArg('👩🏽‍💻', opts)).toEqual({ kind: 'emoji', emoji: '👩🏽‍💻' });
    expect(shapeFromArg('🇮🇱', opts)).toEqual({ kind: 'emoji', emoji: '🇮🇱' });
    expect(shapeFromArg('Dana', opts)).toEqual({ kind: 'text', text: 'Dana' });
    expect(shapeFromArg('Star', opts)).toEqual({ kind: 'text', text: 'Star' }); // capitalised → a name, not the glyph
    expect(shapeFromArg('Bartholomew the Great', opts)).toEqual({ kind: 'text', text: 'Bartholomew' });
    expect(shapeFromArg('none', opts)).toEqual({ kind: 'none' });
  });

  it('only uses glyphs the swarm says it has', () => {
    expect(shapeFromArg('piano', { glyphs: ['kart'] })).toEqual({ kind: 'text', text: 'piano' });
  });

  it('detects emoji', () => {
    expect(isEmojiOnly('🚀')).toBe(true);
    expect(isEmojiOnly('🚀🔥')).toBe(true);
    expect(isEmojiOnly('1')).toBe(false);
    expect(isEmojiOnly('hi 🚀')).toBe(false);
    expect(leadingEmoji('🚀 go')).toBe('🚀');
    expect(leadingEmoji('🚀🚀')).toBe('🚀');
    expect(leadingEmoji('go 🚀')).toBeNull();
  });
});
