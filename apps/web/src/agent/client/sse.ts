import { isBuildEvent, isChatEvent } from '@yoyo/protocol';

// Minimal SSE reader for fetch() bodies: yields each event's `data:` payload.

export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const raw = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const data = dataOf(raw);
        if (data !== null) yield data;
      }
    }
    buf += dec.decode();
    const tail = dataOf(buf);
    if (tail !== null && tail.trim()) yield tail;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

function dataOf(raw: string): string | null {
  const lines = raw.split(/\r?\n/).filter((l) => l.startsWith('data:'));
  if (!lines.length) return null;
  return lines.map((l) => l.slice(5).replace(/^ /, '')).join('\n');
}

export type WireEvent = { kind: 'text'; text: string } | { kind: 'done' } | { kind: 'error'; reason: string };

/**
 * One SSE `data:` payload → event. The wire is the `@yoyo/protocol` framing:
 * `/chat` sends `ChatEvent` (`{type:'token', text}`), `/build` sends `BuildEvent`
 * (`{type:'chunk', html}`); both end with `{type:'done'}` or `{type:'error', reason}`.
 */
export function parseWire(data: string): WireEvent | null {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return null;
  }
  if (isChatEvent(v)) {
    if (v.type === 'token') return { kind: 'text', text: v.text };
    if (v.type === 'error') return { kind: 'error', reason: v.reason };
    return { kind: 'done' };
  }
  if (isBuildEvent(v)) {
    if (v.type === 'chunk') return { kind: 'text', text: v.html };
    if (v.type === 'error') return { kind: 'error', reason: v.reason };
    return { kind: 'done' };
  }
  return null;
}
