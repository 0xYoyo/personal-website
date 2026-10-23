// #5 Life as a git log (SPEC §5 #5). Edit the story here; the layout is computed
// in src/sections/gitlog/layout.ts. Newest first is how it renders, but write
// commits in any order: they are sorted by `at`.
//
// Hashes: a commit with `repo` shows the real sha7 of that repo's first public
// commit (on or after `after`, if given), looked up in src/data/commits.json.
// Life events have no repo, so their hash is derived from their own message
// and the section says so under the graph.
import { commits, type Commit } from '../data/stats';

export type BranchName = 'main' | 'army' | 'crypto' | 'code' | 'travel/southeast-asia' | 'university' | 'agents';

export interface GitCommit {
  id: string;
  branch: BranchName;
  /** ISO date used for vertical position (month precision is fine) */
  at: string;
  /** What the date column shows; honest about precision ("early 2023") */
  date: string;
  message: string;
  /** Older commits this one descends from; the first parent is on the same branch */
  parents: string[];
  tag?: string;
  /** Real repo behind this commit: its sha is shown instead of a derived one */
  repo?: { name: string; after?: string };
}

/** Lane colours: --fg at varying strength, cobalt for agents. No rainbow. */
export const branchStrength: Record<BranchName, number> = {
  main: 88,
  army: 64,
  crypto: 46,
  code: 72,
  'travel/southeast-asia': 34,
  university: 56,
  agents: 100,
};

export const HEAD_BRANCH: BranchName = 'main';

export const gitCommits: GitCommit[] = [
  { id: 'root', branch: 'main', at: '2019-10-01', date: 'Oct 2019', message: 'initial commit', parents: [] },

  { id: 'enlist', branch: 'army', at: '2019-10-08', date: 'Oct 2019', message: 'enlist in the Israel Defense Forces', parents: ['root'] },
  { id: 'meitav', branch: 'army', at: '2019-10-20', date: 'Oct 2019', message: 'Meitav — personnel assignment', parents: ['enlist'] },
  { id: 'appeal', branch: 'army', at: '2020-01-01', date: '2019–20', message: 'appeal medical profile to volunteer for combat', parents: ['meitav'] },
  { id: 'unit636', branch: 'army', at: '2020-03-01', date: '2020–22', message: 'Unit 636, Field Intelligence Corps — combat service', parents: ['appeal'] },
  { id: 'discharged', branch: 'army', at: '2022-07-01', date: 'Jul 2022', message: 'discharged', parents: ['unit636'] },
  { id: 'merge-army', branch: 'main', at: '2022-07-15', date: 'Jul 2022', message: "Merge branch 'army'", parents: ['root', 'discharged'] },

  { id: 'trading', branch: 'crypto', at: '2021-07-01', date: 'Jul 2021', message: 'start trading and on-chain research', parents: ['unit636'] },
  { id: 'communities', branch: 'crypto', at: '2021-10-01', date: '2021', message: 'communities: Bitcoin, Ethereum, Solana', parents: ['trading'] },
  { id: 'ordinals', branch: 'crypto', at: '2023-02-01', date: 'early 2023', message: 'advise one of the first Ordinals projects', parents: ['communities'] },

  { id: 'fcc', branch: 'code', at: '2022-09-07', date: 'Sep 2022', message: 'freeCodeCamp Solidity and Hardhat', parents: ['merge-army'], repo: { name: 'hardhat-fundme-fcc-0xyoyo' } },
  { id: 'odin', branch: 'code', at: '2022-10-15', date: 'Oct 2022', message: 'The Odin Project, full time until Sep 2023', parents: ['fcc'] },
  { id: 'portfolio', branch: 'code', at: '2023-06-01', date: 'Jun 2023', message: 'first portfolio', parents: ['odin'], repo: { name: 'personal-portfolio-0xYoyo' } },
  { id: 'pnl', branch: 'code', at: '2023-09-04', date: 'Sep 2023', message: 'Discord PnL bot', parents: ['portfolio', 'ordinals'], repo: { name: 'discord-PnL-bot-0xYoyo' } },
  { id: 'vortex-bot', branch: 'code', at: '2023-12-12', date: 'Dec 2023', message: 'Vortex bot', parents: ['pnl'], repo: { name: 'vortex-bot', after: '2023-12-01' } },

  { id: 'travel', branch: 'travel/southeast-asia', at: '2024-02-01', date: '2024', message: 'solo, most of the year', parents: ['vortex-bot'] },
  { id: 'merge-travel', branch: 'code', at: '2025-03-01', date: 'Mar 2025', message: "Merge branch 'travel/southeast-asia'", parents: ['vortex-bot', 'travel'] },

  { id: 'vortex-app', branch: 'code', at: '2025-03-08', date: 'Mar 2025', message: 'vortex-application', parents: ['merge-travel'], repo: { name: 'vortex-application' } },
  { id: 'code-mapper', branch: 'code', at: '2025-03-16', date: 'Mar 2025', message: 'code-mapper', parents: ['vortex-app'], repo: { name: 'code-mapper' } },
  { id: 'sentiment', branch: 'code', at: '2025-04-17', date: 'Apr 2025', message: 'sentiment-analysis', parents: ['code-mapper'], repo: { name: 'sentiment-analysis' } },
  { id: 'orditax', branch: 'code', at: '2025-06-11', date: 'Jun 2025', message: 'orditax', parents: ['sentiment'], repo: { name: 'orditax' } },

  { id: 'reichman', branch: 'university', at: '2025-10-01', date: 'Oct 2025', message: 'Reichman — CS + Entrepreneurship', parents: ['merge-army'] },
  { id: 'gpa', branch: 'university', at: '2026-07-10', date: 'Jul 2026', message: 'first year GPA 89.4', parents: ['reichman'] },

  { id: 'yoyo-loop', branch: 'agents', at: '2026-07-29', date: 'Jul 2026', message: 'yoyo-loop', parents: ['orditax'], repo: { name: 'yoyo-loop' } },
  { id: 'unfiltered', branch: 'agents', at: '2026-07-31', date: 'Jul 2026', message: 'Unfiltered', parents: ['yoyo-loop'], repo: { name: 'unfiltered' } },
  { id: 'prompt-racers', branch: 'agents', at: '2026-08-06', date: 'Aug 2026', message: 'Prompt Racers', parents: ['unfiltered'], repo: { name: 'prompt-racers' } },
  { id: 'runi', branch: 'agents', at: '2026-10-14', date: 'Oct 2026', message: 'Reichman Courses connector', parents: ['prompt-racers'], repo: { name: 'runi-connector' } },

  { id: 'head', branch: 'main', at: '2026-10-23', date: 'Oct 2026', message: 'this page', parents: ['merge-army', 'runi'], tag: 'v2.0' },
];

/** The quiet stretch, annotated in the gap it leaves. From SPEC §8. */
export const gitGap = {
  from: 'travel',
  to: 'merge-travel',
  note: '# 13 months, 21 commits, all of them in January 2024',
};

export const gitFootnote =
  'Hashes on code commits are the real first commit of that repo. Life events hash their own message.';

/** 7-char FNV-1a of the message: stable, and obviously not a real object id. */
function derivedSha(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 7);
}

export function shaOf(c: GitCommit): { sha: string; real: boolean; commit?: Commit } {
  if (c.repo) {
    const { name, after = '' } = c.repo;
    const hit = commits
      .filter((x) => x.r === name && x.d >= after)
      .sort((a, b) => Date.parse(a.d) - Date.parse(b.d))[0];
    if (hit) return { sha: hit.s, real: true, commit: hit };
  }
  return { sha: derivedSha(c.message), real: false };
}
