// "Things I've built" (SPEC §2 Projects, §5 #3). Edit copy here.
// Status words must be honest: active / shipped / paused / stopped / archived.
// Commit counts and dates are computed from the baked GitHub data, not typed in.
import { burst, commits, commitsByYear, mergedPRCount, repos } from '../data/stats';
import { profile } from './profile';

export type ProjectStatus = 'active' | 'shipped' | 'paused' | 'stopped' | 'archived';

export interface ProjectLinks {
  repo?: string;
  live?: string;
  npm?: string;
  /** Extra repos, e.g. a bot and a site that make up one project */
  more?: { label: string; href: string }[];
}

export interface Project {
  id: string;
  name: string;
  /** Hebrew title, rendered in `.he` */
  nameHe?: string;
  status: ProjectStatus;
  /** The honest reason, shown after the status: "(stopped — …)" */
  statusNote?: string;
  /** "Jul 2026 – present" */
  period: string;
  /** One plain sentence of what it is */
  oneLiner: string;
  /** Short fact lines: numbers and concrete behaviour */
  facts: string[];
  stack: string[];
  links: ProjectLinks;
  /** Prompt Racers: the row gets a Play button that opens the game modal */
  play?: boolean;
  /** Public commits on the default branch(es), from commits.json */
  commits?: number;
  /** First and last commit dates (YYYY-MM-DD), from commits.json */
  commitSpan?: [string, string];
}

const gh = (repo: string) => `https://github.com/0xYoyo/${repo}`;

