import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { playMergeClick } from './sound';
import { LIGHT_LEVELS, LIGHTS_ON_AT } from '../design/lights';
import {
  CI_CHECKS,
  type LogEntry,
  type MergeCounts,
  type LogTag,
  type MergeSource,
  type Mode,
  type PRState,
  type SectionId,
  type SectionMeta,
  type SectionRuntime,
} from './types';

export const SEEN_KEY = 'yoyo.seen';

/** Order in which a PR moves through the loop. */
const NEXT: Record<PRState, PRState | null> = {
  queued: 'building',
  building: 'ci',
  ci: 'review',
  review: 'awaiting-merge',
  'awaiting-merge': 'merged',
  merged: null,
};

export interface FactoryState {
  meta: SectionMeta[];
  sections: Record<string, SectionRuntime>;
  log: LogEntry[];
  mode: Mode;
  /** Date.now() at loop start (boot or replay). */
  startedAt: number;
  /** Date.now() when the first PR of this run opened (its build finished); the end card times from here. */
  firstOpenedAt: number | null;
  completedAt: number | null;
  manualMerges: number;
  autoMerges: number;
  /** Every merge this run, by how it happened (for the end card and /yoyo-diagnose). */
  mergeCounts: MergeCounts;
  /** Date.now() when the lights switched on this run (merged count reached 4), else null. */
  lightsOnAt: number | null;
  sound: boolean;
  /** Returning visitor (localStorage yoyo.seen=1) or show completed/skipped. */
  seen: boolean;
  /** The show was skipped (or started merged): render without animation. */
  skipped: boolean;
  /** Bumped by replay() so the scheduler and UI can reset. */
  runId: number;
  /** The "Only humans merge here. Your turn." hint has been shown for this PR id. */
  hintFor: SectionId | null;
  /** "Let the loop run on its own?" offer in the control room. */
  autopilotOffer: 'hidden' | 'open' | 'answered';
  endCard: 'closed' | 'open' | 'dismissed';
  /** The "Lights" command forces the palette to 0 or 1; null follows progress. */
  lightsOverride: 0 | 1 | null;
  controlRoomOpen: boolean;
  /** The visitor opened or closed the control room themselves; stop opening/closing it for them. */
  controlRoomTouched: boolean;
  /** Fresh visits on a wide screen start with the control room expanded (POLISH_WAVE E). */
  controlRoomStartsOpen: boolean;
  paletteOpen: boolean;
  /** How many times the palette was opened this run (/yoyo-diagnose). */
  paletteOpens: number;
  /** Slots whose own Merge button is on screen; the control room hides its copy meanwhile. */
  slotButtonsInView: SectionId[];

