import { describe, expect, it } from 'vitest';
import { ANTHROPIC_URL, anthropicTextDeltas, classifyAnthropicFailure, streamAnthropic, toAnthropicMessages } from '../src/anthropic';
import { modelName, provider, streamModel } from '../src/provider';
import { chatBody, events, geminiSse, setup } from './helpers';

const enc = new TextEncoder();

/** A Messages API stream as Anthropic sends it (event: + data: lines), cut at awkward places. */
function anthropicSse(texts: string[], opts: { split?: number; error?: boolean } = {}): ReadableStream<Uint8Array> {
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let raw =
    ev('message_start', { message: { id: 'msg_1', role: 'assistant', content: [] } }) +
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
    ev('ping', {});
  for (const t of texts) raw += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
  if (opts.error) raw += ev('error', { error: { type: 'overloaded_error', message: 'Overloaded' } });
  raw += ev('content_block_stop', { index: 0 }) + ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } }) + ev('message_stop', {});
  const bytes = enc.encode(raw);
  const split = opts.split ?? 11;
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + split));
      i += split;
    },
  });
}

async function collect(g: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of g) out.push(t);
  return out;
}

function recordingFetch(respond: () => Response) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return respond();
  }) as typeof fetch;
  return { f, calls };
}

describe('provider selection', () => {
  it('defaults to Gemini 2.5 Flash; PROVIDER=anthropic → claude-sonnet-4-5; MODEL overrides either', () => {
    expect(provider({})).toBe('gemini');
    expect(modelName({})).toBe('gemini-2.5-flash');
    expect(modelName({ GEMINI_MODEL: 'gemini-2.5-pro' })).toBe('gemini-2.5-pro');
    expect(provider({ PROVIDER: 'Anthropic' })).toBe('anthropic');
    expect(modelName({ PROVIDER: 'anthropic', GEMINI_MODEL: 'gemini-2.5-pro' })).toBe('claude-sonnet-4-5');
    expect(modelName({ PROVIDER: 'anthropic', MODEL: 'claude-haiku-4-5' })).toBe('claude-haiku-4-5');
    expect(modelName({ MODEL: 'gemini-2.5-flash-lite' })).toBe('gemini-2.5-flash-lite');
  });
});

describe('Gemini adapter (mocked fetch)', () => {
  it('streams text deltas from streamGenerateContent', async () => {
    const { f, calls } = recordingFetch(() => new Response(geminiSse(['Hel', 'lo.']), { status: 200 }));
    const r = await streamModel({ GEMINI_API_KEY: 'g-key' }, { system: 'SYS', contents: [{ role: 'user', parts: [{ text: 'hi' }] }], temperature: 0.8, maxOutputTokens: 512, fetchImpl: f });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await collect(r.stream)).toEqual(['Hel', 'lo.']);
    expect(calls[0]!.url).toContain('/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(calls[0]!.headers.get('x-goog-api-key')).toBe('g-key');
    expect(calls[0]!.body).toMatchObject({ systemInstruction: { parts: [{ text: 'SYS' }] } });
  });
});

