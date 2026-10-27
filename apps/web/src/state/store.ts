// UI state (zustand). Pure state + transitions only; side effects (swarm,
// brain, audio) live in ../controller.ts.
import { create } from 'zustand';
import type { Mood, ProjectId, StoryId } from '@yoyo/protocol';
import { ENTRY_CHIPS, clampChips } from '../content/chips';

export type Overlay = 'none' | 'card' | 'build' | 'contact' | 'game' | 'stories' | 'tour' | 'history';
export type Phase = 'boot' | 'entry' | 'ready';
export type Scene = 'dark' | 'light';
export type Settling = '' | 'chips' | 'all';

export interface Line {
  id: number;
  role: 'agent' | 'visitor';
  text: string;
  streaming: boolean;
  /** shown without the word-in animation (a runner caption that stays on screen as the last line) */
  quiet?: boolean;
  /** font size the turn was fitted to, once, before it was shown (POLISH2 A1), px */
  size?: number;
  /** the turn's whole text (known before its words stream in) */
  full?: string;
  /**
   * A caption the show left on screen (FIX4 W1, W8): it rests alone (no muted line beneath it), is never the
   * muted line beneath a reply, and while a message waits for its reply it is not shown (nothing is).
   */
  show?: boolean;
}

export type BuildStatus = 'idle' | 'ring' | 'streaming' | 'locked' | 'error';
export interface BuildState {
  status: BuildStatus;
  instruction: string;
  html: string;
  bytes: number;
  expected?: number | undefined;
  progress: number;
  startedAt: number;
  seconds: number;
  title: string;
}

export interface RunnerView {
  kind: 'tour' | 'stories';
  storyId?: StoryId | undefined;
  say: string;
  /** a muted line above the caption (e.g. "Things I've shipped:") */
  lead: string;
  beat: number;
  beats: number;
  stepMode: boolean;
}

export interface Visitor {
  name?: string | undefined;
  returning: boolean;
  visits: number;
}

export interface State {
  phase: Phase;
  lines: Line[];
  chips: string[];
  chipsKey: number; // bumps on every chip change (re-runs the pop stagger)
  overlay: Overlay;
  project: ProjectId | null;
  scene: Scene;
  sound: boolean;
  voice: boolean;
  mood: Mood;
  visitor: Visitor;
  streaming: boolean;
  /** The bar's mode: normal chat, or a follow-up instruction for the current build */
  barMode: 'chat' | 'change';
  build: BuildState;
  runner: RunnerView | null;
  /** ms timestamp of the last visitor input (keys, clicks, chips) */
  lastInput: number;
  /** whether the idle → tour path already ran or was cancelled this session */
  idleSpent: boolean;
  /**
   * An overlay just closed and the flock is gathering at the stage centre (POLISH2 A2): the chips
   * wait for it ('chips'), and the bar too when the overlay had covered it ('all').
   */
  settling: Settling;
  entryName: string | null; // the quiet mono line under the entry letters
  reducedMotion: boolean;
}

export const emptyBuild: BuildState = {
  status: 'idle', instruction: '', html: '', bytes: 0, progress: 0, startedAt: 0, seconds: 0, title: '',
};

export interface Actions {
  setPhase(p: Phase): void;
  pushVisitor(text: string): number;
  startAgent(turn?: { size?: number; full?: string }): number;
  /** `id`: the line to append to (a turn); else the last streaming agent line */
  appendAgentWord(word: string, id?: number): void;
  /** `keepStreaming`: a turn ended but the reply goes on; `id`: finish only that line */
  finishAgent(opts?: { keepStreaming?: boolean; id?: number }): void;
  setStreaming(on: boolean): void;
  setSettling(s: Settling): void;
  agentLine(text: string, opts?: { quiet?: boolean; show?: boolean }): number;
  setChips(chips: string[]): void;
  openOverlay(o: Overlay): void;
  closeOverlay(): void;
  showProject(id: ProjectId): void;
  setScene(s: Scene): void;
  setSound(on: boolean): void;
  setVoice(on: boolean): void;
  setMood(m: Mood): void;
  setVisitor(v: Partial<Visitor>): void;
  setBarMode(m: 'chat' | 'change'): void;
  patchBuild(b: Partial<BuildState>): void;
  resetBuild(): void;
  setRunner(r: RunnerView | null): void;
  touch(): void;
  spendIdle(): void;
  setEntryName(s: string | null): void;
  setReducedMotion(r: boolean): void;
  reset(): void;
}

let nextId = 1;
const MAX_LINES = 60;

const initial = (): State => ({
  phase: 'boot',
  lines: [],
  chips: [],
  chipsKey: 0,
  overlay: 'none',
  project: null,
  scene: 'dark',
  sound: false,
  voice: false,
  mood: 'idle',
  visitor: { returning: false, visits: 0 },
  streaming: false,
  barMode: 'chat',
  build: emptyBuild,
  runner: null,
  lastInput: 0,
  idleSpent: false,
  settling: '',
  entryName: null,
  reducedMotion: false,
});

