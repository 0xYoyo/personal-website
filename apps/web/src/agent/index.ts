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
import { BrainError, type Brain, type BrainErrorReason, type BrainOptions, type BuildHandlers, type BuildResult, type Memory, type Reply, type ReplyHandlers, type StoredBuild } from './types';

export { BrainError } from './types';
export type { Brain, BrainOptions, BuildHandlers, BuildResult, Memory, Reply, ReplyHandlers, StoredBuild } from './types';

const HOUR = 3_600_000;
/** the build hand-off line, alone after a [[build:…]] tag */
const ON_IT = /^\s*on it[.!]*\s*$/i;
/** a turn boundary among held words */
const TURN = Symbol('turn');

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
    /** words (and turn breaks) after a [[build:…]] tag, held until the reply ends (see ON_IT) */
    held: (string | typeof TURN)[] | null;
    /** a turn boundary, reported right before the next word (so never after the last one) */
    turnBreak(): void;
  }
  interface BuildTurn {
    h: BuildHandlers;
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
      case 'turn':
        if (chat?.started) {
          // the client starts a turn's first token without a space: close the last word first
          chat.words.flush();
          if (chat.held) chat.held.push(TURN);
          else chat.turnBreak();
        }
        break;
      case 'action':
        if (chat?.started) {
          if (e.action.type === 'build') {
            // the word before the tag is complete: show it before holding what follows
            chat.words.flush();
            chat.held ??= [];
          }
          chat.actions.push(e.action);
          chat.h.onAction?.(e.action);
        }
        break;
      case 'end':
        // the client also ends a superseded turn; only the started one counts
        if (chat?.started) chat.mode = e.mode;
        break;
      case 'buildStart':
        if (e.notice) build?.h.onNotice?.(e.notice);
        build?.h.onAccepted?.(e.mode === 'live' ? 'live' : 'example');
        break;
      case 'buildChunk':
        build?.h.onChunk?.(e.chunk, e.html.length, e.expected);
        break;
      case 'buildDone':
        build?.resolve({
          html: e.html,
          bytes: e.html.length,
          ms: e.ms,
          title: titleOf(e.html, build.instruction),
          source: e.mode === 'live' ? 'live' : 'example',
          line: e.line,
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
      // turns[i] = the words of turn i; a boundary opens a new (empty) turn, reported on its first word
      const turns: string[][] = [[]];
      let breakPending = false;
      const show = (w: string) => {
        if (breakPending) {
          breakPending = false;
          turns.push([]);
          h.onTurn?.();
        }
        turns.at(-1)!.push(w);
        h.onWord?.(w);
      };
      const turn: ChatTurn = {
        started: false,
        words: createWordSplitter((w) => (turn.held ? turn.held.push(w) : show(w))),
        actions: [],
        h,
        mode: client.mode(),
        held: null,
        turnBreak: () => {
          if (turns.at(-1)!.length) breakPending = true;
        },
      };
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
      // A reply that hands off a build ends with "on it." (persona.md). Drop it here: the
      // shell says it from onAccepted, once the Worker has actually taken the build (POLISH1 C5).
      if (turn.held) {
        const words = turn.held.filter((x): x is string => x !== TURN);
        if (!ON_IT.test(words.join(' '))) {
          for (const x of turn.held) {
            if (x === TURN) turn.turnBreak();
            else show(x);
          }
        }
      }
      const texts = turns.map((t) => t.join(' ')).filter(Boolean);
      return { text: texts.join(' '), turns: texts, actions: turn.actions, source: turn.mode };
    },

    build(instruction, h = {}, o = {}): Promise<BuildResult> {
      // A courtesy pre-check per browser. The real cap (5/hour per IP) is the Worker's; its
      // `429 rate` on /build also rejects with `cap` (client maps 'rate' → 'cap' below).
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
        const turn: BuildTurn = { h, instruction, resolve, reject };
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