  boot: (meta: SectionMeta[], opts?: { seen?: boolean; skip?: boolean; controlRoomOpen?: boolean }) => void;
  /** Move a PR to its next state. No-op if it is not in `from`. */
  advance: (id: SectionId, from: PRState, extra?: Partial<SectionRuntime>) => void;
  passCheck: (id: SectionId) => void;
  /**
   * `via: 'keyboard'` only changes the log line of a human merge (the `m` shortcut).
   * `via: 'instant'` marks a fast-forward merge: the section appears without the merge choreography.
   */
  merge: (id: SectionId, by: MergeSource, via?: 'keyboard' | 'instant') => boolean;
  /** Ask the scheduler to fast-forward a PR and merge it (scrolled past, or /yoyo-merge-all). */
  rush: (id: SectionId, by?: MergeSource) => void;
  /** Fast-forward and merge everything still open (bottom of the page, /yoyo-merge-all). Returns how many. */
  rushAll: (by: MergeSource) => number;
  /** /yoyo-build: ask the scheduler to start the next queued PR now, ignoring capacity. */
  requestBuild: () => SectionMeta | null;
  /** Counter the scheduler watches for requestBuild(). */
  buildRequests: number;
  gameOpen: boolean;
  setGameOpen: (open: boolean) => void;
  setMode: (mode: Mode) => void;
  answerAutopilotOffer: (accept: boolean) => void;
  skipShow: () => void;
  replay: () => void;
  setSound: (on: boolean) => void;
  toggleLights: () => void;
  setEndCard: (state: 'open' | 'dismissed') => void;
  /** `byUser` marks the toggle as the visitor's own choice, which the factory then respects. */
  setControlRoomOpen: (open: boolean, byUser?: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setSlotButtonInView: (id: SectionId, inView: boolean) => void;
}

export interface FactoryDeps {
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSeen(storage = safeStorage()): boolean {
  try {
    return storage?.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Format ms as +MM:SS.d for the event log. */
export function formatStamp(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `+${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Format ms as M:SS for the end card. */
export function formatDuration(ms: number): string {
  const total = Math.round(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Format ms as +M:SS for commit lines ("merged by you at +0:05"). */
export function formatAt(ms: number): string {
  return `+${formatDuration(ms)}`;
}

function runtime(id: SectionId, state: PRState, at: number, mergedBy: MergeSource | null = null): SectionRuntime {
  return {
    id,
    state,
    stateSince: at,
    buildMs: 0,
    ciPassed: state === 'merged' ? CI_CHECKS.length : 0,
    rushing: null,
    mergedBy,
    mergedAt: null,
    mergedVia: null,
    instant: false,
  };
}

const zeroCounts = (): MergeCounts => ({ hand: 0, keyboard: 0, autopilot: 0, scroll: 0, command: 0 });

/** The diff excerpt's file, as logged while the PR builds. */
export function sourcePathOf(m: Pick<SectionMeta, 'id' | 'sourcePath'>): string {
  return m.sourcePath ?? `src/sections/${m.id}/Component.tsx`;
}

export function createFactoryStore(deps: FactoryDeps = {}): StoreApi<FactoryState> {
  const now = deps.now ?? (() => Date.now());
  const storage = deps.storage === undefined ? safeStorage() : deps.storage;
  let logSeq = 0;

  const markSeen = () => {
    try {
      storage?.setItem(SEEN_KEY, '1');
    } catch {
      // Private mode or blocked storage: the show simply plays again next time.
    }
  };

  return createStore<FactoryState>()((set, get) => {
    const entry = (tag: LogTag, text: string): LogEntry => ({ id: ++logSeq, t: now() - get().startedAt, tag, text });
    const push = (...entries: LogEntry[]) => set((s) => ({ log: [...s.log, ...entries] }));
    const metaFor = (id: SectionId) => {
      const m = get().meta.find((x) => x.id === id);
      if (!m) throw new Error(`Unknown section ${id}`);
      return m;
    };

    /** Everything merged, no animation. Used by skip, reduced motion and returning visitors. */
    const allMerged = (at: number): Record<string, SectionRuntime> =>
      Object.fromEntries(get().meta.map((m, i) => [m.id, runtime(m.id, 'merged', at, i === 0 ? 'init' : 'skip')]));

    const freshSections = (at: number): Record<string, SectionRuntime> =>
      Object.fromEntries(
        get().meta.map((m, i) => [m.id, i === 0 ? runtime(m.id, 'merged', at, 'init') : runtime(m.id, 'queued', at)]),
      );

    // Only what happened in this browser: the sections were queued and #1 merged at init.
    const initEntry = (): LogEntry => {
      const [first, ...rest] = get().meta;
      return {
        id: ++logSeq,
        t: 0,
        tag: 'init',
        text: `${rest.length} sections queued · #${first?.pr ?? 1} ${first?.id ?? 'hero'} merged at init`,
      };
    };

    const baseRun = (at: number) => ({
      startedAt: at,
      firstOpenedAt: null,
      completedAt: null,
      manualMerges: 0,
      autoMerges: 0,
      mergeCounts: zeroCounts(),
      lightsOnAt: null,
      paletteOpens: 0,
      slotButtonsInView: [] as SectionId[],
      hintFor: null,
      autopilotOffer: 'hidden' as const,
      endCard: 'closed' as const,
      lightsOverride: null,
      mode: 'manual' as const,
    });

    return {
      meta: [],
      sections: {},
      log: [],
      mode: 'manual',
      startedAt: now(),
      firstOpenedAt: null,
      completedAt: null,
      manualMerges: 0,
      autoMerges: 0,
      mergeCounts: zeroCounts(),
      lightsOnAt: null,
      sound: false,
      seen: false,
      skipped: false,
      runId: 0,
      hintFor: null,
      autopilotOffer: 'hidden',
      endCard: 'closed',
      lightsOverride: null,
      controlRoomOpen: false,
      controlRoomTouched: false,
      controlRoomStartsOpen: false,
      paletteOpen: false,
      paletteOpens: 0,
      slotButtonsInView: [],
      buildRequests: 0,
      gameOpen: false,

      boot(meta, opts = {}) {
        const at = now();
        const seen = opts.seen ?? readSeen(storage);
        const startsOpen = opts.controlRoomOpen ?? false;
        set({ meta, ...baseRun(at), seen, runId: get().runId + 1, controlRoomStartsOpen: startsOpen });
        if (seen || opts.skip) {
          set({
            sections: allMerged(at),
            skipped: true,
            completedAt: at,
            controlRoomOpen: false,
            log: [initEntry(), entry('loop', 'show skipped · every PR merged at once')],
          });
          if (opts.skip) markSeen();
          set({ seen: true });
          return;
        }
        set({ sections: freshSections(at), skipped: false, log: [initEntry()], controlRoomOpen: startsOpen });
      },

      advance(id, from, extra) {
        const cur = get().sections[id];
        const to = NEXT[from];
        if (!cur || cur.state !== from || !to || to === 'merged') return;
        const m = metaFor(id);
        set((s) => ({ sections: { ...s.sections, [id]: { ...cur, ...extra, state: to, stateSince: now() } } }));
        if (to === 'building') push(entry('build', `#${m.pr} · writing ${sourcePathOf(m)} (${m.sourceLines} lines)`));
        if (to === 'ci') {
          if (get().firstOpenedAt === null) set({ firstOpenedAt: now() });
          push(entry('build', `#${m.pr} · opened PR`));
        }
        if (to === 'awaiting-merge') {
          push(entry('review', `#${m.pr} · approve · 0 must-fix · 0 should-fix · 1 note`));
          if (cur.rushing) return;
          push(entry('wait', get().mode === 'autopilot' ? `#${m.pr} · ready · autopilot merges in 1.2 s` : `#${m.pr} · waiting on you`));
          if (get().hintFor === null && !get().skipped) set({ hintFor: id });
        }
      },

      passCheck(id) {
        const cur = get().sections[id];
        if (!cur || cur.state !== 'ci' || cur.ciPassed >= CI_CHECKS.length) return;
        const passed = cur.ciPassed + 1;
        set((s) => ({ sections: { ...s.sections, [id]: { ...cur, ciPassed: passed } } }));
        // One line once all three ran: these are the site's own gates, which ran when it was built.
        if (passed === CI_CHECKS.length) {
          push(entry('checks', `#${metaFor(id).pr} · ${CI_CHECKS.map((c) => `${c} ✓`).join(' ')} (ran at build time)`));
        }
      },

      merge(id, by, via) {
        const cur = get().sections[id];
        if (!cur || cur.state === 'merged') return false;
        // A human can only merge what is ready; the loop may merge anything it fast-forwards.
        if (by === 'human' && cur.state !== 'awaiting-merge') return false;
        const m = metaFor(id);
        const at = now();
        const firstHuman = by === 'human' && get().manualMerges === 0;
        const litBefore = selectMergedPRs(get()) >= LIGHTS_ON_AT;
        const firstMerge = selectMergedPRs(get()) === 0;
        const key: keyof MergeCounts | null =
          by === 'human' ? (via === 'keyboard' ? 'keyboard' : 'hand') : by === 'init' || by === 'skip' ? null : by;
        set((s) => ({
          sections: {
            ...s.sections,
            [id]: {
              ...cur,
              state: 'merged',
              stateSince: at,
              ciPassed: CI_CHECKS.length,
              rushing: null,
              mergedBy: by,
              mergedAt: at - s.startedAt,
              mergedVia: by === 'human' && via === 'keyboard' ? 'keyboard' : null,
              instant: via === 'instant',
            },
          },
          manualMerges: s.manualMerges + (by === 'human' ? 1 : 0),
          autoMerges: s.autoMerges + (by === 'scroll' || by === 'autopilot' || by === 'command' ? 1 : 0),
          mergeCounts: key ? { ...s.mergeCounts, [key]: s.mergeCounts[key] + 1 } : s.mergeCounts,
        }));
        const text = {
          human: via === 'keyboard' ? `#${m.pr} by you (keyboard)` : `#${m.pr} by you`,
          scroll: `#${m.pr} · auto (you scrolled past)`,
          autopilot: `#${m.pr} · autopilot`,
          command: `#${m.pr} · /yoyo-merge-all`,
          init: `#${m.pr}`,
          skip: `#${m.pr}`,
        }[by];
        push(entry('merged', text));
        // The expanded log folds away on the first merge of the run, whatever made it (POLISH 3),
        // unless the visitor has opened or closed it themselves.
        if (firstMerge && !get().controlRoomTouched) set({ controlRoomOpen: false });
        if (firstHuman && get().mode === 'manual' && get().autopilotOffer === 'hidden') set({ autopilotOffer: 'open' });

        const merged = selectMergedPRs(get());
        if (!litBefore && merged >= LIGHTS_ON_AT && !get().skipped) {
          set({ lightsOnAt: at });
          push(entry('lights', `on · ${merged} of ${get().meta.length - 1} merged`));
        }

        const done = Object.values(get().sections).every((s) => s.state === 'merged');
        if (done) {
          const total = get().meta.length - 1;
          set({ completedAt: at, seen: true });
          markSeen();
          push(entry('loop', `loop complete · ${total} of ${total} merged · checks green on all ${total}`));
          if (!get().skipped && get().endCard === 'closed') set({ endCard: 'open' });
        }
        return true;
      },

      rush(id, by = 'scroll') {
        const cur = get().sections[id];
        if (!cur || cur.state === 'merged' || cur.rushing || get().skipped) return;
        set((s) => ({ sections: { ...s.sections, [id]: { ...cur, rushing: by } } }));
      },

      rushAll(by) {
        const s = get();
        if (s.skipped) return 0;
        const open = s.meta.filter((m) => s.sections[m.id]?.state !== 'merged');
        // Everything lands at once, without per-section choreography: no pinned cards, no
        // stepped states (so the bar never asks to merge a PR that is about to land), and the
        // page reaches its final height in a single layout.
        for (const m of open) get().merge(m.id, by, 'instant');
        return open.length;
      },

      requestBuild() {
        const s = get();
        const next = s.meta.find((m) => s.sections[m.id]?.state === 'queued' && !s.sections[m.id]?.rushing) ?? null;
        if (next && !s.skipped) set({ buildRequests: s.buildRequests + 1 });
        return s.skipped ? null : next;
      },

      setGameOpen(open) {
        set({ gameOpen: open });
      },

      setMode(mode) {
        if (get().mode === mode) return;
        set({ mode, autopilotOffer: get().autopilotOffer === 'open' ? 'answered' : get().autopilotOffer });
        push(entry('loop', mode === 'autopilot' ? 'autopilot on · the loop merges after review' : 'autopilot off · waiting on you'));
      },

      answerAutopilotOffer(accept) {
        set({ autopilotOffer: 'answered' });
        if (accept) get().setMode('autopilot');
      },

      skipShow() {
        const at = now();
        const s = get();
        const remaining = s.meta.filter((m) => s.sections[m.id]?.state !== 'merged').length;
        const sections = Object.fromEntries(
          s.meta.map((m) => {
            const cur = s.sections[m.id];
            return [m.id, cur && cur.state === 'merged' ? cur : runtime(m.id, 'merged', at, 'skip')];
          }),
        );
        set({ sections, skipped: true, completedAt: s.completedAt ?? at, seen: true, hintFor: null, autopilotOffer: 'answered' });
        if (remaining > 0) push(entry('loop', `show skipped · ${remaining} PRs merged at once`));
        markSeen();
      },

      replay() {
        const at = now();
        const s = get();
        set({
          ...baseRun(at),
          skipped: false,
          runId: s.runId + 1,
          controlRoomOpen: s.controlRoomTouched ? s.controlRoomOpen : s.controlRoomStartsOpen,
          paletteOpen: false,
        });
        set({ sections: freshSections(at), log: [initEntry()] });
      },

      setSound(on) {
        set({ sound: on });
      },

      toggleLights() {
        const p = selectProgress({ ...get(), lightsOverride: null });
        const cur = get().lightsOverride;
        // First press flips away from what you see; second press returns to following the build.
        set({ lightsOverride: cur === null ? (p >= 0.5 ? 0 : 1) : null });
      },

      setEndCard(state) {
        set({ endCard: state });
      },

      setControlRoomOpen(open, byUser = false) {
        set({ controlRoomOpen: open, controlRoomTouched: get().controlRoomTouched || byUser });
      },

      setPaletteOpen(open) {
        if (open === get().paletteOpen) return;
        set({ paletteOpen: open, paletteOpens: get().paletteOpens + (open ? 1 : 0) });
      },

      setSlotButtonInView(id, inView) {
        const cur = get().slotButtonsInView;
        const has = cur.includes(id);
        if (inView === has) return;
        set({ slotButtonsInView: inView ? [...cur, id] : cur.filter((x) => x !== id) });
      },
    };
  });
}

