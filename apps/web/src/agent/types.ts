// The mind's client surface. The UI depends only on this file and on
// `createBrain()` from ./index (an adapter over ./client: live SSE + the scripted brain).
//
// ── Turns (POLISH2 C1) ─────────────────────────────────────────────────────────────────────
// A reply is one or more *turns*: short blocks (≤ 22 words) the shell shows one at a time in large
// type. `send()` reports them through its handlers, in stream order:
//
//   onWord("Yoav") onWord("Zrihan.") … onTurn() onWord("He") … onWord("do.")   → promise resolves
//   └──────────── turn 1 ────────────┘          └─────────── turn 2 ──────────┘
//
//   - `onTurn()` is a boundary: every word before it belongs to a complete turn; the words after it
//     start the next one. It is never called before the first word, after the last one, or twice in
//     a row. The last turn ends when the promise resolves (`Reply.turns` has them all).
//   - Turns come from `||` in the reply text (faq.md, the live persona); the marks never reach
//     `onWord`. A live reply over 32 words without any gets turns at sentence boundaries. The
//     scripted "resting" line is always a turn of its own.
//   - Actions arrive as soon as their tag closes (`onAction`), between the words around it.
//   - A shell without `onTurn` still gets every word, in order (just no boundaries); feature-detect.
import type { Action, ProjectId, StoryId } from '@yoyo/protocol';

export interface ReplyHandlers {
  /** One display word at a time (tags and `||` already stripped). Join with single spaces. */
  onWord?(word: string): void;
  /**
   * Turn boundary: the words so far form a complete turn; the next word starts a new one. Never
   * before the first word or after the last (see the note at the top of this file).
   */
  onTurn?(): void;
  /** Allowlisted action parsed from an inline `[[...]]` tag, as soon as the tag closes. */
  onAction?(action: Action): void;
  /** The brain switched source for this turn (e.g. live → scripted). The text is a line to show first. */
  onNotice?(text: string): void;
}

export interface Reply {
  /** Full display text (tags and `||` stripped), all turns joined with single spaces */
  text: string;
  /** The reply's turns in order (at least one when `text` is non-empty); `turns.join(' ') === text` */
  turns: string[];
  actions: Action[];
  source: 'live' | 'scripted';
}

export interface BuildHandlers {
  /**
   * Called per HTML chunk; `bytes` is the running total; `expected` the total to measure progress
   * against: exact for examples; live = max(8 kB, the previous build's size), so clamp at 0.95.
   */
  onChunk?(chunk: string, bytes: number, expected?: number): void;
  /**
   * The build was accepted: live → the Worker answered 200 (a `429 rate` never gets here; it
   * rejects with `cap`), example → it starts streaming. Say `on it.` here, not before.
   */
  onAccepted?(source: 'live' | 'example'): void;
  /** A line to say before the build streams (scripted "Change it": the live builder can't change this one). */
  onNotice?(text: string): void;
}

export interface BuildResult {
  html: string;
  bytes: number;
  ms: number;
  title: string;
  source: 'live' | 'example';
  /**
   * What the agent says when the build locks. Examples: `made earlier. the live builder does this
   * in about 15 seconds.` (never claims seconds); live: the real elapsed time, `14 seconds. Want changes?`.
   */
  line: string;
}

export type BrainErrorReason = 'cap' | 'aborted' | 'failed';
export class BrainError extends Error {
  constructor(public reason: BrainErrorReason, message?: string) {
    super(message ?? reason);
    this.name = 'BrainError';
  }
}

export interface StoredBuild {
  id: string;
  title: string;
  instruction: string;
  html: string;
  at: number;
}

export interface Memory {
  name(): string | undefined;
  setName(name: string): void;
  /** Number of previous visits (0 on the first visit). */
  visits(): number;
  /** Count this visit; returns the number of visits before it. Call once per page load. */
  recordVisit(): number;
  builds(): StoredBuild[];
  addBuild(b: Omit<StoredBuild, 'id' | 'at'>): StoredBuild;
  summary(): string | undefined;
  setSummary(s: string): void;
  seenStories(): StoryId[];
  markStory(id: StoryId): void;
  sound(): boolean;
  setSound(on: boolean): void;
  voice(): boolean;
  setVoice(on: boolean): void;
  /** Timestamps (ms) of builds in the last hour, for the 5/hour cap. */
  recentBuilds(now?: number): number[];
  clear(): void;
}

export interface Brain {
  send(text: string, handlers?: ReplyHandlers, signal?: AbortSignal): Promise<Reply>;
  build(instruction: string, handlers?: BuildHandlers, opts?: { previousHtml?: string; signal?: AbortSignal }): Promise<BuildResult>;
  /** Returns a shareable URL for a build (KV permalink, or a `#b=` URL fallback). */
  share(html: string): Promise<string>;
  /** 'live' while the Worker answers; 'scripted' after quota/outage. */
  mode(): 'live' | 'scripted';
  memory: Memory;
}

export interface BrainOptions {
  /** VITE_AGENT_URL; absent → scripted only */
  agentUrl?: string;
  /** Speed multiplier for tests and QA (1 = real timing) */
  speed?: number;
  storage?: Storage;
}

export type { Action, ProjectId, StoryId };
