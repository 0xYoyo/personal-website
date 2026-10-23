import type { BranchName, GitCommit } from '../../content/gitlog';

export interface LayoutOptions {
  /** Horizontal distance between lanes, px */
  laneGap: number;
  /** Height each row's text needs (newest first); the graph never packs tighter */
  rowHeights: number[];
  /** Proportional stretch: px per day of real time between neighbouring rows */
  pxPerDay: number;
  /** Vertical room a fork or merge curve gets, px */
  curve: number;
  top: number;
  /** Cap on the proportional stretch between two rows, px (row height still wins) */
  maxGap?: number;
  /** The one gap drawn at its real length, uncapped: older `from`, newer `to` */
  uncapped?: { from: string; to: string };
}

export interface PlacedCommit extends GitCommit {
  x: number;
  y: number;
  lane: number;
  /** First commit of its branch: where the branch label goes */
  forks: boolean;
}

export interface Edge {
  key: string;
  d: string;
  branch: BranchName;
  /** Top and bottom of the path, for timing the draw */
  y0: number;
  y1: number;
}

const DAY = 86_400_000;

/**
 * Deterministic `git log --graph` layout. Rows run newest first; each gap is
 * the larger of the row's own height and the real time it covers, capped at
 * `maxGap` so ordinary pauses never read as holes. The `uncapped` gap (the
 * 2024 quiet) keeps its real length, so it stays the longest stretch. Branches get the lowest lane that is free for their whole
 * life. An edge runs in the older commit's lane and curves in just below the
 * newer one, which is how forks and merges read in GitKraken.
 */
export function layoutGraph(commits: GitCommit[], o: LayoutOptions) {
  const rows = [...commits].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const byId = new Map<string, PlacedCommit>();

  let y = o.top;
  rows.forEach((c, i) => {
    if (i > 0) {
      const newer = rows[i - 1]!;
      const days = (Date.parse(newer.at) - Date.parse(c.at)) / DAY;
      const real = o.uncapped?.from === c.id && o.uncapped.to === newer.id;
      const stretch = real ? days * o.pxPerDay : Math.min(o.maxGap ?? Infinity, days * o.pxPerDay);
      y += Math.max(o.rowHeights[i - 1] ?? 0, stretch);
    }
    byId.set(c.id, { ...c, x: 0, y, lane: 0, forks: false });
  });
  const placed = [...byId.values()];

  // A branch occupies its lane from its oldest commit up to the newest point
  // it touches: its own tip, or a child on another branch it runs up to.
  const span = new Map<BranchName, [top: number, bottom: number]>();
  for (const c of placed) {
    for (const p of c.parents.map((id) => byId.get(id)!)) {
      const [t, b] = span.get(p.branch) ?? [p.y, p.y];
      span.set(p.branch, [Math.min(t, c.y), Math.max(b, p.y)]);
    }
    const [t, b] = span.get(c.branch) ?? [c.y, c.y];
    span.set(c.branch, [Math.min(t, c.y), Math.max(b, c.y)]);
  }

  const lanes: [number, number][][] = [[[-Infinity, Infinity]]];
  const laneOf = new Map<BranchName, number>([['main', 0]]);
  const order = [...span.entries()].filter(([b]) => b !== 'main').sort((a, b) => b[1][1] - a[1][1]);
  for (const [branch, [t, b]] of order) {
    const pad = o.curve / 2;
    let lane = 1;
    while (lanes[lane]?.some(([t2, b2]) => t - pad < b2 && b + pad > t2)) lane++;
    (lanes[lane] ??= []).push([t, b]);
    laneOf.set(branch, lane);
  }

  const seen = new Set<BranchName>();
  for (const c of [...placed].reverse()) {
    c.lane = laneOf.get(c.branch) ?? 0;
    c.x = o.laneGap / 2 + c.lane * o.laneGap;
    c.forks = !seen.has(c.branch);
    seen.add(c.branch);
  }

  const edges: Edge[] = placed.flatMap((child) =>
    child.parents.map((id) => {
      const parent = byId.get(id)!;
      const { x: x1, y: y1 } = parent;
      const { x: x2, y: y2 } = child;
      const c = Math.min(o.curve, y1 - y2);
      const d =
        x1 === x2
          ? `M${x2} ${y2}V${y1}`
          : `M${x2} ${y2}C${x2} ${y2 + c * 0.55} ${x1} ${y2 + c * 0.45} ${x1} ${y2 + c}V${y1}`;
      return { key: `${id}-${child.id}`, d, branch: parent.branch, y0: y2, y1 };
    }),
  );

  const height = (placed[placed.length - 1]?.y ?? 0) + (o.rowHeights[placed.length - 1] ?? 0);
  return { rows: placed, edges, lanes: lanes.length, width: lanes.length * o.laneGap, height };
}
