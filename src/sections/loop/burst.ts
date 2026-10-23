import type { PullRequest } from '../../data/stats';

/** Same rule as stats.ts: the Linear issue a PR was built against. */
export const issueOf = (p: PullRequest) => p.branch.match(/YOY-\d+/)?.[0] ?? p.title.match(/YOY-\d+/)?.[0] ?? null;

/** Minutes from opened to merged. */
export const openToMerge = (p: PullRequest) => (Date.parse(p.merged_at!) - Date.parse(p.created_at)) / 60_000;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface Bar {
  pr: PullRequest;
  /** Clamped to the window, in ms */
  from: number;
  to: number;
  /** Merge time as 0..1 of the window: when the replay's playhead reveals it */
  at: number;
  x: number;
  w: number;
  lane: number;
}

/**
 * Lay the PRs out on a strip `width` px wide: each bar spans created→merged
 * (clamped to the window), at least `minW` px, and takes the first lane where
 * it doesn't touch the previous bar.
 */
export function layoutBars(list: PullRequest[], start: number, end: number, width: number, minW = 2, gap = 2): Bar[] {
  const span = end - start;
  const px = (t: number) => ((t - start) / span) * width;
  const laneEnds: number[] = [];
  return [...list]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((pr) => {
      const from = Math.max(start, Date.parse(pr.created_at));
      const to = Math.min(end, Date.parse(pr.merged_at!));
      const w = Math.max(minW, px(to) - px(from));
      const x = Math.min(px(from), width - w);
      let lane = laneEnds.findIndex((e) => e + gap <= x);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = x + w;
      return { pr, from, to, at: (to - start) / span, x, w, lane };
    });
}

/** Every full UTC hour inside the window. */
export function hourTicks(start: number, end: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(start / 3_600_000) * 3_600_000; t <= end; t += 3_600_000) out.push(t);
  return out;
}
