// The carded projects: the main row (2026, then the PnL bot, Polybot and Vortex), then yoyo-network alone
// on the "Written by hand" shelf (WAVE3 V4, FIX4 C1). Facts are ported from v2's
// projects.ts (verified against the baked GitHub data, 2026-10-23); commit and
// PR counts are baked literals computed from data/commits.json and prs.json so
// the site doesn't ship 300 kB of JSON. Status words are mine: be honest.
// `voiceLine` is first person and human (what it does for a person); the stack stays in `stack`.
import type { GlyphId, ProjectId } from '@yoyo/protocol';

export type ProjectStatus = 'active' | 'shipped' | 'paused' | 'stopped' | 'archived';
/** Showcase component ids (one per project; the showcases part delivers them). */
export type ShowcaseId = ProjectId;

export interface ProjectLink {
  kind: 'repo' | 'live' | 'npm';
  label: string;
  href: string;
}

export interface Project {
  id: ProjectId;
  name: string;
  /** Hebrew title, rendered with Heebo */
  nameHe?: string;
  status: ProjectStatus;
  /** The honest reason, shown with the status */
  statusNote?: string;
  /** "Jul 2026 – present" */
  period: string;
  /** One line in my voice: what it does for a person, no stack words (WAVE3 V4) */
  voiceLine: string;
  /** One plain sentence of what it is (screen readers, history, OG) */
  oneLiner: string;
  /** The two small facts on the card: human, numbers allowed, no jargon (WAVE3 V4) */
  cardFacts: [string, string];
  /** All verified facts (the agent may quote these) */
  facts: string[];
  stack: string[];
  links: ProjectLink[];
  /** Prompt Racers: the card gets a Play button that opens the game */
  play?: boolean;
  /** the second shelf's header ("Written by hand"); the card shows it above itself */
  shelf?: string;
  glyph: GlyphId;
  showcase: ShowcaseId;
  /** Public commits on the default branch, from commits.json */
  commits: number;
  /** First and last commit dates (YYYY-MM-DD), from commits.json */
  commitSpan: [string, string];
  /** Merged PRs, from prs.json (0 when the repo has no PRs) */
  mergedPRs: number;
}

const gh = (repo: string): ProjectLink => ({ kind: 'repo', label: 'GitHub', href: `https://github.com/0xYoyo/${repo}` });

/** The eight Claude Code skills of yoyo-loop */
export const loopSkills = [
  '/yoyo-init', '/yoyo-spec', '/yoyo-build', '/yoyo-review', '/yoyo-status', '/yoyo-watchdog', '/yoyo-diagnose', '/yoyo-design',
] as const;

/** The Unfiltered example search, then the refinement that follows it */
export const unfilteredQueries = ['elegant summer wedding dress, not black, under ₪400', 'same but cheaper'] as const;

/** Densest 96 hours on Unfiltered (summary.md): 2026-10-03 15:53Z → 10-07 15:24Z */
export const burst = { prs: 44, issues: 18, start: '2026-10-03', end: '2026-10-07' } as const;

// Order per WAVE3 V4 / FIX4 C1: the main row, then "Written by hand" (the card shows `shelf`).
/** The second shelf's header (WAVE3 V4). */
export const HAND_SHELF = 'Written by hand';

