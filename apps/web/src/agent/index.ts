// The mind, as the shell sees it. A thin adapter over the agent client
// (./client: live SSE with the scripted fallback, tag parsing, memory, share):
// the client reports everything through one `onEvent` stream; the shell wants a
// promise per reply / build with per-call handlers. This file routes the event
// stream to the call in flight and maps the client's memory onto the shell's
// `Memory`, so neither side had to change shape.
import { GLYPH_IDS, LIMITS, type Action } from '@yoyo/protocol';
import { createBrain as createClient, DEFAULT_TIMING, decodeShareHash, type BrainEvent, type Timing } from './client';
import { EXAMPLE_TITLES } from './client/examples-meta';
import { createMemory as createLocalPrefs } from './memory';
import { BrainError, type Brain, type BrainErrorReason, type BrainOptions, type BuildResult, type Memory, type Reply, type ReplyHandlers, type StoredBuild } from './types';

export { BrainError } from './types';
export type { Brain, BrainOptions, BuildHandlers, BuildResult, Memory, Reply, ReplyHandlers, StoredBuild } from './types';

const HOUR = 3_600_000;

/** `<title>` of a build, else a short form of the instruction. */
export const titleOf = (html: string, fallback = 'build'): string =>
  /<title>([^<]{1,60})<\/title>/i.exec(html)?.[1]?.trim() || fallback.slice(0, 40) || 'build';

/** Turns streamed text pieces (which split words anywhere) into whole display words. */
export function createWordSplitter(onWord: (w: string) => void) {
  let buf = '';
  const words: string[] = [];
  const emit = (w: string) => {
    words.push(w);
    onWord(w);
  };
  return {
    push(text: string) {
      buf += text;
      const parts = buf.split(/\s+/);
      buf = parts.pop() ?? '';
      for (const w of parts) if (w) emit(w);
    },
    flush() {
      if (buf.trim()) emit(buf.trim());
      buf = '';
    },
    text: () => words.join(' '),
  };
}

const scaled = (speed: number): Timing =>
  Object.fromEntries(Object.entries(DEFAULT_TIMING).map(([k, v]) => [k, k === 'jitter' ? v : v * speed])) as unknown as Timing;

