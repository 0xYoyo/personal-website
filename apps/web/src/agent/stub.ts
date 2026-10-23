// Stub brain: same surface as the real one (./types), canned replies from
// faq.md, realistic streaming (600 ms to first token, then word by word),
// actions parsed from inline tags while streaming, one bundled example build
// streamed over ~8 s, memory in localStorage `yoyo.v3.*`.
import { LIMITS } from '@yoyo/protocol';
import { classify } from './classify';
import exampleHtml from './examples/pomodoro.html?raw';
import { createMemory } from './memory';
import { hashShareUrl } from './share';
import { createTagStream } from './tags';
import { BrainError, type Brain, type BrainOptions, type BuildResult, type Reply } from './types';

const FIRST_TOKEN_MS = 600;
const WORD_MS = 85;
const BUILD_MS = 8000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new BrainError('aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new BrainError('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Split raw text into stream chunks: whole tags, whitespace runs, and words. */
export function chunkRaw(raw: string): string[] {
  return raw.match(/\[\[[^\]]*\]\]|\s+|[^\s[]+|\[/g) ?? [];
}

export const titleOf = (html: string): string => /<title>([^<]{1,60})<\/title>/i.exec(html)?.[1]?.trim() || 'build';

export function createBrain(opts: BrainOptions = {}): Brain {
  const speed = opts.speed ?? 1;
  const memory = createMemory(opts.storage);
  let expectingName = false;

  return {
    memory,
    mode: () => 'scripted',

    async send(text, h = {}, signal): Promise<Reply> {
      const input = text.slice(0, LIMITS.maxInputChars);
      const c = classify(input, { name: memory.name(), expectingName });
      expectingName = !!c.expectName;
      if (c.name) memory.setName(c.name);
      memory.setSummary(`asked: ${input.slice(0, 80)}`);

      const stream = createTagStream(
        (w) => h.onWord?.(w),
        (a) => h.onAction?.(a),
      );
      await sleep(FIRST_TOKEN_MS * speed, signal);
      const chunks = chunkRaw(c.raw);
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i]!;
        stream.push(ch);
        // pace on words only; whitespace and tags are free
        if (!/^\s+$/.test(ch) && !ch.startsWith('[[')) await sleep(WORD_MS * speed, signal);
      }
      stream.end();
      return { text: stream.text, actions: stream.actions, source: 'scripted' };
    },

    async build(instruction, h = {}, o = {}): Promise<BuildResult> {
      void instruction;
      if (memory.recentBuilds().length >= LIMITS.buildsPerHour) throw new BrainError('cap');
      const t0 = performance.now();
      const html = exampleHtml;
      const total = html.length;
      const steps = 80;
      const per = Math.ceil(total / steps);
      await sleep(900 * speed, o.signal); // the construction ring
      let sent = 0;
      while (sent < total) {
        await sleep(((BUILD_MS - 900) / steps) * speed, o.signal);
        const chunk = html.slice(sent, sent + per);
        sent += chunk.length;
        h.onChunk?.(chunk, sent, total);
      }
      return { html, bytes: total, ms: performance.now() - t0, title: titleOf(html), source: 'example' };
    },

    share: (html) => hashShareUrl(html),
  };
}