export const projects: Project[] = [
  {
    id: 'unfiltered',
    name: 'Unfiltered',
    status: 'paused',
    statusNote: "no paying merchants, and the engine hadn't cleared my own bar",
    period: 'Jul – Oct 2026',
    voiceLine: "Type what you want the way you'd say it to a friend. It finds the product.",
    oneLiner: 'A natural-language product search engine. Platform-independent, first distributed as a Shopify app.',
    cardFacts: ['Any language, and follow-ups like "same but cheaper".', '245 pull requests merged, most of them built by my agents.'],
    facts: [
      'Turns a request in any language into ranked products; a follow-up like "same but cheaper" modifies the search.',
      'Schema-validated LLM intent extraction, hybrid vector and keyword retrieval, SQL constraints, model fallbacks, cost metering.',
      'Bilingual evaluation suite with 98 regression cases.',
      'p95 latency down ~70% on warm bilingual benchmarks (200 requests a run), by overlapping pipeline stages and hedging slow model calls.',
      'Engine v2 (Oct 2026) rebuilt around a decision model, the "judge".',
      'A boundary test fails if the engine ever imports Shopify. 245 PRs merged, mostly through yoyo-loop.',
    ],
    stack: ['TypeScript', 'Node.js', 'React Router', 'PostgreSQL', 'Prisma', 'Gemini API', 'Docker', 'GitHub Actions', 'Vitest', 'Playwright'],
    links: [gh('unfiltered')],
    glyph: 'magnifier',
    showcase: 'unfiltered',
    commits: 621,
    commitSpan: ['2026-07-31', '2026-10-18'],
    mergedPRs: 245,
  },
  {
    id: 'prompt-racers',
    name: 'Prompt Racers',
    nameHe: 'מרוץ הפרומפטים',
    status: 'shipped',
    period: 'Aug 2026',
    voiceLine: 'A kart racer that teaches kids how to talk to AI. Play it.',
    oneLiner:
      'A 3D kart racer that teaches Israeli kids aged 8–15 prompt engineering. Built for the Base44 "Hour of Vibe Code" 2026 contest.',
    cardFacts: ['One file. Nothing loads from the internet.', 'Seven AI opponents race on the same physics as you.'],
    facts: [
      'One HTML file, zero network calls, no asset files. Graphics are procedural; audio is synthesized.',
      'Hebrew-first with full RTL and an English toggle.',
      "Seven AI opponents share the player's physics. Drift boosts, item boxes, prompt-building progression.",
      'Three quality tiers to hold 60 fps.',
      '17 test suites, plus a verify gate that intercepts every network request and fails on any.',
    ],
    stack: ['JavaScript', 'Three.js', 'Web Audio API', 'procedural generation', 'Puppeteer'],
    links: [gh('prompt-racers')],
    play: true,
    glyph: 'kart',
    showcase: 'prompt-racers',
    commits: 59,
    commitSpan: ['2026-08-06', '2026-08-25'],
    mergedPRs: 3,
  },
  {
    id: 'yoyo-loop',
    name: 'yoyo-loop',
    status: 'active',
    period: 'Jul 2026 – present',
    voiceLine: 'How I build now: I write the spec, agents do the rest, I merge.',
    oneLiner: 'An autonomous, human-gated software factory: eight Claude Code skills over Linear, GitHub and Slack.',
    cardFacts: ['44 pull requests in four days on one product.', 'Nothing ships until I merge it.'],
    facts: [
      '/yoyo-spec interviews me and files a Linear issue with AC-N acceptance criteria and NG-N non-goals.',
      '/yoyo-build claims an agent-ready issue, implements it in an isolated git worktree and opens a PR.',
      '/yoyo-review posts a three-group verdict tied to the exact commit and CI results. A human merges.',
      'Command guards, bounded repair cycles, stall detection, Slack alerts, sensitive-path escalation.',
      '44 PRs merged across 18 issues in 4 days on Unfiltered (3 Oct – 7 Oct 2026).',
      '55 PRs merged in its own repo. Started as an adaptation of Finn-loop; now mine.',
    ],
    stack: ['Claude Code skills', 'Linear', 'GitHub', 'Slack', 'git worktrees'],
    links: [gh('yoyo-loop')],
    glyph: 'loop',
    showcase: 'yoyo-loop',
    commits: 122,
    commitSpan: ['2026-07-29', '2026-10-16'],
    mergedPRs: 55,
  },
  {
    id: 'runi-connector',
    name: 'Reichman Courses connector',
    status: 'shipped',
    period: 'Oct 2026',
    voiceLine: "Ask Claude what's due this week. It checks your actual courses.",
    oneLiner:
      'An unofficial MCP connector so Reichman students can ask Claude, ChatGPT or Claude Code about their own courses in plain language.',
    cardFacts: ['Installs by double-click. Published on npm.', 'Never submits anything without asking you first.'],
    facts: [
      'Reads Moodle, syllabi, the Student Info Station, Panopto lecture transcripts and Piazza.',
      'Submits assignments or posts to forums only after explicit confirmation.',
      'Published on npm; installs by double-clicking a .mcpb, or with one npx command.',
      'Credentials stay in the OS secure storage. It never retries a wrong password, so it cannot lock an account.',
      "First built on Cloudflare Workers. The university's bot protection blocks cloud servers, so it ships as a local connector.",
    ],
    stack: ['TypeScript', 'MCP', 'Node.js'],
    links: [gh('runi-connector'), { kind: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/reichman-courses-connector' }],
    glyph: 'cap',
    showcase: 'runi-connector',
    commits: 42,
    commitSpan: ['2026-10-14', '2026-10-19'],
    mergedPRs: 0,
  },
  {
    id: 'availability-monitor',
    name: 'Availability Monitor',
    status: 'shipped',
    period: 'Mar – Apr 2026',
    voiceLine: 'A sold-out hotel, a Telegram ping the second a room opens.',
    oneLiner: 'Telegram alerts when a room opens up at the Metzoke Dragot hotel.',
    cardFacts: ['Got me a last-minute Passover room.', 'Any dates, any stay length, any number of guests.'],
    facts: ['Flexible date windows, stay length and guest count.', 'Runs locally or on GitHub Actions.', 'Found a last-minute Passover stay.'],
    stack: ['TypeScript', 'Node 22', 'GitHub Actions', 'Telegram Bot API'],
    links: [gh('availability-monitor')],
    glyph: 'tent',
    showcase: 'availability-monitor',
    commits: 7,
    commitSpan: ['2026-03-31', '2026-04-01'],
    mergedPRs: 0,
  },
  {
    id: 'pnl-bot',
    name: 'Discord PnL bot',
    status: 'shipped',
    period: 'Sep 2023',
    voiceLine: "What a community's wallets actually made. Written by hand in 2023.",
    oneLiner: 'Realized and unrealized P&L reports for a community, from wallet-level buys, sells, fees and holdings.',
    cardFacts: ['Tokens and NFTs on Ethereum-style chains, Solana and Bitcoin.', 'Built for a community of about 100–200 members.'],
    facts: ['Tokens and NFTs across EVM chains, Solana and Bitcoin.', 'Hand-written, before AI.', 'Built for a community of ~100–200 members.'],
    stack: ['JavaScript'],
    links: [gh('discord-PnL-bot-0xYoyo')],
    glyph: 'chart',
    showcase: 'pnl-bot',
    commits: 57,
    commitSpan: ['2023-09-04', '2024-01-29'],
    mergedPRs: 0,
  },
  {
    id: 'polybot',
    name: 'Polybot',
    status: 'stopped',
    statusNote: "the edge wasn't strong enough",
    period: 'Mar 2026 · stopped Oct 2026',
    voiceLine: 'A bet I stopped when the numbers said stop.',
    oneLiner: 'Polymarket sports prices, observed against Pinnacle-derived reference prices.',
    cardFacts: ["Watched 11 sports leagues against a sharp bookmaker's prices.", "Budget caps and a kill switch on every outside request."],
    facts: [
      'Immutable time-series snapshots, as a hard rule.',
      'Request broker with allowlists, dry-run, budget caps and a kill switch.',
      '11 leagues, including 3-way soccer markets.',
      "Stopped in Oct 2026: the evidence of an edge wasn't strong enough, and big firms have the latency.",
    ],
    stack: ['TypeScript', 'Next.js', 'Prisma', 'PostgreSQL'],
    links: [gh('polybot')],
    glyph: 'diverge',
    showcase: 'polybot',
    commits: 5,
    commitSpan: ['2026-03-10', '2026-03-12'],
    mergedPRs: 0,
  },
  {
    id: 'vortex',
    name: 'Vortex application system',
    status: 'shipped',
    period: '2023–2025',
    voiceLine: 'How a community lets new people in: apply with X, members vote in Discord, an admin decides.',
    oneLiner: 'Community admissions: X (Twitter) sign-in, Discord member voting and an admin dashboard.',
    cardFacts: ['Members vote on every applicant in Discord.', 'The bot written by hand in 2023; the site in 2025.'],
    facts: [
      'Applicants sign in with X (Twitter) OAuth.',
      'Community members vote on each application in Discord.',
      'An admin dashboard shows the votes and decides.',
      'The Discord bot is from Sep 2023 – Jan 2024; the application site from Mar–Apr 2025.',
    ],
    stack: ['React', 'Node.js', 'MongoDB', 'Discord.js', 'X OAuth'],
    links: [gh('vortex-application'), { kind: 'repo', label: 'Bot', href: 'https://github.com/0xYoyo/vortex-bot' }],
    glyph: 'check',
    showcase: 'vortex',
    commits: 89,
    commitSpan: ['2023-09-04', '2025-04-08'],
    mergedPRs: 0,
  },
  {
    id: 'yoyo-network',
    name: 'yoyo-network',
    status: 'shipped',
    period: 'Jul – Aug 2023',
    voiceLine: 'A social network I wrote from scratch: sign up, post, follow, like.',
    oneLiner: 'A full-stack social network with its own REST API and login, written by hand during The Odin Project.',
    cardFacts: ['Posts with photos, likes, comments and follows.', 'Its own backend and login, written by hand in 2023.'],
    facts: [
      'A RESTful, stateless API and a React front end that talks to it.',
      'Sign up, log in, or look around as a guest with a demo profile.',
      'Home feed of followed users, profiles, follow and unfollow, posts with pictures, likes and comments.',
      'Login with Passport, bcrypt and JWTs; image uploads through Multer and Cloudinary.',
    ],
    stack: ['JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'Passport', 'JWT'],
    links: [gh('yoyo-network-0xYoyo'), { kind: 'live', label: 'Live', href: 'https://yoyo-network.netlify.app/' }],
    glyph: 'keyboard',
    showcase: 'yoyo-network',
    shelf: HAND_SHELF,
    commits: 58,
    commitSpan: ['2023-07-30', '2023-08-25'],
    mergedPRs: 0,
  },
];

export const projectById = (id: ProjectId): Project => {
  const p = projects.find((x) => x.id === id);
  if (!p) throw new Error(`unknown project ${id}`);
  return p;
};

export function neighbour(id: ProjectId, dir: 1 | -1): Project {
  const i = projects.findIndex((p) => p.id === id);
  const n = projects.length;
  return projects[(((i + dir) % n) + n) % n]!;
}
