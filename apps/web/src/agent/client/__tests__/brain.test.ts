import { describe, expect, it } from 'vitest';
import { createBrain, type BrainOptions } from '../brain';
import { GLYPH_IDS } from '@yoyo/protocol';
import { RESTING_LINE } from '../scripted';
import { decodeShareHash } from '../share';
import { ZERO_TIMING } from '../timing';
import { MemStorage, hang, json, mockFetch, recorder, sseResponse, tokens, type Handler } from './helpers';

const AGENT = 'https://agent.example';
/** A message the scripted brain isn't sure of, so it goes to the live router (WAVE4 A3). */
const Q = "what's your favourite food?";
const LISTEN = { type: 'action', action: { type: 'mood', mood: 'listening' } } as const;
const SETTLE = { type: 'mood', mood: 'thinking' } as const;

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
    await brain.send(Q);
    expect(rec.types()[0]).toBe('start');
    // the swarm listens while the Worker decides, and settles once it answers
    expect(rec.events[1]).toEqual(LISTEN);
    expect(rec.types().at(-1)).toBe('end');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
    expect(rec.text()).toBe('Yoav Zrihan.');
    expect(rec.actions()).toEqual([
      LISTEN.action,
      SETTLE,
      { type: 'become', shape: { kind: 'glyph', id: 'curls' } },
      { type: 'chips', chips: ['Tell me a story', 'What has he built?'] },
    ]);
    expect(calls[0]).toEqual({
      url: `${AGENT}/chat`,
      body: {
        messages: [{ role: 'visitor', text: Q }],
        visitor: { returning: false, device: 'desktop', lang: 'en-US' },
      },
    });
  });

  it('sends history (raw, tags included) and the captured name on the next turn', async () => {
    const { brain, calls } = make(() => sseResponse(tokens('[[become:pizza]] pizza.')));
    await brain.send("I'm Dana"); // a name: scripted, no call
    await brain.send(Q);
    await brain.send('and the second best one?');
    expect(calls).toHaveLength(2);
    const body = calls[1]!.body as { messages: unknown[]; visitor: { name?: string } };
    expect(body.messages).toEqual([
      { role: 'visitor', text: "I'm Dana" },
      { role: 'agent', text: 'nice to meet you, Dana. [[become:Dana]]' },
      { role: 'visitor', text: Q },
      { role: 'agent', text: '[[become:pizza]] pizza.' },
      { role: 'visitor', text: 'and the second best one?' },
    ]);
    expect(body.visitor.name).toBe('Dana');
    expect(brain.memory.name).toBe('Dana');
  });

  it('caps the message at 600 chars and history at 12 messages', async () => {
    const { brain, calls } = make(() => sseResponse(tokens('ok.')));
    for (let i = 0; i < 8; i++) await brain.send(`question number ${i} for you`);
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
    await brain.send(Q);
    expect(calls).toHaveLength(3);
    expect(rec.text()).toBe('fine.');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
  });
});