export const useStore = create<State & Actions>()((set, get) => ({
  ...initial(),
  setPhase: (phase) => set({ phase }),
  pushVisitor(text) {
    const id = nextId++;
    set((s) => ({ lines: [...s.lines, { id, role: 'visitor' as const, text, streaming: false }].slice(-MAX_LINES), lastInput: Date.now() }));
    return id;
  },
  startAgent(turn) {
    const id = nextId++;
    const line: Line = { id, role: 'agent', text: '', streaming: true };
    if (turn?.size) line.size = turn.size;
    if (turn?.full) line.full = turn.full;
    set((s) => ({ lines: [...s.lines, line].slice(-MAX_LINES), streaming: true }));
    return id;
  },
  appendAgentWord(word, id) {
    set((s) => {
      const lines = s.lines.slice();
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i]!;
        if (id !== undefined ? l.id === id : l.role === 'agent' && l.streaming) {
          lines[i] = { ...l, text: l.text ? `${l.text} ${word}` : word };
          break;
        }
      }
      return { lines };
    });
  },
  finishAgent(opts) {
    set((s) => ({
      // drop an agent line that never received text (action-only replies)
      lines: s.lines
        .filter((l) => !(l.role === 'agent' && l.streaming && !l.text && (opts?.id === undefined || l.id === opts.id)))
        .map((l) => (l.streaming && (opts?.id === undefined || l.id === opts.id) ? { ...l, streaming: false } : l)),
      streaming: !!opts?.keepStreaming,
    }));
  },
  setStreaming: (streaming) => set({ streaming }),
  setSettling: (settling) => set({ settling }),
  agentLine(text, opts) {
    const id = nextId++;
    const line: Line = { id, role: 'agent', text, streaming: false, ...(opts?.quiet ? { quiet: true } : {}), ...(opts?.show ? { show: true } : {}) };
    set((s) => ({ lines: [...s.lines, line].slice(-MAX_LINES) }));
    return id;
  },
  setChips: (chips) => set((s) => ({ chips: clampChips(chips), chipsKey: s.chipsKey + 1 })),
  openOverlay: (overlay) => set({ overlay }),
  closeOverlay: () => set((s) => ({ overlay: 'none', project: s.overlay === 'card' ? null : s.project, barMode: s.overlay === 'build' ? 'chat' : s.barMode })),
  showProject: (project) => set({ project, overlay: 'card' }),
  setScene: (scene) => set({ scene }),
  setSound: (sound) => set({ sound }),
  setVoice: (voice) => set({ voice }),
  setMood: (mood) => set({ mood }),
  setVisitor: (v) => set((s) => ({ visitor: { ...s.visitor, ...v } })),
  setBarMode: (barMode) => set({ barMode }),
  patchBuild: (b) => set((s) => ({ build: { ...s.build, ...b } })),
  resetBuild: () => set({ build: emptyBuild }),
  setRunner: (runner) => set({ runner }),
  touch: () => set({ lastInput: Date.now() }),
  spendIdle: () => set({ idleSpent: true }),
  setEntryName: (entryName) => set({ entryName }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  reset: () => set({ ...initial(), phase: get().phase }),
}));

export const defaultEntryChips = ENTRY_CHIPS;

/**
 * What the conversation shows: the current agent turn, the visitor line it
 * answers, and the one agent turn before it (muted beneath; a previous turn
 * of the same reply or the end of the last one). Older lines live in History.
 */
export function visibleExchange(lines: Line[]): { prevAgent?: Line; agent?: Line; visitor?: Line } {
  let agent: Line | undefined;
  let visitor: Line | undefined;
  let prevAgent: Line | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (!agent) {
      if (l.role === 'agent') agent = l;
      continue;
    }
    if (l.role === 'visitor') {
      visitor ??= l;
      if (prevAgent) break;
      continue;
    }
    if (!prevAgent) {
      prevAgent = l;
      if (visitor) break;
    }
  }
  // If the visitor just spoke and the agent hasn't answered yet, show their echo under the last agent line;
  // the muted turn before that line stays until the reply arrives (WAVE3 S2: it never fades on its own).
  const last = lines[lines.length - 1];
  if (last?.role === 'visitor') {
    // the show was stopped by this message (or had ended): nothing in the caption area until the reply's first word
    if (!agent || agent.show) return { visitor: last };
    const before = lines.slice(0, lines.lastIndexOf(agent)).reverse().find((l) => l.role === 'agent');
    return before && !before.show ? { prevAgent: before, agent, visitor: last } : { agent, visitor: last };
  }
  const out: { prevAgent?: Line; agent?: Line; visitor?: Line } = {};
  // a show caption rests alone, and is never the muted line beneath a reply (FIX4 W1, W8)
  if (prevAgent && !prevAgent.show && !agent?.show) out.prevAgent = prevAgent;
  if (agent) out.agent = agent;
  if (visitor) out.visitor = visitor;
  return out;
}
