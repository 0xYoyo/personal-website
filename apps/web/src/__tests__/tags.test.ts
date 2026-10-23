import { describe, expect, it } from 'vitest';
import type { Action } from '@yoyo/protocol';
import { createTagStream } from '../agent/tags';
import { chunkRaw } from '../agent/stub';

function run(chunks: string[]) {
  const words: string[] = [];
  const actions: Action[] = [];
  const s = createTagStream((w) => words.push(w), (a) => actions.push(a));
  chunks.forEach((c) => s.push(c));
  s.end();
  return { words, actions, text: s.text };
}

describe('tag stream', () => {
  it('emits words and actions in order', () => {
    const r = run(['[[become:Dana]] done.']);
    expect(r.words).toEqual(['done.']);
    expect(r.actions).toEqual([{ type: 'become', shape: { kind: 'text', text: 'Dana' } }]);
  });
  it('handles a tag split across chunks', () => {
    const r = run(['hello [', '[sh', 'ow:polybot', ']', '] world']);
    expect(r.words).toEqual(['hello', 'world']);
    expect(r.actions).toEqual([{ type: 'show', project: 'polybot' }]);
  });
  it('drops unknown tags and keeps the words around them', () => {
    const r = run(['a [[evil:x]] b']);
    expect(r.text).toBe('a b');
    expect(r.actions).toEqual([]);
  });
  it('drops an unterminated tag at the end', () => {
    const r = run(['ok [[become:Da']);
    expect(r.text).toBe('ok');
  });
  it('fires the action before the words that follow it', () => {
    const order: string[] = [];
    const s = createTagStream((w) => order.push(`w:${w}`), (a) => order.push(`a:${a.type}`));
    chunkRaw('[[become:kart]] Seven things [[show:prompt-racers]]').forEach((c) => s.push(c));
    s.end();
    expect(order).toEqual(['a:become', 'w:Seven', 'w:things', 'a:show']);
  });
});
