import { describe, expect, it } from 'vitest';
import { createBrain, type BrainOptions } from '../brain';
import { GLYPH_IDS } from '@yoyo/protocol';
import { RESTING_LINE } from '../scripted';
import { decodeShareHash } from '../share';
import { ZERO_TIMING } from '../timing';
import { MemStorage, hang, json, mockFetch, recorder, sseResponse, tokens, type Handler } from './helpers';

const AGENT = 'https://agent.example';

function make(handlers: Handler[] | Handler, extra: Partial<BrainOptions> = {}) {
  const rec = recorder();
  const { fetch, calls } = mockFetch(handlers);
  const storage = extra.storage ?? new MemStorage();
  const brain = createBrain({
    agentUrl: AGENT,
    swarmGlyphs: GLYPH_IDS,
    onEvent: rec.onEvent,
    fetch,
    storage,
    sessionStorage: new MemStorage(),
    timing: ZERO_TIMING,
    random: () => 0,
    device: 'desktop',
    lang: 'en-US',
    siteUrl: 'https://yoyo.example/',
    firstTokenTimeoutMs: 120,
    ...extra,
  });
  return { brain, rec, calls, storage };
}

describe('live path', () => {
  it('streams tokens, parses tags split across tokens, and ends in live mode', async () => {
    const { brain, rec, calls } = make(() => sseResponse(tokens('[[beco', 'me:curls]] Yoav', ' Zrihan. [[chips:Tell me a st', 'ory|What has he built?]]')));
    expect(brain.mode()).toBe('live');
    await brain.send('who is yoyo?');
    expect(rec.types()[0]).toBe('start');
    expect(rec.types().at(-1)).toBe('end');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
    expect(rec.text()).toBe('Yoav Zrihan.');
    expect(rec.actions()).toEqual([
      { type: 'become', shape: { kind: 'glyph', id: 'curls' } },
      { type: 'chips', chips: ['Tell me a story', 'What has he built?'] },
    ]);
    expect(calls[0]).toEqual({
      url: `${AGENT}/chat`,
      body: {
        messages: [{ role: 'visitor', text: 'who is yoyo?' }],
        visitor: { returning: false, device: 'desktop', lang: 'en-US' },
      },
    });
  });

  it('sends history (raw, tags included) and the captured name on the next turn', async () => {
    const { brain, calls } = make(() => sseResponse(tokens('[[become:Dana]] hi Dana.')));
    await brain.send("I'm Dana");
    await brain.send('and you?');
    const body = calls[1]!.body as { messages: unknown[]; visitor: { name?: string } };
    expect(body.messages).toEqual([
      { role: 'visitor', text: "I'm Dana" },
      { role: 'agent', text: '[[become:Dana]] hi Dana.' },
      { role: 'visitor', text: 'and you?' },
    ]);
    expect(body.visitor.name).toBe('Dana');
    expect(brain.memory.name).toBe('Dana');
  });

  it('caps the message at 600 chars and history at 12 messages', async () => {
    const { brain, calls } = make(() => sseResponse(tokens('ok.')));
    for (let i = 0; i < 8; i++) await brain.send(`q${i}`);
    await brain.send('x'.repeat(700));
    const body = calls.at(-1)!.body as { messages: { text: string }[] };
    expect(body.messages.length).toBeLessThanOrEqual(13);
    expect(body.messages.at(-1)!.text.length).toBe(600);
    expect(brain.history().length).toBe(12);
  });

  it('retries fast failures within the first-token budget', async () => {
    const { brain, rec, calls } = make(
      [() => Promise.reject(new TypeError('network')), () => json(500, { reason: 'upstream' }), () => sseResponse(tokens('fine.'))],
      { firstTokenTimeoutMs: 5_000 },
    );
    await brain.send('hi');
    expect(calls).toHaveLength(3);
    expect(rec.text()).toBe('fine.');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
  });
});