function commitStats(...names: string[]): Pick<Project, 'commits' | 'commitSpan'> {
  const dates = commits
    .filter((c) => names.includes(c.r))
    .map((c) => c.d)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  if (!dates.length) return {};
  return { commits: dates.length, commitSpan: [dates[0]!.slice(0, 10), dates[dates.length - 1]!.slice(0, 10)] };
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const burstLine = burst
  ? `${burst.prs.length} PRs merged across ${burst.issues.length} issues in 4 days on Unfiltered (${day(burst.start)} – ${day(burst.end)} 2026).`
  : null;

/** The eight Claude Code skills, shown on the yoyo-loop row */
export const loopSkills = [
  '/yoyo-init',
  '/yoyo-spec',
  '/yoyo-build',
  '/yoyo-review',
  '/yoyo-status',
  '/yoyo-watchdog',
  '/yoyo-diagnose',
  '/yoyo-design',
] as const;

/** The Unfiltered row's example search, then the refinement that follows it */
export const unfilteredQueries = ['elegant summer wedding dress, not black, under ₪400', 'same but cheaper'] as const;

export const projects: Project[] = [
  {
    id: 'yoyo-loop',
    name: 'yoyo-loop',
    status: 'active',
    period: 'Jul 2026 – present',
    oneLiner: 'An autonomous, human-gated software factory: eight Claude Code skills over Linear, GitHub and Slack.',
    facts: [
      '/yoyo-spec interviews me and files a Linear issue with AC-N acceptance criteria and NG-N non-goals.',
      '/yoyo-build claims an agent-ready issue, implements it in an isolated git worktree and opens a PR.',
      '/yoyo-review posts a three-group verdict tied to the exact commit and CI results. A human merges.',
      'Command guards, bounded repair cycles, stall detection, Slack alerts, sensitive-path escalation.',
      ...(burstLine ? [burstLine] : []),
      `${mergedPRCount('yoyo-loop')} PRs merged in its own repo. Started as an adaptation of Finn-loop.`,
    ],
    stack: ['Claude Code skills', 'Linear', 'GitHub', 'Slack', 'git worktrees'],
    links: { repo: gh('yoyo-loop') },
    ...commitStats('yoyo-loop'),
  },
  {
    id: 'unfiltered',
    name: 'Unfiltered',
    status: 'paused',
    period: 'Jul 2026 – Oct 2026',
    oneLiner:
      'A natural-language product search engine. Platform-independent, first distributed as a Shopify app.',
    facts: [
      'Turns a request in any language into ranked products; a follow-up like "same but cheaper" modifies the search.',
      'Schema-validated LLM intent extraction, hybrid vector and keyword retrieval, SQL constraints, model fallbacks, cost metering.',
      'Bilingual evaluation suite with 98 regression cases.',
      'p95 latency down ~70% on warm bilingual benchmarks (200 requests a run), by overlapping pipeline stages and hedging slow model calls.',
      'Engine v2 (Oct 2026) rebuilt around a decision model, the "judge".',
      `A boundary test fails if the engine ever imports Shopify. ${mergedPRCount('unfiltered')} PRs merged, mostly through yoyo-loop.`,
    ],
    stack: ['TypeScript', 'Node.js', 'React Router', 'PostgreSQL', 'Prisma', 'Gemini API', 'Docker', 'GitHub Actions', 'Vitest', 'Playwright'],
    links: { repo: gh('unfiltered') },
    ...commitStats('unfiltered'),
  },
  {
    id: 'prompt-racers',
    name: 'Prompt Racers',
    nameHe: 'מרוץ הפרומפטים',
    status: 'shipped',
    period: 'Aug 2026',
    oneLiner:
      'A 3D kart racer that teaches Israeli kids aged 8–15 prompt engineering. Built for the Base44 "Hour of Vibe Code" 2026 contest.',
    facts: [
      'One HTML file, zero network calls, no asset files. Graphics are procedural; audio is synthesized.',
      'Hebrew-first with full RTL and an English toggle.',
      "Seven AI opponents share the player's physics. Drift boosts, item boxes, prompt-building progression.",
      'Three quality tiers to hold 60 fps.',
      '17 test suites, plus a verify gate that intercepts every network request and fails on any.',
    ],
    stack: ['JavaScript', 'Three.js', 'Web Audio API', 'procedural generation', 'Puppeteer'],
    links: { repo: gh('prompt-racers') },
    play: true,
    ...commitStats('prompt-racers'),
  },
  {
    id: 'runi-connector',
    name: 'Reichman Courses connector',
    status: 'shipped',
    period: 'Oct 2026',
    oneLiner:
      'An unofficial MCP connector so Reichman students can ask Claude, ChatGPT or Claude Code about their own courses in plain language.',
    facts: [
      'Reads Moodle, syllabi, the Student Info Station, Panopto lecture transcripts and Piazza.',
      'Submits assignments or posts to forums only after explicit confirmation.',
      'Published on npm; installs by double-clicking a .mcpb, or with one npx command.',
      'Credentials stay in the OS secure storage. It never retries a wrong password, so it cannot lock an account.',
      "First built on Cloudflare Workers. The university's bot protection blocks cloud servers, so it ships as a local connector.",
    ],
    stack: ['TypeScript', 'MCP', 'Node.js'],
    links: { repo: gh('runi-connector'), npm: 'https://www.npmjs.com/package/reichman-courses-connector' },
    ...commitStats('runi-connector'),
  },
  {
    id: 'availability-monitor',
    name: 'Availability Monitor',
    status: 'shipped',
    period: 'Mar – Apr 2026',
    oneLiner: 'Telegram alerts when a room opens up at the Metzoke Dragot hotel.',
    facts: [
      'Flexible date windows, stay length and guest count.',
      'Runs locally or on GitHub Actions.',
      'Found a last-minute Passover stay.',
    ],
    stack: ['TypeScript', 'Node 22', 'GitHub Actions', 'Telegram Bot API'],
    links: { repo: gh('availability-monitor') },
    ...commitStats('availability-monitor'),
  },
  {
    id: 'polybot',
    name: 'Polybot',
    status: 'stopped',
    statusNote: "the edge wasn't strong enough",
    period: 'Mar 2026',
    oneLiner: 'Polymarket sports prices, observed against Pinnacle-derived reference prices.',
    facts: [
      'Immutable time-series snapshots, as a hard rule.',
      'Request broker with allowlists, dry-run, budget caps and a kill switch.',
      '11 leagues, including 3-way soccer markets.',
      "Stopped in Oct 2026: the evidence of an edge wasn't strong enough, and big firms have the latency.",
    ],
    stack: ['TypeScript', 'Next.js', 'Prisma', 'PostgreSQL'],
    links: { repo: gh('polybot') },
    ...commitStats('polybot'),
  },
  {
    id: 'orditax',
    name: 'Orditax',
    status: 'archived',
    period: 'Jun 2025',
    oneLiner: 'A tax pipeline for the Bitcoin ecosystem: BTC, Ordinals, Runes and BRC-20.',
    facts: [
      'Eight steps: bootstrap, ingest, fetch, classify, enhance, augment, export, validate.',
      'Dual-address wallets (payment and taproot), FIFO or LIFO cost basis, CSV export.',
    ],
    stack: ['Node.js', 'Maestro indexer API', 'CoinGecko'],
    links: { repo: gh('orditax') },
    ...commitStats('orditax'),
  },
  {
    id: 'discord-pnl-bot',
    name: 'Discord PnL bot',
    status: 'shipped',
    period: 'Sep 2023',
    oneLiner: 'Realized and unrealized P&L reports for a community, from wallet-level buys, sells, fees and holdings.',
    facts: ['Tokens and NFTs across EVM chains, Solana and Bitcoin.', 'Hand-written, before AI.'],
    stack: ['JavaScript'],
    links: { repo: gh('discord-PnL-bot-0xYoyo') },
    ...commitStats('discord-PnL-bot-0xYoyo'),
  },
  {
    id: 'vortex',
    name: 'Vortex application system',
    status: 'shipped',
    period: '2023 – 2025',
    oneLiner: 'Community admissions: an application site, X (Twitter) OAuth, Discord member voting and an admin dashboard.',
    facts: ['The Discord bot came first, in Dec 2023; the site followed in Mar – Apr 2025.'],
    stack: ['React', 'Node.js', 'MongoDB'],
    links: {
      repo: gh('vortex-application'),
      more: [{ label: 'Bot on GitHub', href: gh('vortex-bot') }],
    },
    ...commitStats('vortex-application', 'vortex-bot'),
  },
];

/** The compact "Odin era" cluster that closes the list */
export interface EraCluster {
  name: string;
  period: string;
  /** Repos created in 2023, from repos.json */
  repos2023: number;
  /** Commits made in 2023, from commits.json */
  commits2023: number;
  summary: string;
  examples: string[];
  links: { label: string; href: string }[];
}

export const odinEra: EraCluster = {
  name: 'Odin era',
  period: '2022 – 2023',
  repos2023: repos.filter((r) => r.created_at.startsWith('2023')).length,
  commits2023: commitsByYear['2023'] ?? 0,
  summary: '30+ small deployed projects, hand-written while doing The Odin Project full-time.',
  examples: [
    'battleship (TDD)',
    'a React shopping cart (TDD)',
    'a social network',
    'an inventory app',
    'a blog API',
    "where's-waldo on Firebase",
  ],
  links: [
    { label: 'GitHub profile', href: profile.links.github },
    { label: 'portfolio v0.1', href: profile.links.v01 },
    { label: 'shopping cart, live', href: 'https://lumiereshop.netlify.app' },
  ],
};