describe('Anthropic adapter (mocked fetch)', () => {
  it('POSTs the Messages API with stream:true, the version header and the system prompt in `system`', async () => {
    const { f, calls } = recordingFetch(() => new Response(anthropicSse(['[[become:cu', 'rls]] Yoav', ' Zrihan.']), { status: 200 }));
    const r = await streamAnthropic({
      apiKey: 'a-key',
      model: 'claude-sonnet-4-5',
      system: 'SYS',
      contents: [
        { role: 'user', parts: [{ text: 'hi' }] },
        { role: 'model', parts: [{ text: 'hey.' }] },
        { role: 'user', parts: [{ text: 'who is yoyo?' }] },
      ],
      temperature: 0.4,
      maxOutputTokens: 16_384,
      fetchImpl: f,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await collect(r.stream)).join('')).toBe('[[become:curls]] Yoav Zrihan.');
    const c = calls[0]!;
    expect(c.url).toBe(ANTHROPIC_URL);
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c.headers.get('x-api-key')).toBe('a-key');
    expect(c.headers.get('anthropic-version')).toBe('2023-06-01');
    expect(c.body).toEqual({
      model: 'claude-sonnet-4-5',
      max_tokens: 16_384,
      system: 'SYS',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hey.' },
        { role: 'user', content: 'who is yoyo?' },
      ],
      temperature: 0.4,
      stream: true,
    });
  });

  it('skips non-text events and throws on an in-stream error event', async () => {
    expect(await collect(anthropicTextDeltas(anthropicSse(['a', 'b'], { split: 3 })))).toEqual(['a', 'b']);
    await expect(collect(anthropicTextDeltas(anthropicSse(['a'], { error: true })))).rejects.toThrow('Overloaded');
  });

  it('maps turns: model→assistant, merges same-role turns, starts with user', () => {
    expect(
      toAnthropicMessages([
        { role: 'model', parts: [{ text: 'stray' }] },
        { role: 'user', parts: [{ text: 'a' }] },
        { role: 'user', parts: [{ text: 'b' }] },
      ]),
    ).toEqual([{ role: 'user', content: 'a\n\nb' }]);
  });

  it('classifies failures', async () => {
    expect(classifyAnthropicFailure(429, '{"type":"error","error":{"type":"rate_limit_error"}}')).toBe('rate');
    expect(classifyAnthropicFailure(400, 'Your credit balance is too low')).toBe('quota');
    expect(classifyAnthropicFailure(529, 'overloaded_error')).toBe('upstream');
    const { f } = recordingFetch(() => new Response('{"type":"error","error":{"type":"overloaded_error"}}', { status: 529 }));
    const r = await streamAnthropic({ apiKey: 'k', model: 'm', system: '', contents: [], temperature: 0, maxOutputTokens: 1, fetchImpl: f });
    expect(r).toMatchObject({ ok: false, status: 529, kind: 'upstream' });
  });
});

describe('router with PROVIDER=anthropic', () => {
  function anthropicSetup(env: Record<string, string> = {}) {
    const s = setup({ env: { PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a-key', GEMINI_API_KEY: undefined, ...env } });
    return s;
  }

  it('/health reports the provider and model; no key → not live, /chat 503', async () => {
    const { call, post } = setup({ env: { PROVIDER: 'anthropic', GEMINI_API_KEY: 'g-key' } });
    expect(await (await call('/health')).json()).toMatchObject({ live: false, provider: 'anthropic', model: 'claude-sonnet-4-5' });
    expect((await post('/chat', chatBody('hi'))).status).toBe(503);
  });

  it('/chat streams the same SSE out', async () => {
    const { post, state, calls } = anthropicSetup();
    state.queue.push({ status: 200, stream: () => anthropicSse(['[[become:cu', 'rls]] Yoav', ' Zrihan.']) });
    const res = await post('/chat', chatBody('who is yoyo?'));
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([
      { type: 'token', text: '[[become:cu' },
      { type: 'token', text: 'rls]] Yoav' },
      { type: 'token', text: ' Zrihan.' },
      { type: 'done' },
    ]);
    const c = calls[0]!;
    expect(c.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c.body).toMatchObject({ model: 'claude-sonnet-4-5', temperature: 0.8, max_tokens: 512, stream: true });
    expect(String(c.body.system)).toContain("You are Yoyo's agent");
    expect((c.body.messages as { content: string }[])[0]!.content).toContain('<visitor_message>');
  });

  it('/build streams fenced-stripped chunks with the build caps; MODEL is honoured', async () => {
    const { post, state, calls } = anthropicSetup({ MODEL: 'claude-haiku-4-5' });
    state.queue.push({ status: 200, stream: () => anthropicSse(['```html\n<!doctype html><html>', '</html>\n```']) });
    const ev = await events(await post('/build', { instruction: 'a timer' }));
    const html = ev.filter((e) => e.type === 'chunk').map((e) => e.html).join('');
    expect(html).toBe('<!doctype html><html></html>');
    expect(ev.at(-1)).toMatchObject({ type: 'done' });
    expect(calls[0]!.body).toMatchObject({ model: 'claude-haiku-4-5', temperature: 0.4, max_tokens: 16_384 });
  });

  it('upstream 429 → 429 rate; credit exhausted → 429 quota', async () => {
    const { post, state } = anthropicSetup();
    state.queue.push({ status: 429, body: '{"type":"error","error":{"type":"rate_limit_error"}}' });
    const r = await post('/chat', chatBody('hi'));
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ reason: 'rate' });
    state.queue.push({ status: 400, body: '{"type":"error","error":{"message":"Your credit balance is too low"}}' });
    expect(await (await post('/chat', chatBody('hi'))).json()).toEqual({ reason: 'quota' });
  });
});