describe('fallback state machine', () => {
  it('first-token timeout → scripted for that turn, with the resting line once', async () => {
    const { brain, rec } = make(hang);
    await brain.send('who is yoyo?');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    // the resting line is a turn of its own, then the reply's own turns, with the `||` stripped
    const turns = rec.turns();
    expect(turns[0]).toBe(RESTING_LINE);
    expect(turns[1]).toBe('Yoav Zrihan. Self-taught, building since 2022. Crypto since 2021. Second-year CS and Entrepreneurship at Reichman.');
    expect(turns[2]).toBe("He doesn't write most of his code anymore. He directs the agents that do.");
    expect(turns).toHaveLength(3);
    expect(rec.text()).not.toContain('|');
    expect(rec.types().filter((t) => t === 'turn')).toHaveLength(2);
    expect(rec.actions()[0]).toEqual({ type: 'become', shape: { kind: 'glyph', id: 'curls' } });
    // still live for the next turn (only one failure)
    expect(brain.mode()).toBe('live');
  });

  it('after 2 live failures, scripted for the rest of the session (no more fetches)', async () => {
    const { brain, rec, calls } = make(() => json(502, { reason: 'upstream' }), { retries: 0 });
    await brain.send('hi');
    expect(brain.mode()).toBe('live');
    await brain.send('hello');
    expect(brain.mode()).toBe('scripted');
    const n = calls.length;
    rec.clear();
    await brain.send('who is yoyo?');
    expect(calls.length).toBe(n);
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    // the resting line appears only on the first scripted turn
    expect(rec.text()).not.toContain(RESTING_LINE);
  });

  it('429 quota → scripted for the rest of the (local) day, remembered across reloads', async () => {
    let t = new Date(2026, 9, 23, 10, 0).getTime();
    const storage = new MemStorage();
    const { brain, rec } = make(() => json(429, { reason: 'quota' }), { storage, now: () => t });
    await brain.send('hi');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    expect(brain.mode()).toBe('scripted');
    expect(storage.getItem('yoyo.v3.scriptedDay')).toBe('2026-10-23');

    const again = make(() => sseResponse(tokens('live again.')), { storage, now: () => t });
    expect(again.brain.mode()).toBe('scripted');
    t = new Date(2026, 9, 24, 0, 5).getTime();
    expect(again.brain.mode()).toBe('live');
    await again.brain.send('hi');
    expect(again.rec.text()).toBe('live again.');
  });

  it('429 rate → scripted for that turn only and does not count as a failure', async () => {
    const { brain, rec } = make([() => json(429, { reason: 'rate' }), () => json(429, { reason: 'rate' }), () => sseResponse(tokens('ok.'))]);
    await brain.send('hi');
    await brain.send('hi');
    expect(brain.mode()).toBe('live');
    rec.clear();
    await brain.send('hi');
    expect(rec.text()).toBe('ok.');
  });

  it('a stream that breaks after the first token keeps what was said and counts as a failure', async () => {
    const { brain, rec } = make([() => sseResponse([{ type: 'token', text: 'half a' }, { type: 'error', reason: 'upstream' }]), () => json(502, {})], { retries: 0 });
    await brain.send('hi');
    expect(rec.text()).toBe('half a');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
    await brain.send('hi');
    expect(brain.mode()).toBe('scripted');
  });

  it('an empty live reply (e.g. a safety block) falls back to scripted', async () => {
    const { brain, rec } = make(() => sseResponse([{ type: 'done' }]));
    await brain.send('gm');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    expect(rec.text()).toContain('gm. he');
  });

  it('no agentUrl → scripted, without the resting line', async () => {
    const { brain, rec, calls } = make(hang, { agentUrl: '' });
    expect(brain.mode()).toBe('scripted');
    await brain.send('hi');
    expect(calls).toHaveLength(0);
    expect(rec.text()).toBe('hey. ask me anything about Yoyo, or tell me what to become.');
    expect(rec.text()).not.toContain(RESTING_LINE);
  });

  it('abort() ends the turn immediately and nothing else arrives', async () => {
    const { brain, rec } = make(hang, { agentUrl: '', timing: { ...ZERO_TIMING, firstTokenMs: 30, perTokenMs: 30 } });
    const p = brain.send('who is yoyo?');
    await new Promise((r) => setTimeout(r, 80));
    brain.abort();
    const at = rec.events.length;
    await p;
    await new Promise((r) => setTimeout(r, 100));
    expect(rec.events.length).toBe(at);
    expect(rec.events.filter((e) => e.type === 'end')).toHaveLength(1);
  });

  it('a new send() supersedes the previous one (one end per start)', async () => {
    const { brain, rec } = make(hang, { agentUrl: '', timing: { ...ZERO_TIMING, firstTokenMs: 20, perTokenMs: 20 } });
    const a = brain.send('who is yoyo?');
    await new Promise((r) => setTimeout(r, 40));
    const b = brain.send('gm');
    await Promise.all([a, b]);
    const types = rec.types().filter((t) => t === 'start' || t === 'end');
    expect(types).toEqual(['start', 'end', 'start', 'end']);
    expect(rec.text().endsWith("gm. he's been saying it since 2021.")).toBe(true);
  });

  it('scripted replies stream word by word with live-like timing', async () => {
    const { brain, rec } = make(hang, { agentUrl: '', timing: { ...ZERO_TIMING, firstTokenMs: 60, perTokenMs: 5 } });
    const t0 = Date.now();
    await brain.send('who is yoyo?');
    const tokenEvents = rec.events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(60);
  });
});

