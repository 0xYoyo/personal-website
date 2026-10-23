import type { StoreApi } from 'zustand/vanilla';
import type { FactoryState } from './store';
import { CI_CHECKS, type MergeSource, type SectionId, type SectionMeta } from './types';

/** Default timings in ms (SPEC §4). Mobile multiplies everything by 0.6. */
export const TIMING = {
  firstStart: 600,
  /** Gap before a free builder claims the next queued PR. */
  claimGap: 350,
  buildMin: 1600,
  buildMax: 2400,
  /** Diff stream target speed; the build lasts as long as the stream, clamped. */
  charsPerSecond: 1400,
  ci: 900,
  review: 800,
  autopilotDelay: 1200,
  /** A PR scrolled past is fast-forwarded and merged within this window. */
  rushTotal: 400,
} as const;

export const MOBILE_SPEED = 0.6;

export function buildDuration(sourceChars: number, speed = 1): number {
  const natural = (sourceChars / TIMING.charsPerSecond) * 1000;
  return Math.round(Math.min(TIMING.buildMax, Math.max(TIMING.buildMin, natural)) * speed);
}

/**
 * How many PRs may be in flight (building, ci or review) at once. One until the
 * visitor's first merge, so the first PR gets their full attention; then two,
 * so later slots are usually ready by the time they scroll to them.
 * Before the first merge an awaiting PR also holds the only builder.
 */
export function capacity(s: Pick<FactoryState, 'meta' | 'sections'>): { limit: number; used: number } {
  const merged = s.meta.slice(1).filter((m) => s.sections[m.id]?.state === 'merged').length;
  const opened = merged > 0;
  const busy = s.meta.filter((m) => {
    const st = s.sections[m.id]?.state;
    return st === 'building' || st === 'ci' || st === 'review' || (!opened && st === 'awaiting-merge');
  }).length;
  return { limit: opened ? 2 : 1, used: busy };
}

export interface Scheduler {
  stop: () => void;
}

/**
 * Drives the factory state machine with timers. It reacts to store changes
 * (merges, rush requests, mode, replay) and never reads the clock itself, so
 * tests can run it deterministically with fake timers.
 */
export function startScheduler(store: StoreApi<FactoryState>, opts: { speed?: number } = {}): Scheduler {
  const speed = opts.speed ?? 1;
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  const claimTimer: { t: ReturnType<typeof setTimeout> | null } = { t: null };
  let runId = store.getState().runId;
  let firstClaimDone = false;

  const later = (key: string, ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      const list = timers.get(key);
      if (list) timers.set(key, list.filter((x) => x !== t));
      fn();
    }, ms);
    timers.set(key, [...(timers.get(key) ?? []), t]);
  };
  const clear = (key: string) => {
    timers.get(key)?.forEach(clearTimeout);
    timers.delete(key);
  };
  const clearAll = () => {
    timers.forEach((list) => list.forEach(clearTimeout));
    timers.clear();
    if (claimTimer.t) clearTimeout(claimTimer.t);
    claimTimer.t = null;
  };

  const get = () => store.getState();
  const metaOf = (id: SectionId) => get().meta.find((m) => m.id === id) as SectionMeta;

  /** Normal pipeline for one PR, from building to awaiting-merge. */
  function run(id: SectionId) {
    const buildMs = buildDuration(metaOf(id).sourceChars, speed);
    get().advance(id, 'queued', { buildMs });
    later(id, buildMs, () => {
      get().advance(id, 'building');
      const step = (TIMING.ci * speed) / CI_CHECKS.length;
      CI_CHECKS.forEach((_, i) => later(id, step * (i + 1), () => get().passCheck(id)));
      later(id, TIMING.ci * speed, () => {
        get().advance(id, 'ci');
        later(id, TIMING.review * speed, () => {
          get().advance(id, 'review');
          maybeAutopilot(id);
        });
      });
    });
  }

  /** Fast-forward a PR the visitor scrolled past and merge it within rushTotal. */
  function rush(id: SectionId, by: MergeSource) {
    clear(id);
    const s = get().sections[id];
    if (!s || s.state === 'merged') return;
    if (s.state === 'awaiting-merge') {
      get().merge(id, by);
      return;
    }
    const order = ['queued', 'building', 'ci', 'review'] as const;
    const from = order.indexOf(s.state as (typeof order)[number]);
    const steps = order.slice(from);
    const step = TIMING.rushTotal / (steps.length + 1);
    steps.forEach((state, i) =>
      later(id, step * i, () => {
        if (state === 'queued') get().advance(id, 'queued', { buildMs: step });
        else {
          if (state === 'ci') while (get().sections[id]!.ciPassed < CI_CHECKS.length) get().passCheck(id);
          get().advance(id, state);
        }
      }),
    );
    later(id, TIMING.rushTotal, () => get().merge(id, by));
  }

  function maybeAutopilot(id: SectionId) {
    if (get().mode !== 'autopilot') return;
    if (get().sections[id]?.state !== 'awaiting-merge') return;
    later(`auto:${id}`, TIMING.autopilotDelay, () => {
      if (get().mode === 'autopilot') get().merge(id, 'autopilot');
    });
  }

  /** Claim queued PRs while builders are free. */
  function fill() {
    const s = get();
    if (s.skipped || claimTimer.t) return;
    const next = s.meta.find((m) => s.sections[m.id]?.state === 'queued' && !s.sections[m.id]?.rushing);
    if (!next) return;
    const { limit, used } = capacity(s);
    if (used >= limit) return;
    const delay = (firstClaimDone ? TIMING.claimGap : TIMING.firstStart) * speed;
    claimTimer.t = setTimeout(() => {
      claimTimer.t = null;
      firstClaimDone = true;
      const now = get();
      if (now.skipped || now.sections[next.id]?.state !== 'queued' || now.sections[next.id]?.rushing) return fill();
      const cap = capacity(now);
      if (cap.used >= cap.limit) return;
      run(next.id);
      fill();
    }, delay);
  }

  const unsubscribe = store.subscribe((s, prev) => {
    if (s.runId !== runId) {
      runId = s.runId;
      clearAll();
      firstClaimDone = false;
      fill();
      return;
    }
    if (s.skipped && !prev.skipped) {
      clearAll();
      return;
    }
    for (const m of s.meta) {
      const cur = s.sections[m.id];
      const old = prev.sections[m.id];
      // Merged out from under its timers (fast-forward): nothing left to run for it.
      if (cur?.state === 'merged' && old?.state !== 'merged') {
        clear(m.id);
        clear(`auto:${m.id}`);
        continue;
      }
      if (cur?.rushing && !old?.rushing) rush(m.id, cur.rushing);
    }
    if (s.buildRequests !== prev.buildRequests) {
      const next = s.meta.find((m) => s.sections[m.id]?.state === 'queued' && !s.sections[m.id]?.rushing);
      if (next) run(next.id);
    }
    if (s.mode === 'autopilot' && prev.mode !== 'autopilot') {
      s.meta.forEach((m) => s.sections[m.id]?.state === 'awaiting-merge' && maybeAutopilot(m.id));
    }
    if (s.mode === 'manual' && prev.mode === 'autopilot') {
      s.meta.forEach((m) => clear(`auto:${m.id}`));
    }
    fill();
  });

  fill();

  return {
    stop() {
      unsubscribe();
      clearAll();
    },
  };
}
