// createBrain — chooses live vs scripted per turn, streams replies through the
// tag parser, dispatches actions as events, and keeps visitor memory.

import { captureName, strongLocal } from './intents';
import { ROUTE_TIMEOUT_MS, routedReply } from './route';
import { streamLive, type LiveFailure } from './live';
import { createBrainState, createMemory, defaultStorage, localDay, safeStorage, type Memory, type StorageLike } from './memory';
import type { Action, BuildRequest, ChatMessage, ChatRequest, GlyphId, ProjectId } from '@yoyo/protocol';
import { scriptedReply, withRestingLine, wordPieces } from './scripted';
import { shareHtml, type ShareResult } from './share';
import { createTagStream } from './tags';
import { createPacer, paceReply } from './pace';
import { createTurnSplitter } from './turns';
import { CHANGE_RESTING_LINE, CHANGE_SAME_LINE, EXAMPLE_DONE_LINE, liveDoneLine } from './lines';
import { pickExampleId } from './pick-example';
import { AbortedError, DEFAULT_TIMING, jittered, readMs, sleep, tokensIn, type Timing } from './timing';

export type BrainMode = 'live' | 'scripted';

export type BrainEvent =
  | { type: 'start' }
  | { type: 'token'; text: string }
  /**
   * A boundary between two turns of one reply (POLISH2 C1): the tokens before it are a complete
   * turn, the tokens after it start the next. Never first or last in a reply, never two in a row.
   * Turns come from `||` marks in the reply (stripped); a live reply over 32 words with none gets
   * them at sentence boundaries (./pace).
   */
  | { type: 'turn' }
  | { type: 'action'; action: Action }
  | { type: 'end'; mode: BrainMode }
  /**
   * A line to say before the build (scripted "Change it": the live builder can't change this one,
   * here's the closest). The brain waits its read time (Timing.readPerWordMs / readMinMs) before
   * `buildStart`, so the line completes before "on it." (POLISH2 C2).
   */
  | { type: 'buildNotice'; text: string }
  /**
   * Emitted once when a build is accepted: live → the Worker answered 200 (so a 429 never
   * gets an "on it." first); scripted → the example starts streaming (its first chunk follows).
   */
  | { type: 'buildStart'; mode: BrainMode; example?: string }
  /**
   * `html` is everything received so far; `chunk` the new bytes; `expected` the byte total the
   * progress is measured against (exact for examples; live: max(8 kB, the previous build's size));
   * `progress` = bytes / expected, clamped to 0.95 until done when live.
   */
  | { type: 'buildChunk'; html: string; chunk: string; progress: number; expected: number }
  /**
   * `line` is what the agent says at the end (examples never claim seconds; live reports the real time).
   * `unchanged`: scripted "Change it" whose closest example is the one on screen — no buildStart,
   * no chunks; `html` is that same page and `line` says it stays as it is.
   */
  | { type: 'buildDone'; html: string; ms: number; mode: BrainMode; example?: string; line: string; unchanged?: boolean }
  | { type: 'error'; reason: BrainErrorReason };

export type BrainErrorReason = 'rate' | 'aborted' | 'too_long' | 'build_failed';

export type { ChatMessage };

export interface BrainOptions {
  /** Worker base URL (VITE_AGENT_URL). Omit/empty → scripted only. */
  agentUrl?: string;
  /** glyph ids the swarm can draw (decides glyph vs text for [[become:x]]) */
  swarmGlyphs: readonly GlyphId[];
  onEvent(e: BrainEvent): void;
  // --- optional, mostly for tests and the integrator ---
  fetch?: typeof fetch;
  storage?: StorageLike | null;
  sessionStorage?: StorageLike | null;
  now?: () => number;
  random?: () => number;
  timing?: Partial<Timing>;
  /** base for `#b=` share links; default location.origin + location.pathname */
  siteUrl?: string;
  device?: 'desktop' | 'mobile';
  lang?: string;
  /** budget for the live reply to start (the router's whole answer); default 2500 (WAVE4 A3) */
  firstTokenTimeoutMs?: number;
  /** let `build()` call the Worker's model; default false: builds stream the prebuilt examples (WAVE4 A4) */
  liveBuilds?: boolean;
  /** default 2 */
  retries?: number;
  /** first-chunk budget for live builds; default 20000 */
  buildFirstChunkTimeoutMs?: number;
}