describe('build', () => {
  it('live: streams chunks then buildDone, and remembers the build', async () => {
    const { brain, rec, calls } = make(() => sseResponse([{ type: 'chunk', html: '<!doctype html><html>' }, { type: 'chunk', html: '<body>hi</body></html>' }, { type: 'done', bytes: 40 }]));
    await brain.build('a timer', '<html>old</html>');
    expect(calls[0]).toEqual({ url: `${AGENT}/build`, body: { instruction: 'a timer', previousHtml: '<html>old</html>' } });
    const chunks = rec.events.filter((e) => e.type === 'buildChunk');
    expect(chunks).toHaveLength(2);
    const done = rec.events.at(-1);
    expect(done).toMatchObject({ type: 'buildDone', html: '<!doctype html><html><body>hi</body></html>', mode: 'live' });
    expect(brain.memory.builds[0]).toMatchObject({ instruction: 'a timer', mode: 'live' });
  });

  it('per-visitor build limit → honest error, no fallback', async () => {
    const { brain, rec } = make(() => json(429, { reason: 'rate', retryAfter: 600 }));
    await brain.build('a timer');
    expect(rec.events.at(-1)).toEqual({ type: 'error', reason: 'rate' });
  });

  it('worker down → a prebuilt example, picked by keyword, streamed', async () => {
    const { brain, rec } = make(() => json(502, {}), { retries: 0, timing: { ...ZERO_TIMING, buildTotalMs: 100, buildTickMs: 5 } });
    await brain.build('make me a habit tracker please');
    const done = rec.events.at(-1);
    expect(done).toMatchObject({ type: 'buildDone', mode: 'scripted', example: 'habits' });
    // the live attempt was never accepted, so only the example announces itself
    expect(rec.events.filter((e) => e.type === 'buildStart')).toEqual([{ type: 'buildStart', mode: 'scripted', example: 'habits' }]);
    const chunks = rec.events.filter((e) => e.type === 'buildChunk');
    expect(chunks.length).toBeGreaterThan(5);
    const last = chunks.at(-1) as { html: string; progress: number };
    expect(last.progress).toBe(1);
    expect((done as { html: string }).html).toBe(last.html);
  });

  it('[[build:example]] in scripted mode cycles through all six examples', async () => {
    const { brain, rec } = make(hang, { agentUrl: '' });
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      rec.clear();
      await brain.build('example');
      seen.push((rec.events.at(-1) as { example: string }).example);
    }
    expect(seen).toEqual(['pomodoro', 'landing', 'todo', 'weather', 'habits', 'birthday', 'pomodoro']);
  });
});

describe('share', () => {
  it('small HTML → #b= hash URL that decodes back', async () => {
    const { brain, calls } = make(() => json(200, { id: 'abc' }));
    const html = '<!doctype html><p>hi</p>';
    const r = await brain.share(html);
    expect(calls).toHaveLength(0);
    expect(r.kind).toBe('hash');
    expect(r.url.startsWith('https://yoyo.example/#b=')).toBe(true);
    expect(decodeShareHash(new URL(r.url).hash)).toBe(html);
  });

  it('large HTML in live mode → KV permalink, always under VITE_AGENT_URL', async () => {
    const { brain, calls } = make(() => json(200, { id: 'AbCdEf1234', url: 'https://somewhere-else.example/s/AbCdEf1234' }));
    const r = await brain.share(`<html>${'x'.repeat(9000)}</html>`);
    expect(calls[0]?.url).toBe(`${AGENT}/share`);
    expect(r).toEqual({ url: `${AGENT}/s/AbCdEf1234`, kind: 'kv', id: 'AbCdEf1234' });
  });

  it('KV unavailable → hash fallback', async () => {
    const { brain } = make(() => json(503, { reason: 'offline' }));
    const html = `<html>${'y'.repeat(9000)}</html>`;
    const r = await brain.share(html);
    expect(r.kind).toBe('hash');
    expect(decodeShareHash(new URL(r.url).hash)).toBe(html);
  });
});