export function createBrain(opts: BrainOptions = {}): Brain {
  interface ChatTurn {
    started: boolean;
    words: ReturnType<typeof createWordSplitter>;
    actions: Action[];
    h: ReplyHandlers;
    mode: 'live' | 'scripted';
  }
  interface BuildTurn {
    onChunk: ((chunk: string, bytes: number, expected?: number) => void) | undefined;
    instruction: string;
    resolve(r: BuildResult): void;
    reject(e: BrainError): void;
  }
  let chat: ChatTurn | null = null;
  let build: BuildTurn | null = null;

  const onEvent = (e: BrainEvent) => {
    switch (e.type) {
      case 'start':
        if (chat) chat.started = true;
        break;
      case 'token':
        if (chat?.started) chat.words.push(e.text);
        break;
      case 'action':
        if (chat?.started) {
          chat.actions.push(e.action);
          chat.h.onAction?.(e.action);
        }
        break;
      case 'end':
        // the client also ends a superseded turn; only the started one counts
        if (chat?.started) chat.mode = e.mode;
        break;
      case 'buildStart':
        break;
      case 'buildChunk':
        // the client's progress is exact for examples and estimated live; hand the shell the implied total
        build?.onChunk?.(e.chunk, e.html.length, e.progress > 0 ? Math.round(e.html.length / e.progress) : undefined);
        break;
      case 'buildDone':
        build?.resolve({
          html: e.html,
          bytes: e.html.length,
          ms: e.ms,
          title: titleOf(e.html, build.instruction),
          source: e.mode === 'live' ? 'live' : 'example',
        });
        build = null;
        break;
      case 'error': {
        const reason: BrainErrorReason = e.reason === 'aborted' ? 'aborted' : e.reason === 'rate' ? 'cap' : 'failed';
        build?.reject(new BrainError(reason));
        build = null;
        break;
      }
    }
  };

  const client = createClient({
    agentUrl: opts.agentUrl ?? '',
    swarmGlyphs: GLYPH_IDS,
    onEvent,
    ...(opts.storage !== undefined ? { storage: opts.storage } : {}),
    ...(opts.speed !== undefined && opts.speed !== 1 ? { timing: scaled(opts.speed) } : {}),
  });

  // Visitor facts (name, visits, builds, summary) live in the client's memory; the
  // shell-only preferences (stories seen, sound, voice) keep their own keys.
  const prefs = createLocalPrefs(opts.storage);
  const cm = client.memory;
  const toStored = (b: (typeof cm.builds)[number]): StoredBuild => ({
    id: String(b.at),
    title: titleOf(b.html ?? '', (b.example && EXAMPLE_TITLES[b.example]) || b.instruction),
    instruction: b.instruction,
    html: b.html ?? '',
    at: b.at,
  });
  const memory: Memory = {
    name: () => cm.name ?? undefined,
    setName: (n) => cm.setName(n),
    visits: () => cm.visits,
    // the client counts the visit once per browser session when it starts; report the ones before it
    recordVisit: () => Math.max(0, cm.visits - 1),
    builds: () => cm.builds.map(toStored),
    // the client records every finished build itself (with timing and mode)
    addBuild: (b) => ({ ...b, id: String(Date.now()), at: Date.now() }),
    summary: () => cm.summary || undefined,
    // the client keeps the summary from the visitor's own lines
    setSummary: () => undefined,
    seenStories: prefs.seenStories,
    markStory: prefs.markStory,
    sound: prefs.sound,
    setSound: prefs.setSound,
    voice: prefs.voice,
    setVoice: prefs.setVoice,
    recentBuilds: (now = Date.now()) => cm.builds.map((b) => b.at).filter((t) => now - t < HOUR),
    clear() {
      cm.forget();
      prefs.clear();
    },
  };

  return {
    memory,
    mode: () => client.mode(),

    async send(text, h = {}, signal): Promise<Reply> {
      if (signal?.aborted) throw new BrainError('aborted');
      const turn: ChatTurn = { started: false, words: createWordSplitter((w) => h.onWord?.(w)), actions: [], h, mode: client.mode() };
      chat = turn;
      const onAbort = () => {
        if (chat === turn) client.abortChat();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        await client.send(text);
      } finally {
        signal?.removeEventListener('abort', onAbort);
        if (chat === turn) chat = null;
      }
      if (signal?.aborted) throw new BrainError('aborted');
      turn.words.flush();
      return { text: turn.words.text(), actions: turn.actions, source: turn.mode };
    },

    build(instruction, h = {}, o = {}): Promise<BuildResult> {
      if (memory.recentBuilds().length >= LIMITS.buildsPerHour) return Promise.reject(new BrainError('cap'));
      if (!instruction.trim()) return Promise.reject(new BrainError('failed'));
      if (o.signal?.aborted) return Promise.reject(new BrainError('aborted'));
      // a build in flight is superseded: settle it here, then let the client abort it
      // (its synchronous "aborted" event arrives while no build is routed)
      const prev = build;
      build = null;
      prev?.reject(new BrainError('aborted'));
      return new Promise<BuildResult>((resolve, reject) => {
        void client.build(instruction, o.previousHtml);
        const turn: BuildTurn = { onChunk: h.onChunk, instruction, resolve, reject };
        build = turn;
        o.signal?.addEventListener(
          'abort',
          () => {
            if (build === turn) client.abortBuild();
          },
          { once: true },
        );
      });
    },

    share: async (html) => (await client.share(html)).url,
  };
}

/** A build shared as `#b=<lz-string>` (the client's hash links), if the URL carries one. */
export async function readSharedFromHash(hash = location.hash): Promise<string | null> {
  return decodeShareHash(hash);
}
