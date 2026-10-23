// UI state (zustand). Pure state + transitions only; side effects (swarm,
// brain, audio) live in ../controller.ts.
import { create } from 'zustand';
import type { Mood, ProjectId, StoryId } from '@yoyo/protocol';
import { ENTRY_CHIPS, clampChips } from '../content/chips';

export type Overlay = 'none' | 'card' | 'build' | 'contact' | 'game' | 'stories' | 'tour' | 'history';
export type Phase = 'boot' | 'entry' | 'ready';
export type Scene = 'dark' | 'light';

export interface Line {
  id: number;
  role: 'agent' | 'visitor';
  text: string;
  streaming: boolean;
  /** shown without the word-in animation (a runner caption that stays on screen as the last line) */
  quiet?: boolean;
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
  entryName: string | null; // the quiet mono line under the entry letters
  reducedMotion: boolean;
}

export const emptyBuild: BuildState = {
  status: 'idle', instruction: '', html: '', bytes: 0, progress: 0, startedAt: 0, seconds: 0, title: '',
};

export interface Actions {
  setPhase(p: Phase): void;
  pushVisitor(text: string): number;
  startAgent(): number;
  appendAgentWord(word: string): void;
  finishAgent(): void;
  agentLine(text: string, opts?: { quiet?: boolean }): number;
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
  startAgent() {
    const id = nextId++;
    set((s) => ({ lines: [...s.lines, { id, role: 'agent' as const, text: '', streaming: true }].slice(-MAX_LINES), streaming: true }));
    return id;
  },
  appendAgentWord(word) {
    set((s) => {
      const lines = s.lines.slice();
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i]!;
        if (l.role === 'agent' && l.streaming) {
          lines[i] = { ...l, text: l.text ? `${l.text} ${word}` : word };
          break;
        }
      }
      return { lines };
    });
  },
  finishAgent() {
    set((s) => ({
      // drop an agent line that never received text (action-only replies)
      lines: s.lines.filter((l) => !(l.role === 'agent' && l.streaming && !l.text)).map((l) => (l.streaming ? { ...l, streaming: false } : l)),
      streaming: false,
    }));
  },
  agentLine(text, opts) {
    const id = nextId++;
    const line: Line = { id, role: 'agent', text, streaming: false, ...(opts?.quiet ? { quiet: true } : {}) };
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

/** The last two exchanges: [previous agent line, current agent line, current visitor line]. */
export function visibleExchange(lines: Line[]): { prevAgent?: Line; agent?: Line; visitor?: Line } {
  let agent: Line | undefined;
  let visitor: Line | undefined;
  let prevAgent: Line | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!;
    if (!agent && l.role === 'agent') {
      agent = l;
      continue;
    }
    if (agent && !visitor && l.role === 'visitor') {
      visitor = l;
      continue;
    }
    if (agent && l.role === 'agent') {
      prevAgent = l;
      break;
    }
  }
  // If the visitor just spoke and the agent hasn't answered yet, show their echo under the last agent line.
  const last = lines[lines.length - 1];
  if (last?.role === 'visitor') return agent ? { agent, visitor: last } : { visitor: last };
  const out: { prevAgent?: Line; agent?: Line; visitor?: Line } = {};
  if (prevAgent) out.prevAgent = prevAgent;
  if (agent) out.agent = agent;
  if (visitor) out.visitor = visitor;
  return out;
}
