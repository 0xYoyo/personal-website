import { beforeEach, describe, expect, it } from 'vitest';
import type { Action } from '@yoyo/protocol';
import { createBrain } from '../agent/stub';
import { BrainError } from '../agent/types';

describe('stub brain', () => {
  beforeEach(() => localStorage.clear());

  it('streams words and actions from a canned reply', async () => {
    const brain = createBrain({ speed: 0.001 });
    const words: string[] = [];
    const actions: Action[] = [];
    const r = await brain.send('Who is Yoyo?', { onWord: (w) => words.push(w), onAction: (a) => actions.push(a) });
    expect(words[0]).toBe('Yoav');
    expect(r.text.startsWith('Yoav Zrihan. Self-taught')).toBe(true);
    expect(r.text).not.toContain('[[');
    expect(actions[0]).toEqual({ type: 'become', shape: { kind: 'glyph', id: 'curls' } });
    expect(actions.at(-1)?.type).toBe('chips');
  });

  it('remembers a name in yoyo.v3.name', async () => {
    const brain = createBrain({ speed: 0.001 });
    await brain.send('my name is noa');
    expect(localStorage.getItem('yoyo.v3.name')).toBe('Noa');
    expect(brain.memory.name()).toBe('Noa');
  });

  it('streams an example build and enforces the 5/hour cap', async () => {
    const brain = createBrain({ speed: 0.0005 });
    let last = 0;
    const res = await brain.build('a timer', { onChunk: (_c, bytes) => (last = bytes) });
    expect(res.html.startsWith('<!doctype html>')).toBe(true);
    expect(last).toBe(res.bytes);
    expect(res.title).toBe('Pomodoro');
    for (let i = 0; i < 5; i++) brain.memory.addBuild({ title: 't', instruction: 'x', html: '<p>' });
    await expect(brain.build('again')).rejects.toBeInstanceOf(BrainError);
  });

  it('aborts a turn', async () => {
    const brain = createBrain({ speed: 1 });
    const ac = new AbortController();
    const p = brain.send('Who is Yoyo?', {}, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ reason: 'aborted' });
  });

  it('counts visits', () => {
    const brain = createBrain();
    expect(brain.memory.recordVisit()).toBe(0);
    expect(createBrain().memory.recordVisit()).toBe(1);
  });
});
