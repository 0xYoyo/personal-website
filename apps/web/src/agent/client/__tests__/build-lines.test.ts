import { describe, expect, it } from 'vitest';
import { GLYPH_IDS } from '@yoyo/protocol';
import { createBrain, type BrainEvent, type BrainOptions } from '../brain';
import { CHANGE_RESTING_LINE, EXAMPLE_DONE_LINE, liveDoneLine } from '../lines';
import { pickExampleId } from '../pick-example';
import { ZERO_TIMING } from '../timing';
import { MemStorage, json, mockFetch, recorder, sseResponse, type Handler } from './helpers';

// POLISH1 C1 (scripted builds honor the instruction, honest done lines) and C5 (accept before "on it.").

const AGENT = 'https://agent.example';
const FAST = { ...ZERO_TIMING, buildTotalMs: 40, buildTickMs: 5 };

function make(handlers: Handler[] | Handler, extra: Partial<BrainOptions> = {}) {
  const rec = recorder();
  const { fetch, calls } = mockFetch(handlers);
  let t = 1_000_000;
  const brain = createBrain({
    agentUrl: AGENT,
    swarmGlyphs: GLYPH_IDS,
    onEvent: rec.onEvent,
    fetch,
    storage: new MemStorage(),
    sessionStorage: new MemStorage(),
    timing: FAST,
    random: () => 0,
    device: 'desktop',
    firstTokenTimeoutMs: 120,
    retries: 0,
    now: () => (t += 1000),
    ...extra,
  });
  return { brain, rec, calls };
}
const last = <T extends BrainEvent['type']>(events: BrainEvent[], type: T) =>
  events.filter((e): e is Extract<BrainEvent, { type: T }> => e.type === type).at(-1);

describe('pickExampleId', () => {
  const cases: [string, string | null][] = [
    ['a todo app', 'todo'],
    ['build me a task list', 'todo'],
    ['my todos', 'todo'],
    ['a pomodoro timer', 'pomodoro'],
    ['a focus timer', 'pomodoro'],
    ['make me a timer', 'pomodoro'],
    ['a landing page for my startup', 'landing'],
    ['a website for a bakery', 'landing'],
    ['a birthday card for my mom', 'birthday'],
    ['a card for mom', 'birthday'],
    ['a weather card', 'weather'],
    ['weather in tel aviv', 'weather'],
    ['a habit tracker', 'habits'],
    ['a tracker for my habits page', 'habits'],
    ['a synth', null],
    ['something cool', null],
  ];
  for (const [text, id] of cases) it(`"${text}" → ${id}`, () => expect(pickExampleId(text)).toBe(id));
});

describe('scripted builds', () => {
  it('pick the example by the instruction, and the done line never claims seconds', async () => {
    const { brain, rec } = make(json(502, {}), { agentUrl: '' });
    for (const [ask, id] of [['a todo app', 'todo'], ['a card for my mom', 'birthday'], ['startup landing page', 'landing'], ['focus timer', 'pomodoro'], ['weather', 'weather'], ['habit tracker', 'habits']] as const) {
      rec.clear();
      await brain.build(ask);
      const done = last(rec.events, 'buildDone')!;
      expect(done.example, ask).toBe(id);
      expect(done.line).toBe(EXAMPLE_DONE_LINE);
      expect(done.line).not.toMatch(/^\d/);
    }
  });

  it('the scripted chat reply hands off the visitor\'s own words, and that build is an example even when live is up', async () => {
    let n = 0;
    const handler: Handler = (url) => {
      n++;
      if (url.endsWith('/chat')) return new Promise<Response>(() => undefined); // first-token timeout → scripted reply
      return sseResponse([{ type: 'chunk', html: '<html>live</html>' }, { type: 'done', bytes: 17 }]);
    };
    const { brain, rec } = make(handler);
    await brain.send('build me a todo app');
    const build = rec.actions().find((a) => a.type === 'build');
    expect(build).toEqual({ type: 'build', instruction: 'build me a todo app' });
    const before = n;
    rec.clear();
    await brain.build('build me a todo app');
    expect(n).toBe(before); // no live /build: the agent just said the live builder is resting
    expect(last(rec.events, 'buildDone')).toMatchObject({ mode: 'scripted', example: 'todo', line: EXAMPLE_DONE_LINE });
  });

  it('"Another example" still rotates', async () => {
    const { brain, rec } = make(json(502, {}), { agentUrl: '' });
    await brain.send('Another example');
    expect(rec.actions().find((a) => a.type === 'build')).toEqual({ type: 'build', instruction: 'example' });
  });

  it('"Change it" in scripted mode says so first, and keeps the app being changed when the change names none', async () => {
    const { brain, rec } = make(json(502, {}), { agentUrl: '' });
    await brain.build('a habit tracker');
    const prev = last(rec.events, 'buildDone')!.html;
    rec.clear();
    await brain.build('make it blue', prev);
    expect(rec.events.find((e) => e.type === 'buildStart')).toEqual({ type: 'buildStart', mode: 'scripted', example: 'habits', notice: CHANGE_RESTING_LINE });
    rec.clear();
    await brain.build('turn it into a weather card', prev);
    expect(last(rec.events, 'buildDone')?.example).toBe('weather');
  });
});

describe('live builds', () => {
  it('buildStart only once the Worker accepts; done line reports the real seconds; expected = max(8 kB, previous build)', async () => {
    const big = `<!doctype html><html>${'x'.repeat(12_000)}</html>`;
    const { brain, rec } = make([
      () => sseResponse([{ type: 'chunk', html: '<!doctype html><html>' }, { type: 'chunk', html: '</html>' }, { type: 'done', bytes: 28 }]),
      () => sseResponse([{ type: 'chunk', html: big }, { type: 'done', bytes: big.length }]),
      () => sseResponse([{ type: 'chunk', html: '<html>' }, { type: 'chunk', html: '</html>' }, { type: 'done', bytes: 13 }]),
    ]);
    await brain.build('a synth');
    expect(rec.types().filter((t) => t.startsWith('build'))).toEqual(['buildStart', 'buildChunk', 'buildChunk', 'buildDone']);
    const chunk = last(rec.events, 'buildChunk')!;
    expect(chunk.expected).toBe(8_000);
    const done = last(rec.events, 'buildDone')!;
    expect(done.line).toBe(liveDoneLine(done.ms));
    expect(done.line).toMatch(/^\d+ seconds\. Want changes\?$/);

    rec.clear();
    await brain.build('a bigger synth');
    expect(last(rec.events, 'buildChunk')!.progress).toBe(0.95);
    rec.clear();
    await brain.build('another');
    expect(last(rec.events, 'buildChunk')!.expected).toBe(big.length);
  });

  it('a Worker 429 rate on build → error rate, with no buildStart before it', async () => {
    const { brain, rec } = make(() => json(429, { reason: 'rate', retryAfter: 600 }));
    await brain.build('a timer');
    expect(rec.types()).toEqual(['error']);
    expect(rec.events[0]).toEqual({ type: 'error', reason: 'rate' });
  });
});

describe('liveDoneLine', () => {
  it('rounds to whole seconds, at least 1', () => {
    expect(liveDoneLine(14_400)).toBe('14 seconds. Want changes?');
    expect(liveDoneLine(200)).toBe('1 seconds. Want changes?');
  });
});
