// SSE framing for the site — the `@yoyo/protocol` wire events:
//   /chat:  data: {"type":"token","text":"..."} … data: {"type":"done"}
//   /build: data: {"type":"chunk","html":"..."} … data: {"type":"done","bytes":N}
//   either: data: {"type":"error","reason":"upstream"} when the upstream dies mid-stream
// — and a tolerant SSE reader for the upstream Gemini stream.
import type { BuildEvent, ChatEvent } from '@yoyo/protocol';

const enc = new TextEncoder();

export type OutEvent = ChatEvent | BuildEvent;

export const frame = (e: OutEvent): Uint8Array => enc.encode(`data: ${JSON.stringify(e)}\n\n`);

export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
};

/**
 * Turns an async source of text pieces into an SSE body: `token` events for chat,
 * `chunk` events (and a byte count on `done`) for builds. Any throw mid-stream becomes
 * `{"type":"error","reason":"upstream"}` followed by a clean close, so the client never hangs.
 */
export function sseStream(
  source: AsyncIterable<string>,
  opts: { onEnd?: (bytes: number) => void; kind?: 'chat' | 'build' } = {},
): ReadableStream<Uint8Array> {
  const build = opts.kind === 'build';
  const it = source[Symbol.asyncIterator]();
  let bytes = 0;
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        const r = await it.next();
        if (r.done) {
          controller.enqueue(frame(build ? { type: 'done', bytes } : { type: 'done' }));
          closed = true;
          controller.close();
          opts.onEnd?.(bytes);
          return;
        }
        if (r.value) {
          bytes += enc.encode(r.value).length;
          controller.enqueue(frame(build ? { type: 'chunk', html: r.value } : { type: 'token', text: r.value }));
        }
      } catch {
        controller.enqueue(frame({ type: 'error', reason: 'upstream' }));
        closed = true;
        controller.close();
        opts.onEnd?.(bytes);
      }
    },
    async cancel() {
      closed = true;
      await it.return?.();
    },
  });
}

/** Yields each `data:` payload (string) from an SSE byte stream. Handles events split across chunks. */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep: number;
      while ((sep = buf.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep).replace(/^\r?\n\r?\n/, '');
        const data = dataOf(raw);
        if (data !== null) yield data;
      }
    }
    buf += dec.decode();
    const tail = dataOf(buf);
    if (tail !== null && tail.trim()) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function dataOf(raw: string): string | null {
  const lines = raw.split(/\r?\n/).filter((l) => l.startsWith('data:'));
  if (!lines.length) return null;
  return lines.map((l) => l.slice(5).replace(/^ /, '')).join('\n');
}
