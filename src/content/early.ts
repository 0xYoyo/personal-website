// The "Early" timeline (SPEC §5 #4). Edit copy here.
//
// Every date is either provable from the baked GitHub data (a repo's first
// commit in data/commits.json, computed below so it can't drift) or a stated
// fact from SPEC §2. `source` records which, for review; it is not rendered.
// Third-party launch dates ("world") appear only where certain.
import { commits, commitsByYear, lastCommit, repos } from '../data/stats';

export interface EarlyMoment {
  /** 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'; printed as-is on the spine */
  date: string;
  /** The wave, in two or three words */
  wave: string;
  /** What was happening in the world, if anything (muted) */
  world?: string;
  /** What he did */
  him: string;
  evidence?: { label: string; url: string };
  source: 'data' | 'stated';
  /** A deliberate gap: drawn dashed and at a length proportional to `months` */
  gap?: { months: number; note: string };
}

const GH = 'https://github.com/0xYoyo';
const repoLink = (name: string) => ({ label: `0xYoyo/${name}`, url: `${GH}/${name}` });

/** Local calendar date (committer's offset) of a repo's first public commit. */
export function firstCommitDate(repo: string): string {
  const ds = commits.filter((c) => c.r === repo).map((c) => c.d);
  if (!ds.length) throw new Error(`no commits for ${repo}`);
  return ds.sort((a, b) => Date.parse(a) - Date.parse(b))[0]!.slice(0, 10);
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;

/** Whole calendar months with zero public commits after `fromYm` (e.g. 2024-02 to 2025-02 = 13). */
function silentMonthsAfter(fromYm: string): number {
  const active = new Set(commits.map((c) => monthIndex(c.d.slice(0, 7))));
  let m = monthIndex(fromYm) + 1;
  let n = 0;
  while (!active.has(m)) {
    n++;
    m++;
  }
  return n;
}

const fccRepos = repos.filter((r) => /-fcc/i.test(r.name) && r.created_at < '2023');
const c2024 = commits.filter((c) => c.d.startsWith('2024'));
const lastActive2024 = c2024.map((c) => c.d.slice(0, 7)).sort().pop() ?? '2024-01';
const silent = silentMonthsAfter(lastActive2024);
const onlyJanuary = c2024.every((c) => c.d.startsWith('2024-01'));
const md = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const earlyLede = 'I tend to be there when a wave starts.';

export const earlyMoments: EarlyMoment[] = [
  {
    date: '2021-07',
    wave: 'Crypto',
    him: 'Started trading and doing on-chain research across the Bitcoin, Ethereum and Solana ecosystems.',
    source: 'stated',
  },
  {
    date: firstCommitDate('hardhat-fundme-fcc-0xyoyo'),
    wave: 'Smart contracts',
    him: `First commit: a Solidity contract on Hardhat, from the freeCodeCamp course. ${fccRepos.length} course repos by the end of November.`,
    evidence: repoLink('hardhat-fundme-fcc-0xyoyo'),
    source: 'data',
  },
  {
    date: firstCommitDate('odin-recipes-0xYoyo'),
    wave: 'The Odin Project',
    him: 'First Odin Project repo. Then a year of full-time self-study, written by hand before AI tools: JavaScript, React, Node, MongoDB, TDD, 30+ deployed projects.',
    evidence: repoLink('odin-recipes-0xYoyo'),
    source: 'data',
  },
  {
    date: '2023-01',
    wave: 'Ordinals',
    world: 'The Ordinals protocol launches on Bitcoin.',
    him: 'Early 2023, advised one of the first Ordinals projects on its launch and community positioning.',
    source: 'stated',
  },
  {
    date: firstCommitDate('discord-PnL-bot-0xYoyo'),
    wave: 'Multi-chain tooling',
    him: 'A Discord P&L bot, written by hand: wallet-level buys, sells, fees and holdings across EVM chains, Solana and Bitcoin.',
    evidence: repoLink('discord-PnL-bot-0xYoyo'),
    source: 'data',
  },
  {
    date: '2024',
    wave: 'Away',
    him: 'Most of the year solo-travelling Southeast Asia, after the army.',
    gap: {
      months: silent,
      note: `${commitsByYear['2024'] ?? 0} commits${onlyJanuary ? ', all in January' : ''}. Then none for ${silent} months.`,
    },
    source: 'stated',
  },
  {
    date: firstCommitDate('vortex-application'),
    wave: 'AI-assisted coding',
    world: "Claude Code's research preview arrived in February 2025.",
    him: 'Back to building, with AI in the loop: Google AI Studio models in Cursor, then Claude Code. vortex-application, code-mapper, sentiment-analysis, and Orditax in June.',
    evidence: repoLink('vortex-application'),
    source: 'data',
  },
  {
    date: '2025-10',
    wave: 'University',
    him: 'Started a B.Sc. in Computer Science with a B.A. in Entrepreneurship at Reichman University.',
    source: 'stated',
  },
  {
    date: firstCommitDate('polybot'),
    wave: 'Prediction markets',
    him: `Polybot, watching Polymarket sports prices against Pinnacle-derived reference prices. Availability Monitor on ${md(firstCommitDate('availability-monitor'))}.`,
    evidence: repoLink('polybot'),
    source: 'data',
  },
  {
    date: firstCommitDate('loop-tryouts'),
    wave: 'Agent factories',
    him: `First commits of the agent-factory era. yoyo-loop on ${md(firstCommitDate('yoyo-loop'))}, Unfiltered on ${md(firstCommitDate('unfiltered'))}, Prompt Racers on ${md(firstCommitDate('prompt-racers'))}. ${(commitsByYear['2026'] ?? 0).toLocaleString('en-US')} commits in 2026 so far.`,
    evidence: repoLink('yoyo-loop'),
    source: 'data',
  },
  {
    date: firstCommitDate('runi-connector').slice(0, 7),
    wave: 'MCP',
    world: 'Anthropic introduced the Model Context Protocol in November 2024.',
    him: 'Reichman Courses connector: an MCP server so students can ask Claude about their own courses. Published on npm.',
    evidence: repoLink('runi-connector'),
    source: 'data',
  },
];

/** Public commits per year, oldest first, for the closing line. */
export const commitsPerYear = Object.entries(commitsByYear)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([year, n]) => ({ year, n }));

/** "Oct 19", the last commit in the baked data (the current year is partial). */
export const dataThrough = lastCommit ? md(lastCommit.d.slice(0, 10)) : null;
