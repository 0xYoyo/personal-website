import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '@yoyo/protocol';
import { createBrain } from '..';
import { CHANGE_RESTING_LINE, EXAMPLE_DONE_LINE } from '../client/lines';

// The shell adapter's build surface (POLISH1 C1, C5), scripted mode with timings × 0.0005.
describe('adapter: builds', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('example builds: onAccepted("example") before the first chunk, and the honest done line', async () => {
    const brain = createBrain({ speed: 0.0005 });
    const order: string[] = [];
    const res = await brain.build('a todo app', {
      onAccepted: (src) => order.push(`accepted:${src}`),
      onChunk: () => order.at(-1) !== 'chunk' && order.push('chunk'),
    });
    expect(order).toEqual(['accepted:example', 'chunk']);
    expect(res.line).toBe(EXAMPLE_DONE_LINE);
    expect(res.title).toBe('Today');
  });

  it('"Change it" with the live builder resting: the notice, then the closest example', async () => {
    const brain = createBrain({ speed: 0.0005 });
    const first = await brain.build('a habit tracker');
    const notices: string[] = [];
    const res = await brain.build('make it blue', { onNotice: (t) => notices.push(t) }, { previousHtml: first.html });
    expect(notices).toEqual([CHANGE_RESTING_LINE]);
    expect(res.html).toBe(first.html);
    expect(res.line).toBe(EXAMPLE_DONE_LINE);
  });

  it('a live reply that hands off a build drops its "on it." (the shell says it on accept)', async () => {
    const frames = ['[[build:a po', 'modoro timer]]', ' on', ' it.'].map((text) => `data: ${JSON.stringify({ type: 'token', text })}\n\n`);
    vi.stubGlobal('fetch', async () => new Response(frames.join('') + 'data: {"type":"done"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    try {
      const brain = createBrain({ agentUrl: 'https://agent.example', speed: 0.001 });
      const words: string[] = [];
      const actions: Action[] = [];
      const r = await brain.send('build me a pomodoro timer', { onWord: (w) => words.push(w), onAction: (a) => actions.push(a) });
      expect(r.source).toBe('live');
      expect(actions).toEqual([{ type: 'build', instruction: 'a pomodoro timer' }]);
      expect(words).toEqual([]);
      expect(r.text).toBe('');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('…but keeps anything else said after the tag', async () => {
    const frames = ['[[build:a timer]]', ' sure, a timer', ' it is.'].map((text) => `data: ${JSON.stringify({ type: 'token', text })}\n\n`);
    vi.stubGlobal('fetch', async () => new Response(frames.join('') + 'data: {"type":"done"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    try {
      const brain = createBrain({ agentUrl: 'https://agent.example', speed: 0.001 });
      const words: string[] = [];
      const r = await brain.send('build me a timer', { onWord: (w) => words.push(w) });
      expect(r.text).toBe('sure, a timer it is.');
      expect(words.join(' ')).toBe(r.text);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
