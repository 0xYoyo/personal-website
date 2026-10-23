// Real numbers derived from the baked GitHub data (gathered 2026-10-23 from
// clones of every public repo; see SPEC §8). Everything here is computed from
// the JSON files at build time except the values marked "from summary.md",
// which need data the JSON does not carry (commit trailers).
import commitsJson from './commits.json';
import prsJson from './prs.json';
import reposJson from './repos.json';

export interface Commit {
  /** repo */
  r: string;
  /** sha7 */
  s: string;
  /** ISO date with the committer's offset */
  d: string;
  a: string;
  /** subject line */
  m: string;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  merged: boolean;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  author: string;
  labels: string[];
  branch: string;
}

export interface Repo {
  name: string;
  language: string | null;
  created_at: string;
  pushed_at: string;
  description: string | null;
  homepage: string | null;
  size: number;
}

export const commits = commitsJson as Commit[];
export const prs = prsJson as PullRequest[];
export const repos = reposJson as Repo[];

const byDate = [...commits].sort((a, b) => Date.parse(a.d) - Date.parse(b.d));

export const commitCount = commits.length;
export const repoCount = repos.length;
export const firstCommit = byDate[0] ?? null;
export const lastCommit = byDate[byDate.length - 1] ?? null;

export const commitsByYear: Record<string, number> = commits.reduce<Record<string, number>>((acc, c) => {
  const y = c.d.slice(0, 4);
  acc[y] = (acc[y] ?? 0) + 1;
  return acc;
}, {});

/** GitHub "Merge pull request" commits: a human pressed merge. */
export const mergeCommitCount = commits.filter((c) => c.m.startsWith('Merge pull request')).length;

/** From summary.md: commits carrying a Co-Authored-By trailer naming a Claude model. */
export const agentCoAuthoredCommits = 550;

export const mergedPRs = prs.filter((p) => p.merged_at !== null);

export function mergedPRCount(repo: string): number {
  return mergedPRs.filter((p) => p.repo === repo).length;
}

export interface Burst {
  repo: string;
  start: string;
  end: string;
  prs: PullRequest[];
  issues: string[];
}

const ISSUE_RE = /YOY-\d+/;
const issueOf = (p: PullRequest) => p.branch.match(ISSUE_RE)?.[0] ?? p.title.match(ISSUE_RE)?.[0] ?? null;

/**
 * The densest rolling window of merged PRs in one repo. For unfiltered over
 * 96 hours this is 2026-10-03 15:53Z to 2026-10-07 15:24Z: 44 PRs, 18 issues.
 */
export function densestWindow(repo: string, hours = 96): Burst | null {
  const list = mergedPRs
    .filter((p) => p.repo === repo)
    .sort((a, b) => Date.parse(a.merged_at!) - Date.parse(b.merged_at!));
  const span = hours * 3_600_000;
  let best: { i: number; j: number } | null = null;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    while (j + 1 < list.length && Date.parse(list[j + 1]!.merged_at!) - Date.parse(list[i]!.merged_at!) <= span) j++;
    if (!best || j - i > best.j - best.i) best = { i, j };
  }
  if (!best) return null;
  const window = list.slice(best.i, best.j + 1);
  const issues = [...new Set(window.map(issueOf).filter((x): x is string => x !== null))].sort(
    (a, b) => Number(a.slice(4)) - Number(b.slice(4)),
  );
  return { repo, start: window[0]!.merged_at!, end: window[window.length - 1]!.merged_at!, prs: window, issues };
}

export const burst = densestWindow('unfiltered');

/** "1,405" */
export const fmt = (n: number) => n.toLocaleString('en-US');