export interface Brain {
  send(text: string): Promise<void>;
  /** Stops the current reply and the current build. */
  abort(): void;
  /** Stops only the current reply (its `end` is emitted right away). */
  abortChat(): void;
  /** Stops only the current build (emits `error: aborted`). */
  abortBuild(): void;
  build(instruction: string, previousHtml?: string): Promise<void>;
  share(html: string): Promise<ShareResult>;
  readonly memory: Memory;
  mode(): BrainMode;
  /** the conversation so far, raw (tags included), oldest first */
  history(): readonly ChatMessage[];
}

export const LIMITS = { messageChars: 600, historyMessages: 12, buildInstructionChars: 400 } as const;
/** floor for the live progress estimate (POLISH1 A3) */
export const MIN_EXPECTED_BUILD_BYTES = 8_000;
const MAX_LIVE_FAILURES = 2;

export function createBrain(opts: BrainOptions): Brain {
  const agentUrl = (opts.agentUrl ?? '').trim().replace(/\/+$/, '') || null;
  const fetchImpl = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const timing: Timing = { ...DEFAULT_TIMING, ...opts.timing };
  const local = safeStorage(opts.storage === undefined ? defaultStorage('localStorage') : opts.storage);
  const memory = createMemory({ local, session: opts.sessionStorage === undefined ? defaultStorage('sessionStorage') : opts.sessionStorage, now });
  const state = createBrainState(local);
  const emitRaw = (e: BrainEvent) => {
    try {
      opts.onEvent(e);
    } catch (err) {
      console.error('brain: onEvent threw', err);
    }
  };
  const emit = emitRaw;

  let liveFailures = 0;
  let sessionScripted = false;
  let restingShown = false;
  let lastShown: ProjectId | null = null;
  /** build instructions the scripted brain handed off: it said "the live builder is resting", so they get an example */
  const scriptedHandoffs = new Set<string>();
  type Turn = { ctrl: AbortController; mode: BrainMode };
  let chatTurn: Turn | null = null;
  let buildTurn: Turn | null = null;
  const history: ChatMessage[] = [];

  const online = () => (typeof navigator === 'undefined' || navigator.onLine !== false);

  function mode(): BrainMode {
    if (!agentUrl || sessionScripted) return 'scripted';
    if (state.scriptedDay() === localDay(now())) return 'scripted';
    if (!online()) return 'scripted';
    return 'live';
  }

  function noteFailure(reason: LiveFailure) {
    if (reason === 'aborted' || reason === 'too_long') return;
    if (reason === 'quota') {
      state.setScriptedDay(localDay(now()));
      return;
    }
    if (reason === 'rate') return; // this visitor is fast, the brain is fine
    liveFailures += 1;
    if (liveFailures >= MAX_LIVE_FAILURES) sessionScripted = true;
  }

  function device(): 'desktop' | 'mobile' {
    if (opts.device) return opts.device;
    try {
      if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 'mobile';
      if (typeof innerWidth === 'number' && innerWidth < 768) return 'mobile';
    } catch {
      /* not a browser */
    }
    return 'desktop';
  }

  function visitor() {
    const lang = opts.lang ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
    const name = memory.name;
    return { ...(name ? { name } : {}), returning: memory.visits > 1, device: device(), ...(lang ? { lang } : {}) };
  }

  function remember(user: string, raw: string) {
    history.push({ role: 'visitor', text: user }, { role: 'agent', text: raw });
    while (history.length > LIMITS.historyMessages) history.shift();
  }

  /**
   * Feeds raw model text through the pacer (live only), the tag parser and the turn splitter,
   * and emits token / action / turn events.
   */
  function makeSink(emit: (e: BrainEvent) => void, scripted = false) {
    const pacer = scripted ? null : createPacer();
    const parser = createTagStream({ glyphs: opts.swarmGlyphs });
    const turns = createTurnSplitter(emit);
    const out = (r: { text: string; actions: Action[] }) => {
      if (r.text) turns.text(r.text);
      for (const a of r.actions) {
        if (a.type === 'show') lastShown = a.project;
        if (a.type === 'build' && scripted) scriptedHandoffs.add(a.instruction);
        turns.action(a);
      }
    };
    // Feed the parser up to each `]]` at a time, so the text before a tag is emitted before its
    // action (the parser reports a chunk's actions and text separately).
    const feed = (s: string) => {
      for (const piece of s.split(/(?<=\]\])/)) if (piece) out(parser.push(piece));
    };
    return {
      push: (chunk: string) => feed(pacer ? pacer.push(chunk) : chunk),
      end: () => {
        if (pacer) feed(pacer.end());
        out(parser.end());
        turns.end();
      },
    };
  }

  async function streamScripted(raw: string, signal: AbortSignal, temit: (e: BrainEvent) => void, lead = true) {
    const sink = makeSink(temit, true);
    // the copy is paced with `||` already; this only splits a turn that runs long (pace.ts)
    const pieces = wordPieces(paceReply(raw));
    // `lead` false: a routed reply, whose wait was the router call itself
    if (lead) await sleep(jittered(timing.firstTokenMs, timing.jitter, random), signal);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      sink.push(p);
      if (i < pieces.length - 1) await sleep(jittered(timing.perTokenMs * tokensIn(p.trim()), timing.jitter, random), signal);
    }
    sink.end();
  }

  /** Stops the current reply; the UI gets its `end` right away and nothing more from that turn. */
  function abortChat() {
    const t = chatTurn;
    if (!t) return;
    chatTurn = null;
    t.ctrl.abort();
    emit({ type: 'end', mode: t.mode });
  }
  function abortBuild() {
    const t = buildTurn;
    if (!t) return;
    buildTurn = null;
    t.ctrl.abort();
    emit({ type: 'error', reason: 'aborted' });
  }

  async function send(input: string): Promise<void> {
    abortChat();
    const ctrl = new AbortController();
    const turn: Turn = { ctrl, mode: mode() };
    chatTurn = turn;
    const temit = (e: BrainEvent) => {
      if (chatTurn === turn) emit(e);
    };
    const finish = (m: BrainMode) => {
      if (chatTurn !== turn) return;
      chatTurn = null;
      emit({ type: 'end', mode: m });
    };
    const text = [...input.trim()].slice(0, LIMITS.messageChars).join('');
    emit({ type: 'start' });
    if (!text) {
      finish(turn.mode);
      return;
    }
    const name = captureName(text);
    if (name) memory.setName(name);
    memory.noteVisitorLine(text);

    let resting = false;
    // WAVE4 A3: what the scripted brain answers for sure never waits on the model
    if (turn.mode === 'live' && !strongLocal(text)) {
      // something to watch while the router decides: the swarm gathers into its listening ring
      temit({ type: 'action', action: { type: 'mood', mood: 'listening' } });
      const settle = () => temit({ type: 'action', action: { type: 'mood', mood: 'thinking' } });
      const sink = makeSink(temit);
      const outcome = await streamLive({
        url: `${agentUrl}/chat`,
        body: { messages: [...history, { role: 'visitor', text }], visitor: visitor() } satisfies ChatRequest,
        fetchImpl,
        signal: ctrl.signal,
        firstTokenMs: opts.firstTokenTimeoutMs ?? ROUTE_TIMEOUT_MS,
        retries: opts.retries ?? 2,
        idleMs: 15_000,
        onOpen: settle,
        onText: (t) => sink.push(t),
        now,
      });
      if (outcome.ok && outcome.route) {
        // a scripted intent plays its exact copy; a gap plays the model's clamped turns
        settle();
        const raw = routedReply(outcome.route, text, { name: memory.name, lastShown, random });
        try {
          await streamScripted(raw, ctrl.signal, temit, false);
          remember(text, raw);
        } catch (e) {
          if (!(e instanceof AbortedError)) throw e;
        } finally {
          finish('live');
        }
        return;
      }
      if (!outcome.ok && outcome.reason !== 'aborted' && !outcome.partial) settle();
      if (outcome.ok || outcome.partial || outcome.reason === 'aborted') {
        sink.end();
        if (!outcome.ok) noteFailure(outcome.reason);
        if (outcome.ok || outcome.partial) remember(text, outcome.raw);
        finish('live');
        return;
      }
      noteFailure(outcome.reason);
      // a slow router falls back silently to the scripted best match; an unreachable Worker says so once, as before
      resting = outcome.reason !== 'too_long' && outcome.reason !== 'timeout';
      turn.mode = 'scripted';
    } else if (agentUrl && (sessionScripted || state.scriptedDay() === localDay(now()) || !online())) {
      resting = true;
    }

    const ctx = { name: memory.name, lastShown, random };
    let { raw } = scriptedReply(text, ctx);
    if (resting && !restingShown) {
      raw = withRestingLine(raw);
      restingShown = true;
    }
    try {
      await streamScripted(raw, ctrl.signal, temit);
      remember(text, raw);
    } catch (e) {
      if (!(e instanceof AbortedError)) throw e;
    } finally {
      finish('scripted');
    }
  }

  async function build(instructionIn: string, previousHtml?: string): Promise<void> {
    abortBuild();
    const ctrl = new AbortController();
    const turn: Turn = { ctrl, mode: mode() };
    buildTurn = turn;
    const emit = (e: BrainEvent) => {
      if (buildTurn === turn) emitRaw(e);
    };
    const t0 = now();
    const instruction = [...instructionIn.trim()].slice(0, LIMITS.buildInstructionChars).join('');
    if (!instruction) {
      emit({ type: 'error', reason: 'build_failed' });
      buildTurn = null;
      return;
    }
    const handedOff = scriptedHandoffs.delete(instruction);
    try {
      if (instruction !== 'example' && !handedOff && turn.mode === 'live' && opts.liveBuilds === true) {
        let html = '';
        const expected = Math.max(MIN_EXPECTED_BUILD_BYTES, memory.builds[0]?.bytes ?? 0);
        const outcome = await streamLive({
          url: `${agentUrl}/build`,
          body: (previousHtml ? { instruction, previousHtml } : { instruction }) satisfies BuildRequest,
          fetchImpl,
          signal: ctrl.signal,
          firstTokenMs: opts.buildFirstChunkTimeoutMs ?? 20_000,
          retries: 1,
          idleMs: 20_000,
          onOpen: () => emit({ type: 'buildStart', mode: 'live' }),
          onText: (chunk) => {
            html += chunk;
            emit({ type: 'buildChunk', html, chunk, expected, progress: Math.min(0.95, html.length / expected) });
          },
          now,
        });
        if (outcome.ok && /<[a-z!]/i.test(outcome.raw)) {
          const final = cleanHtml(outcome.raw);
          const ms = now() - t0;
          memory.addBuild({ instruction, at: t0, ms, bytes: final.length, mode: 'live', html: final });
          emit({ type: 'buildDone', html: final, ms, mode: 'live', line: liveDoneLine(ms) });
          return;
        }
        if (!outcome.ok && outcome.reason === 'aborted') {
          emit({ type: 'error', reason: 'aborted' });
          return;
        }
        if (!outcome.ok && outcome.reason === 'rate') {
          emit({ type: 'error', reason: 'rate' });
          return;
        }
        if (!outcome.ok && outcome.reason === 'too_long') {
          emit({ type: 'error', reason: 'too_long' });
          return;
        }
        noteFailure(outcome.ok ? 'empty' : outcome.reason);
      }
      turn.mode = 'scripted';
      await scriptedBuild(instruction, t0, ctrl.signal, emit, previousHtml);
    } catch (e) {
      if (!(e instanceof AbortedError)) {
        console.error('brain: build failed', e);
        emit({ type: 'error', reason: 'build_failed' });
      }
    } finally {
      if (buildTurn === turn) buildTurn = null;
    }
  }

  async function scriptedBuild(
    instruction: string,
    t0: number,
    signal: AbortSignal,
    emit: (e: BrainEvent) => void,
    previousHtml?: string,
  ) {
    const { EXAMPLES } = await import('./examples');
    // The instruction decides (POLISH1 C1). A change request with no keyword of its own
    // stays with the app it is changing (the same example, else its <title>), else rotate.
    const prevId = (): string | null => {
      if (!previousHtml) return null;
      const same = EXAMPLES.find((e) => e.html === previousHtml);
      if (same) return same.id;
      const title = /<title>([^<]{1,80})<\/title>/i.exec(previousHtml)?.[1];
      return title ? pickExampleId(title) : null;
    };
    const id = instruction === 'example' ? null : pickExampleId(instruction) ?? prevId();
    let ex = id ? EXAMPLES.find((e) => e.id === id) : undefined;
    ex ??= EXAMPLES[state.nextExampleIndex(EXAMPLES.length)]!;
    if (previousHtml !== undefined && ex.html === previousHtml) {
      // the closest is what's already on screen: say so, don't re-stream it (POLISH2 C2)
      emit({ type: 'buildDone', html: ex.html, ms: now() - t0, mode: 'scripted', example: ex.id, line: CHANGE_SAME_LINE, unchanged: true });
      return;
    }
    if (previousHtml !== undefined) {
      emit({ type: 'buildNotice', text: CHANGE_RESTING_LINE });
      await sleep(readMs(CHANGE_RESTING_LINE, timing), signal);
    }
    const html = ex.html;
    await sleep(jittered(timing.buildFirstChunkMs, timing.jitter, random), signal);
    emit({ type: 'buildStart', mode: 'scripted', example: ex.id });
    const ticks = Math.max(1, Math.round((timing.buildTotalMs - timing.buildFirstChunkMs) / Math.max(1, timing.buildTickMs)));
    const size = Math.ceil(html.length / ticks);
    let sent = 0;
    while (sent < html.length) {
      // Vary chunk size like a real stream (0.5x–1.5x).
      const n = Math.max(1, Math.round(size * (0.5 + random())));
      const chunk = html.slice(sent, sent + n);
      sent += chunk.length;
      emit({ type: 'buildChunk', html: html.slice(0, sent), chunk, expected: html.length, progress: sent / html.length });
      if (sent < html.length) await sleep(timing.buildTickMs, signal);
    }
    const ms = now() - t0;
    memory.addBuild({ instruction, at: t0, ms, bytes: html.length, mode: 'scripted', example: ex.id });
    emit({ type: 'buildDone', html, ms, mode: 'scripted', example: ex.id, line: EXAMPLE_DONE_LINE });
  }

  function siteUrl(): string {
    if (opts.siteUrl) return opts.siteUrl;
    try {
      return `${location.origin}${location.pathname}`;
    } catch {
      return '';
    }
  }

  return {
    send,
    abort() {
      abortChat();
      abortBuild();
    },
    abortChat,
    abortBuild,
    build,
    share: (html: string) => shareHtml({ html, agentUrl, siteUrl: siteUrl(), fetchImpl, live: mode() === 'live' }),
    memory,
    mode,
    history: () => history.slice(),
  };
}

/** Defence in depth: the Worker already strips fences; keep the client honest too. */
export function cleanHtml(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[^<`]*```[\w-]*\s*\n?/, '');
  s = s.replace(/\n?```\s*$/, '');
  const end = s.search(/<\/html\s*>/i);
  if (end !== -1) s = s.slice(0, end + s.slice(end).indexOf('>') + 1);
  return s.trim();
}