describe('fallback state machine', () => {
  it('router timeout → the scripted best match for that turn, silently (no resting line)', async () => {
    const { brain, rec } = make(hang);
    await brain.send('how old are you, yoyo?'); // the scripted best match is `who`
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    const turns = rec.turns();
    expect(turns[0]).toBe("I'm Yoyo, a software engineer who builds products with AI agents.");
    expect(turns[1]).toBe('Computer Science and Entrepreneurship at Reichman. Self-taught before that.');
    expect(turns).toHaveLength(2);
    expect(rec.text()).not.toContain(RESTING_LINE);
    expect(rec.actions().slice(0, 3)).toEqual([LISTEN.action, SETTLE, { type: 'become', shape: { kind: 'glyph', id: 'curls' } }]);
    // still live for the next turn (only one failure)
    expect(brain.mode()).toBe('live');
  });

  it('worker unreachable → scripted, with the resting line once, as before', async () => {
    const { brain, rec } = make(() => Promise.reject(new TypeError('network')), { retries: 0 });
    await brain.send('how old are you, yoyo?');
    const turns = rec.turns();
    expect(turns[0]).toBe(RESTING_LINE);
    expect(turns[1]).toBe("I'm Yoyo, a software engineer who builds products with AI agents.");
  });

  it('after 2 live failures, scripted for the rest of the session (no more fetches)', async () => {
    const { brain, rec, calls } = make(() => json(502, { reason: 'upstream' }), { retries: 0 });
    await brain.send(Q);
    expect(brain.mode()).toBe('live');
    await brain.send(Q);
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
    await brain.send(Q);
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    expect(brain.mode()).toBe('scripted');
    expect(storage.getItem('yoyo.v3.scriptedDay')).toBe('2026-10-23');

    const again = make(() => sseResponse(tokens('live again.')), { storage, now: () => t });
    expect(again.brain.mode()).toBe('scripted');
    t = new Date(2026, 9, 24, 0, 5).getTime();
    expect(again.brain.mode()).toBe('live');
    await again.brain.send(Q);
    expect(again.rec.text()).toBe('live again.');
  });

  it('429 rate → scripted for that turn only and does not count as a failure', async () => {
    const { brain, rec } = make([() => json(429, { reason: 'rate' }), () => json(429, { reason: 'rate' }), () => sseResponse(tokens('ok.'))]);
    await brain.send(Q);
    await brain.send(Q);
    expect(brain.mode()).toBe('live');
    rec.clear();
    await brain.send(Q);
    expect(rec.text()).toBe('ok.');
  });

  it('a stream that breaks after the first token keeps what was said and counts as a failure', async () => {
    const { brain, rec } = make([() => sseResponse([{ type: 'token', text: 'half a' }, { type: 'error', reason: 'upstream' }]), () => json(502, {})], { retries: 0 });
    await brain.send(Q);
    expect(rec.text()).toBe('half a');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'live' });
    await brain.send(Q);
    expect(brain.mode()).toBe('scripted');
  });

  it('an empty live reply (e.g. a safety block) falls back to scripted', async () => {
    const { brain, rec } = make(() => sseResponse([{ type: 'done' }]));
    await brain.send('gm frens, what is up today');
    expect(rec.events.at(-1)).toEqual({ type: 'end', mode: 'scripted' });
    expect(rec.text()).toContain('gm.');
  });

  it('no agentUrl → scripted, without the resting line', async () => {
    const { brain, rec, calls } = make(hang, { agentUrl: '' });
    expect(brain.mode()).toBe('scripted');
    await brain.send('hi');
    expect(calls).toHaveLength(0);
    expect(rec.text()).toBe('hey. ask me anything, or tell me what to become.');
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
    expect(rec.text().endsWith('gm.')).toBe(true);
  });

  it('scripted replies stream word by word with live-like timing', async () => {
    const { brain, rec } = make(hang, { agentUrl: '', timing: { ...ZERO_TIMING, firstTokenMs: 60, perTokenMs: 5 } });
    const t0 = Date.now();
    await brain.send('who is yoyo?');
    const tokenEvents = rec.events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(15);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(60);
  });
});

describe('build', () => {
  it('live: streams chunks then buildDone, and remembers the build', async () => {
    const { brain, rec, calls } = make(() => sseResponse([{ type: 'chunk', html: '<!doctype html><html>' }, { type: 'chunk', html: '<body>hi</body></html>' }, { type: 'done', bytes: 40 }]), { liveBuilds: true });
    await brain.build('a timer', '<html>old</html>');
    expect(calls[0]).toEqual({ url: `${AGENT}/build`, body: { instruction: 'a timer', previousHtml: '<html>old</html>' } });
    const chunks = rec.events.filter((e) => e.type === 'buildChunk');
    expect(chunks).toHaveLength(2);
    const done = rec.events.at(-1);
    expect(done).toMatchObject({ type: 'buildDone', html: '<!doctype html><html><body>hi</body></html>', mode: 'live' });
    expect(brain.memory.builds[0]).toMatchObject({ instruction: 'a timer', mode: 'live' });
  });

  it('per-visitor build limit → honest error, no fallback', async () => {
    const { brain, rec } = make(() => json(429, { reason: 'rate', retryAfter: 600 }), { liveBuilds: true });
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