/* ---------- Selectors ---------- */

type ProgressInput = Pick<FactoryState, 'meta' | 'sections' | 'lightsOverride'>;

/**
 * Build progress 0..1. #1 (hero) is merged at t=0, so progress counts the PRs
 * after it: 0 before the visitor merges anything, 1 when #8 is merged.
 */
export function selectProgress(s: ProgressInput): number {
  if (s.lightsOverride !== null) return s.lightsOverride;
  const total = s.meta.length - 1;
  if (total <= 0) return 0;
  const merged = s.meta.slice(1).filter((m) => s.sections[m.id]?.state === 'merged').length;
  return merged / total;
}

export function selectMergedCount(s: Pick<FactoryState, 'sections'>): number {
  return Object.values(s.sections).filter((x) => x.state === 'merged').length;
}

/** PRs merged after #1 (0..7): the number the lights, the end card and the hero follow. */
export function selectMergedPRs(s: Pick<FactoryState, 'meta' | 'sections'>): number {
  return s.meta.slice(1).filter((m) => s.sections[m.id]?.state === 'merged').length;
}

/**
 * The first merge after #1 has happened this run (by any source: hand, key,
 * scroll, autopilot, command or skip). The hero's fresh-visit hint hides on it.
 */
export function selectFirstMergeDone(s: Pick<FactoryState, 'meta' | 'sections'>): boolean {
  return selectMergedPRs(s) > 0;
}

