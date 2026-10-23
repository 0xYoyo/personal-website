import { createApp, type Env } from '../src/app';
import { DailyCounter } from '../src/limits';

export class MemoryKV {
  store = new Map<string, { value: string; expires: number | null }>();
  puts = 0;
  constructor(private now: () => number) {}
  async get(key: string, type?: 'text' | 'json'): Promise<unknown> {
    const e = this.store.get(key);
    if (!e || (e.expires !== null && e.expires <= this.now())) return null;
    return type === 'json' ? JSON.parse(e.value) : e.value;
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.puts++;
    this.store.set(key, { value, expires: opts?.expirationTtl ? this.now() + opts.expirationTtl * 1000 : null });
  }
  ttlOf(key: string): number | null {
    const e = this.store.get(key);
    return e?.expires == null ? null : Math.round((e.expires - this.now()) / 1000);
  }
}

const enc = new TextEncoder();

/** A Gemini-style SSE body; `split` cuts the bytes at awkward places to test reassembly. */
export function geminiSse(texts: string[], split = 7): ReadableStream<Uint8Array> {
  const raw = texts
    .map((t) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] })}\r\n\r\n`)
    .join('');
  const bytes = enc.encode(raw);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + split));
      i += split;
    },
  });
}

export type GeminiCall = { url: string; body: Record<string, unknown>; headers: Headers };

export function setup(opts: { reply?: string[]; status?: number; errorBody?: string; env?: Partial<Env> } = {}) {
  let t = Date.UTC(2026, 9, 23, 12, 0, 0);
  const now = () => t;
  const LIMITS = new MemoryKV(now);
  const SHARES = new MemoryKV(now);
  const calls: GeminiCall[] = [];
  const state: {
    reply: string[];
    status: number;
    errorBody: string;
    /** per-call overrides, consumed in order */
    queue: { status: number; body?: string; stream?: () => ReadableStream<Uint8Array> }[];
  } = { reply: opts.reply ?? ['Hello', ' there.'], status: opts.status ?? 200, errorBody: opts.errorBody ?? '', queue: [] };
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    const q = state.queue.shift();
    if (q) return new Response(q.stream ? q.stream() : (q.body ?? ''), { status: q.status });
    if (state.status !== 200) return new Response(state.errorBody, { status: state.status });
    return new Response(geminiSse(state.reply), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  const counter = new DailyCounter(LIMITS as unknown as KVNamespace, { refreshMs: 0, flushMs: 0 });
  const app = createApp({ fetch: fetchMock, now, counter });
  const env: Env = {
    SHARES: SHARES as unknown as KVNamespace,
    LIMITS: LIMITS as unknown as KVNamespace,
    GEMINI_API_KEY: 'test-key',
    ALLOWED_ORIGINS: 'https://yoyo.example,http://localhost:*',
    ...opts.env,
  };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const call = async (path: string, init: RequestInit & { origin?: string | null; ip?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.origin !== null) headers.set('origin', init.origin ?? 'https://yoyo.example');
    headers.set('cf-connecting-ip', init.ip ?? '203.0.113.7');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const res = await app(new Request(`https://agent.example${path}`, { ...init, headers }), env, ctx);
    await Promise.all(waits.splice(0));
    return res;
  };
  const post = (path: string, data: unknown, extra: { origin?: string | null; ip?: string } = {}) =>
    call(path, { method: 'POST', body: JSON.stringify(data), ...extra });
  return {
    app, env, calls, state, LIMITS, SHARES, call, post,
    advance: (ms: number) => { t += ms; },
  };
}

/** Parse an SSE response body into the JSON payloads. */
export async function events(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((b) => b.startsWith('data: '))
    .map((b) => JSON.parse(b.slice(6)) as Record<string, unknown>);
}

export const chatBody = (content: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: 'visitor', text: content }],
  visitor: { returning: false, device: 'desktop' },
  mode: 'chat',
  ...extra,
});
