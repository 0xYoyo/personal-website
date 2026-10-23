import { describe, expect, it } from 'vitest';
import { frame, readSseData, sseStream } from '../src/sse';
import { textDeltas } from '../src/gemini';
import { geminiSse } from './helpers';

const dec = new TextDecoder();

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

async function* from(xs: string[], failAt = -1) {
  for (let i = 0; i < xs.length; i++) {
    if (i === failAt) throw new Error('boom');
    yield xs[i]!;
  }
}

describe('SSE framing', () => {
  it('frames one JSON object per data line with a blank line after', () => {
    expect(dec.decode(frame({ type: 'token', text: 'a "b"\n' }))).toBe('data: {"type":"token","text":"a \\"b\\"\\n"}\n\n');
    expect(dec.decode(frame({ type: 'done' }))).toBe('data: {"type":"done"}\n\n');
  });

  it('streams deltas then done', async () => {
    const body = await new Response(sseStream(from(['he', 'llo']))).text();
    expect(body).toBe('data: {"type":"token","text":"he"}\n\ndata: {"type":"token","text":"llo"}\n\ndata: {"type":"done"}\n\n');
  });

  it('adds a byte count on done when asked', async () => {
    const body = await new Response(sseStream(from(['é']), { kind: 'build' })).text();
    expect(body).toBe('data: {"type":"chunk","html":"é"}\n\ndata: {"type":"done","bytes":2}\n\n');
  });

  it('turns a mid-stream throw into an error event and closes', async () => {
    const body = await new Response(sseStream(from(['a', 'b'], 1))).text();
    expect(body).toBe('data: {"type":"token","text":"a"}\n\ndata: {"type":"error","reason":"upstream"}\n\n');
  });
});

describe('upstream SSE reader', () => {
  it('reassembles events split at arbitrary byte boundaries (incl. multibyte)', async () => {
    for (const split of [1, 2, 3, 5, 64]) {
      const out = await collect(textDeltas(geminiSse(['שלום ', '🚀 ', 'done.'], split)));
      expect(out).toEqual(['שלום ', '🚀 ', 'done.']);
    }
  });

  it('handles a final event with no trailing blank line', async () => {
    const enc = new TextEncoder();
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"a":1}\n\ndata: {"b":2}'));
        c.close();
      },
    });
    expect(await collect(readSseData(s))).toEqual(['{"a":1}', '{"b":2}']);
  });
});
