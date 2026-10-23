import { beforeEach, describe, expect, it } from 'vitest';
import type { Action } from '@yoyo/protocol';
import { BrainError, createBrain, createWordSplitter } from '../agent';

// The shell's Brain over the real client, in scripted mode (no agent URL), with timings × 0.001.
describe('brain adapter (scripted)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('streams whole words and actions, resolves with the reply', async () => {
    const brain = createBrain({ speed: 0.001 });
    const words: string[] = [];
    const actions: Action[] = [];
    const r = await brain.send('who is yoyo?', { onWord: (w) => words.push(w), onAction: (a) => actions.push(a) });
    expect(r.source).toBe('scripted');
    expect(words[0]).toBe('Yoav');
    expect(r.text).toBe(words.join(' '));
    expect(r.text).not.toContain('[[');
    expect(actions[0]).toEqual({ type: 'become', shape: { kind: 'glyph', id: 'curls' } });
    expect(actions.at(-1)?.type).toBe('chips');
  });

  it('remembers a name through the client memory', async () => {
    const brain = createBrain({ speed: 0.001 });
    await brain.send("I'm Dana");
    expect(localStorage.getItem('yoyo.v3.name')).toBe('Dana');
    expect(brain.memory.name()).toBe('Dana');
  });

  it('answers the easter eggs', async () => {
    const brain = createBrain({ speed: 0.001 });
    const actions: Action[] = [];
    const r = await brain.send('fortnite', { onAction: (a) => actions.push(a) });
    expect(r.text).toBe('he could build a ramp before you could aim.');
    expect(actions).toEqual([{ type: 'become', shape: { kind: 'glyph', id: 'ramp' } }]);
    expect((await brain.send('cs2')).text).toBe("rush B. don't stop.");
    expect((await brain.send('piano')).text).toBe("he wants to learn. hasn't yet. ask him in a year.");
  });

  it('streams an example build, reports progress, records it, and caps at 5/hour', async () => {
    const brain = createBrain({ speed: 0.0005 });
    let last = 0;
    let expected: number | undefined;
    const res = await brain.build('a pomodoro timer', { onChunk: (_c, bytes, exp) => ((last = bytes), (expected = exp)) });
    expect(res.source).toBe('example');
    expect(res.html.startsWith('<!doctype html>')).toBe(true);
    expect(last).toBe(res.bytes);
    expect(expected).toBe(res.bytes);
    expect(res.title).toBe('Pomodoro');
    expect(brain.memory.builds()[0]?.title).toBe('Pomodoro timer');
    expect(brain.memory.recentBuilds()).toHaveLength(1);
    for (let i = 0; i < 4; i++) await brain.build('a timer');
    await expect(brain.build('again')).rejects.toMatchObject({ reason: 'cap' });
  });

  it('aborts a reply without killing a build in flight', async () => {
    const brain = createBrain({ speed: 0.05 });
    const b = brain.build('a todo list');
    const ac = new AbortController();
    const p = brain.send('who is yoyo?', {}, ac.signal);
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(BrainError);
    await expect(b).resolves.toMatchObject({ source: 'example' });
  });

  it('aborts a build', async () => {
    const brain = createBrain({ speed: 1 });
    const ac = new AbortController();
    const p = brain.build('a todo list', {}, { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toMatchObject({ reason: 'aborted' });
  });

  it('counts visits once per session', () => {
    expect(createBrain().memory.recordVisit()).toBe(0);
    sessionStorage.clear();
    expect(createBrain().memory.recordVisit()).toBe(1);
  });
});

describe('word splitter', () => {
  it('joins pieces split mid-word', () => {
    const words: string[] = [];
    const s = createWordSplitter((w) => words.push(w));
    ['Yo', 'av Zri', 'han. ', ' Self', '-taught'].forEach((t) => s.push(t));
    s.flush();
    expect(words).toEqual(['Yoav', 'Zrihan.', 'Self-taught']);
    expect(s.text()).toBe('Yoav Zrihan. Self-taught');
  });
});
