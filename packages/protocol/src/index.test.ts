import { describe, expect, it } from 'vitest';
import { extractActions, isAction, isEmojiOnly, isShapeSpec, leadingEmoji, parseActionTag, shapeFromArg } from './index';

describe('parseActionTag', () => {
  it('parses every allowlisted tag', () => {
    expect(parseActionTag('become:Dana')).toEqual({ type: 'become', shape: { kind: 'text', text: 'Dana' } });
    expect(parseActionTag('become:kart')).toEqual({ type: 'become', shape: { kind: 'glyph', id: 'kart' } });
    expect(parseActionTag('become:🚀')).toEqual({ type: 'become', shape: { kind: 'emoji', emoji: '🚀' } });
    expect(parseActionTag('become:yoyo')).toEqual({ type: 'become', shape: { kind: 'yoyo3d' } });
    expect(parseActionTag('mood:excited')).toEqual({ type: 'mood', mood: 'excited' });
    expect(parseActionTag('show:pnl-bot')).toEqual({ type: 'show', project: 'pnl-bot' });
    expect(parseActionTag('play')).toEqual({ type: 'play' });
    expect(parseActionTag('story:next')).toEqual({ type: 'story', id: 'next' });
    expect(parseActionTag('story:factory')).toEqual({ type: 'story', id: 'factory' });
    expect(parseActionTag('story:2021')).toBeNull();
    expect(parseActionTag('tour')).toEqual({ type: 'tour' });
    expect(parseActionTag('build:a pomodoro timer')).toEqual({ type: 'build', instruction: 'a pomodoro timer' });
    expect(parseActionTag('contact')).toEqual({ type: 'contact' });
    expect(parseActionTag('mirror')).toBeNull();
    expect(parseActionTag('lights:toggle')).toEqual({ type: 'lights', mode: 'toggle' });
    expect(parseActionTag('chips:a|b| c |')).toEqual({ type: 'chips', chips: ['a', 'b', 'c'] });
    expect(parseActionTag('work:hand')).toEqual({ type: 'work', era: 'hand' });
    expect(parseActionTag('work')).toEqual({ type: 'work', era: 'ai' });
    expect(parseActionTag('work:old')).toBeNull();
    expect(parseActionTag('show:sentiment-gauge')).toEqual({ type: 'show', project: 'sentiment-gauge' });
  });
  it('rejects unknown or malformed tags', () => {
    expect(parseActionTag('show:orditax')).toBeNull();
    expect(parseActionTag('show:vortex')).toEqual({ type: 'show', project: 'vortex' });
    expect(parseActionTag('mood:angry')).toBeNull();
    expect(parseActionTag('exec:rm -rf')).toBeNull();
    expect(parseActionTag('become:')).toBeNull();
    expect(parseActionTag('story:nope')).toBeNull();
  });
  it('truncates long become text to 12 characters', () => {
    const a = parseActionTag('become:abcdefghijklmnopq');
    expect(a).toEqual({ type: 'become', shape: { kind: 'text', text: 'abcdefghijkl' } });
  });
});

describe('extractActions', () => {
  it('strips tags and tidies spacing', () => {
    const r = extractActions('[[become:kart]] Seven things. [[show:prompt-racers]] [[chips:Next one|Play it]]');
    expect(r.text).toBe('Seven things.');
    expect(r.actions.map((a) => a.type)).toEqual(['become', 'show', 'chips']);
  });
});

describe('guards and emoji', () => {
  it('validates shapes and actions', () => {
    expect(isShapeSpec({ kind: 'frame', rect: { x: 0, y: 0, w: 10, h: 10 } })).toBe(true);
    expect(isShapeSpec({ kind: 'glyph', id: 'nope' })).toBe(false);
    expect(isAction({ type: 'show', project: 'polybot' })).toBe(true);
    expect(isAction({ type: 'show', project: 'x' })).toBe(false);
  });
  it('detects emoji', () => {
    expect(isEmojiOnly('🚀')).toBe(true);
    expect(isEmojiOnly('👩‍💻')).toBe(true);
    expect(isEmojiOnly('hi 🚀')).toBe(false);
    expect(leadingEmoji('🚀 go')).toBe('🚀');
    expect(shapeFromArg('none')).toEqual({ kind: 'none' });
  });
});