/**
 * Which of the eight lights states the page shows (0..7, see tokens.css). The
 * Lights command forces 0 or 7.
 */
export function selectLightsLevel(s: ProgressInput): number {
  if (s.lightsOverride !== null) return s.lightsOverride === 1 ? LIGHT_LEVELS - 1 : 0;
  return Math.min(LIGHT_LEVELS - 1, selectMergedPRs(s));
}

/** Paper regime: the lights are on (4+ of 7 merged, or the Lights command). */
export function selectLightsOn(s: ProgressInput): boolean {
  return selectLightsLevel(s) >= LIGHTS_ON_AT;
}

/** The first PR (in order) that is waiting on the human, if any. */
export function selectAwaiting(s: Pick<FactoryState, 'meta' | 'sections'>): SectionMeta | null {
  return s.meta.find((m) => s.sections[m.id]?.state === 'awaiting-merge') ?? null;
}

/** The PR the control room should focus on: awaiting first, then the most advanced in flight. */
export function selectFocus(s: Pick<FactoryState, 'meta' | 'sections'>): SectionMeta | null {
  const awaiting = selectAwaiting(s);
  if (awaiting) return awaiting;
  const rank: Record<PRState, number> = { review: 3, ci: 2, building: 1, queued: 0, 'awaiting-merge': 4, merged: -1 };
  let best: SectionMeta | null = null;
  for (const m of s.meta) {
    const st = s.sections[m.id]?.state;
    if (!st || st === 'merged' || st === 'queued') continue;
    if (!best || rank[st] > rank[s.sections[best.id]!.state]) best = m;
  }
  return best;
}

