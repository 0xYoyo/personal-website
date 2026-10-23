import type { BrainEvent } from '../brain';
import type { StorageLike } from '../memory';

export class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const enc = new TextEncoder();

export function sseResponse(payloads: unknown[], opts: { delayMs?: number; status?: number } = {}): Response {
  const frames = payloads.map((p) => enc.encode(`data: ${JSON.stringify(p)}\n\n`));
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(c) {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        if (i >= frames.length) return c.close();
        c.enqueue(frames[i++]!);
      },
    }),
    { status: opts.status ?? 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

export const tokens = (...ts: string[]) => [...ts.map((text) => ({ type: 'token', text })), { type: 'done' }];

export type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

export function mockFetch(handlers: Handler[] | Handler) {
  const calls: { url: string; body: unknown }[] = [];
  let n = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const h = Array.isArray(handlers) ? handlers[Math.min(n, handlers.length - 1)]! : handlers;
    n++;
    return h(url, init ?? {});
  }) as typeof fetch;
  return { fetch: f, calls };
}

/** A fetch that never answers until aborted. */
export const hang: Handler = (_url, init) =>
  new Promise<Response>((_res, rej) => {
    init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  });

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function recorder() {
  const events: BrainEvent[] = [];
  return {
    events,
    onEvent: (e: BrainEvent) => void events.push(e),
    text: () => events.filter((e): e is Extract<BrainEvent, { type: 'token' }> => e.type === 'token').map((e) => e.text).join(''),
    actions: () => events.filter((e): e is Extract<BrainEvent, { type: 'action' }> => e.type === 'action').map((e) => e.action),
    types: () => events.map((e) => e.type),
    clear: () => void events.splice(0),
  };
}
