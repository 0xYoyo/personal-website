import type React from 'react';

/** The contract every section folder exports from its index.ts. */
export interface SectionModule {
  id: 'hero' | 'loop' | 'projects' | 'early' | 'gitlog' | 'now' | 'stack' | 'contact';
  pr: number;
  title: string;
  branch: string;
  spec: { acceptance: string[]; nonGoals: string[] }; // shown in the PR card "Spec" tab
  reviewNote: string; // the dry true remark
  source: string; // raw excerpt streamed in the diff
  Component: React.ComponentType;
  /** Kept for compatibility; no longer used for layout. A slot is as tall as its PR card (POLISH_WAVE A). */
  minHeight: number;
  /** File the diff excerpt comes from, shown in the PR card's diff header. Defaults to Component.tsx. */
  sourcePath?: string;
}

export type SectionId = SectionModule['id'];

/** The parts of a SectionModule the factory store and scheduler need. */
export type SectionMeta = Pick<SectionModule, 'id' | 'pr' | 'title' | 'branch' | 'reviewNote'> & {
  sourceLines: number;
  sourceChars: number;
  /** File the diff excerpt comes from (logged while the PR builds). */
  sourcePath?: string;
  /** The excerpt itself, so every line counter paces off the same characters as the diff. */
  source?: string;
};

export type PRState = 'queued' | 'building' | 'ci' | 'review' | 'awaiting-merge' | 'merged';

export const PR_STATES: readonly PRState[] = ['queued', 'building', 'ci', 'review', 'awaiting-merge', 'merged'];

/** Who or what merged a PR. */
/** 'command' is /yoyo-merge-all from the command palette. */
export type MergeSource = 'init' | 'human' | 'scroll' | 'autopilot' | 'command' | 'skip';

export const CI_CHECKS = ['typecheck', 'lint', 'tests'] as const;
export type CICheck = (typeof CI_CHECKS)[number];

export interface SectionRuntime {
  id: SectionId;
  state: PRState;
  /** Date.now() when the current state was entered. */
  stateSince: number;
  /** Planned building duration (ms), set when building starts; DiffStream paces itself to it. */
  buildMs: number;
  /** How many CI checks have passed (0..3). */
  ciPassed: number;
  /** Set while being fast-forwarded (scrolled past, or /yoyo-merge-all); the merge source to use. */
  rushing: MergeSource | null;
  mergedBy: MergeSource | null;
  /** ms since the loop started when it merged (null until merged, and for skipped/returning visits). */
  mergedAt: number | null;
  /** A human merge made with the `m` key. */
  mergedVia: 'keyboard' | null;
  /** Merged as part of a fast-forward of everything still open (bottom of the page, /yoyo-merge-all): no choreography. */
  instant: boolean;
}

export type LogTag = 'init' | 'build' | 'checks' | 'review' | 'wait' | 'merged' | 'lights' | 'loop';

export interface LogEntry {
  id: number;
  /** ms since the loop started */
  t: number;
  tag: LogTag;
  text: string;
}

export type Mode = 'manual' | 'autopilot';

/** How each PR got merged this run. `hand` is a pointer/touch press; `keyboard` the `m` key. */
export interface MergeCounts {
  hand: number;
  keyboard: number;
  autopilot: number;
  scroll: number;
  command: number;
}
