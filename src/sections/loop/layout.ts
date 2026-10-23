export interface Columns {
  spec: number;
  issue: number;
  build: number;
  pr: number;
  review: number;
  merge: number;
}

/** Below this width the pipeline turns vertical. */
export const HORIZONTAL_MIN = 960;

/** Node positions for the horizontal pipeline; extra width is shared between the gaps. */
export function columnsFor(width: number): Columns {
  const gaps = [120, 180, 112, 104, 269]; // spec, issue, build, pr, review: room for their labels
  // Spare width goes mostly to the first gaps, so their legend text wraps less.
  const share = [2, 1.5, 1, 1, 1];
  const extra = Math.max(0, width - 6 - gaps.reduce((a, b) => a + b, 0) - 150) / (share.reduce((a, b) => a + b, 0) + 1);
  const xs = [6];
  gaps.forEach((g, i) => xs.push(xs[xs.length - 1]! + g + extra * share[i]!));
  const [spec, issue, build, pr, review, merge] = xs as [number, number, number, number, number, number];
  return { spec, issue, build, pr, review, merge };
}