export function isComplete(s: Pick<FactoryState, 'sections'>): boolean {
  const all = Object.values(s.sections);
  return all.length > 0 && all.every((x) => x.state === 'merged');
}

/** One-line live status for the top bar, e.g. "loop running · PR #3 in review". */
export function selectStatus(s: Pick<FactoryState, 'meta' | 'sections' | 'skipped' | 'mode'>): string {
  if (isComplete(s)) return s.skipped ? 'all PRs merged' : 'loop complete · all PRs merged';
  const focus = selectFocus(s);
  if (!focus) return 'loop running · claiming the next PR';
  const st = s.sections[focus.id]!.state;
  const label: Record<PRState, string> = {
    queued: 'queued',
    building: 'building',
    ci: 'in CI',
    review: 'in review',
    'awaiting-merge': s.mode === 'autopilot' ? 'merging on autopilot' : 'waiting on you',
    merged: 'merged',
  };
  return `loop running · PR #${focus.pr} ${label[st]}`;
}

/* ---------- App singleton ---------- */

export const factoryStore = createFactoryStore();

/**
 * The visitor pressed a Merge button (slot, control room or /yoyo-merge).
 * Plays the click if sound is on; returns false if the PR was not ready.
 */
export function mergeByHand(id: SectionId, via?: 'keyboard'): boolean {
  const ok = factoryStore.getState().merge(id, 'human', via);
  if (ok && factoryStore.getState().sound) playMergeClick();
  return ok;
}

export function useFactory<T>(selector: (s: FactoryState) => T): T {
  return useStore(factoryStore, selector);
}
