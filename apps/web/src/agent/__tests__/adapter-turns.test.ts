import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '..';

// The shell's onWord / onTurn contract (POLISH2 C1; documented at the top of ../types.ts).
describe('adapter: turns', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  const record = () => {
    const log: string[] = [];
    return {
      log,
      h: { onWord: (w: string) => log.push(w), onTurn: () => log.push('|') },
      turns: () => log.join(' ').split(' | '),
    };
  };

  it('scripted: words, then a boundary, then the next turn; never a boundary first or last', async () => {
    const brain = createBrain({ speed: 0.0005 });
    const r = record();
    const reply = await brain.send('who is yoyo?', r.h);
    expect(reply.turns).toEqual([
      "I'm Yoyo, a software engineer who builds products with AI agents.",
      'Computer Science and Entrepreneurship at Reichman. Self-taught before that.',
    ]);
    expect(r.turns()).toEqual(reply.turns);
    expect(r.log[0]).not.toBe('|');
    expect(r.log.at(-1)).not.toBe('|');
    expect(reply.text).toBe(reply.turns.join(' '));
    expect(reply.text).not.toContain('|');
  });

  it('a shell without onTurn still gets every word, whole', async () => {
    const brain = createBrain({ speed: 0.0005 });
    const words: string[] = [];
    const reply = await brain.send('who is yoyo?', { onWord: (w) => words.push(w) });
    expect(words.join(' ')).toBe(reply.text);
    expect(words).toContain('Reichman.');
    expect(words).toContain("I'm");
  });

  it('live: a turn mark split across tokens; a build hand-off keeps dropping its "on it."', async () => {
    const frames = ['[[become:btc]] Since', ' 2021. |', '| He reads', ' the market. ||', ' [[build:a chart]] on it.'];
    vi.stubGlobal('fetch', async () =>
      new Response(frames.map((text) => `data: ${JSON.stringify({ type: 'token', text })}\n\n`).join('') + 'data: {"type":"done"}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    try {
      const brain = createBrain({ agentUrl: 'https://agent.example', speed: 0.001 });
      const r = record();
      const reply = await brain.send('crypto?', r.h);
      expect(reply.source).toBe('live');
      expect(reply.turns).toEqual(['Since 2021.', 'He reads the market.']);
      expect(r.log).toEqual(['Since', '2021.', '|', 'He', 'reads', 'the', 'market.']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
