import { describe, expect, it } from 'vitest';
import { classify } from '../agent/classify';

const intent = (t: string, ctx = {}) => classify(t, { pick: () => 0, ...ctx }).intent;

describe('stub classifier (faq.md intents)', () => {
  it.each([
    ['Who is Yoyo?', 'who'],
    ['What has he built?', 'built'],
    ['Why should we hire him?', 'hire'],
    ['Tell me a story', 'story'],
    ['Play his game', 'game'],
    ['How do I reach him?', 'contact'],
    ['help', 'help'],
    ['?', 'help'],
    ['Build me something', 'build'],
    ['Who made this agent?', 'this_site'],
    ["What's he bad at?", 'weakness'],
    ['Tell me about Polybot', 'polybot'],
    ['how fast is it', 'fast'],
    ['gm', 'gm'],
    ['lights', 'lights'],
    ['what is the meaning of life on mars exactly', 'story'],
    ['qwerty uiop asdf ghjk', 'unknown'],
  ])('%s → %s', (text, id) => {
    expect(intent(text)).toBe(id);
  });

  it('stores a name and becomes it', () => {
    const c = classify("I'm dana");
    expect(c.name).toBe('Dana');
    expect(c.raw).toBe('nice to meet you, Dana. [[become:Dana]]');
    expect(classify("I'm looking for a developer").intent).not.toBe('name');
  });
  it('handles emoji and spell', () => {
    expect(classify('🚀', { pick: () => 0 }).raw).toBe('[[become:🚀]] obviously.');
    expect(classify('spell dana').raw).toBe('[[become:dana]] done.');
    expect(classify('show me around').intent).toBe('tour');
  });
  it('asks for a name, then takes the next word as one', () => {
    const ask = classify('Spell my name');
    expect(ask.expectName).toBe(true);
    expect(classify('noa', { expectingName: true }).name).toBe('Noa');
    expect(classify('Spell my name', { name: 'Noa' }).raw).toBe('[[become:Noa]] done.');
  });
  it('picks the right story by keyword', () => {
    expect(classify('Tell me the road story').raw).toBe('[[story:road]]');
    expect(classify('Tell me the 2021 story').raw).toBe('[[story:2021]]');
    expect(classify('Tell me the last story').raw).toBe('[[story:this]]');
  });
  it('becomes a single unknown word', () => {
    expect(classify('pizza', { pick: () => 4 }).raw).toBe('[[become:pizza]] done.');
  });
});
