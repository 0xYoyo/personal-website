// The mind's client surface. The UI depends only on this file and on
// `createBrain()` from ./index. The stub implements it now; the agent part
// (live SSE + scripted brain) replaces the implementation in integration.
import type { Action, ProjectId, StoryId } from '@yoyo/protocol';

export interface ReplyHandlers {
  /** One display word at a time (tags already stripped). Join with single spaces. */
  onWord?(word: string): void;
  /** Allowlisted action parsed from an inline `[[...]]` tag, as soon as the tag closes. */
  onAction?(action: Action): void;
  /** The brain switched source for this turn (e.g. live → scripted). The text is a line to show first. */
  onNotice?(text: string): void;
}

export interface Reply {
  /** Full display text (tags stripped) */
  text: string;
  actions: Action[];
  source: 'live' | 'scripted';
}

export interface BuildHandlers {
  /** Called per HTML chunk; `bytes` is the running total; `expected` is known only for examples. */
  onChunk?(chunk: string, bytes: number, expected?: number): void;
}

export interface BuildResult {
  html: string;
  bytes: number;
  ms: number;
  title: string;
  source: 'live' | 'example';
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
