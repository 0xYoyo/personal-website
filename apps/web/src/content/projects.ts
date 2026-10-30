// The carded projects in two eras (WAVE4 C1): AI-assisted (Polybot and later), then hand-written (the
// sentiment gauge and earlier: chat help at most). The Work overlay's toggle picks the era. Facts are ported from v2's
// projects.ts (verified against the baked GitHub data, 2026-10-23); commit and
// PR counts are baked literals computed from data/commits.json and prs.json so
// the site doesn't ship 300 kB of JSON. Status words are mine: be honest.
// `voiceLine` is the one-liner shown big; the card copy (voiceLine, cardFacts) is WAVE4 C1's, verbatim.
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
  /** The honest reason, shown with the status (WAVE4 C1: Polybot only) */
  statusNote?: string;
  /** Which side of the Work toggle the card sits on (WAVE4 C1) */
  era: 'ai' | 'hand';
  /** "Jul 2026 – present" */
  period: string;
  /** The one-liner shown big on the card (WAVE4 C1) */
  voiceLine: string;
  /** One plain sentence of what it is (screen readers, history, OG) */
  oneLiner: string;
  /** The three small facts on the card: universal words, no implementation details (WAVE4 C1) */
  cardFacts: [string, string, string];
  /** All verified facts (the agent may quote these) */
  facts: string[];
  stack: string[];
  links: ProjectLink[];
  /** Prompt Racers: the card gets a Play button that opens the game */
  play?: boolean;
  /** @deprecated WAVE4 C1: the Work toggle replaces the "Written by hand" shelf label; no project sets it */
  shelf?: string;
  glyph: GlyphId;
  showcase: ShowcaseId;
  /** Public commits on the default branch, from commits.json (absent when the repo isn't in the baked data) */
  commits?: number;
  /** First and last commit dates (YYYY-MM-DD), from commits.json */
  commitSpan?: [string, string];
  /** Merged PRs, from prs.json (0 when the repo has no PRs) */
  mergedPRs?: number;
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

// Order per WAVE4 C1: AI-assisted (unfiltered … polybot), then hand-written (sentiment-gauge … yoyo-network).

export const projects: Project[] = [
  {
    id: 'unfiltered',
    name: 'Unfiltered',
    status: 'active',
    era: 'ai',
    period: 'Jul 2026 – present',
    voiceLine: 'Search engine for online stores that understands people.',
    oneLiner: 'A search engine for online stores that understands what people mean. Platform-independent, first distributed as a Shopify app.',
    cardFacts: [
      'A complete AI product, from the search engine to the app store owners install.',
      'Shows each store exactly how many sales the search brought in.',
      'My biggest build: 600+ commits in three months, built with my own AI agent team.',
    ],
    facts: [
      'Turns a request in any language into ranked products; a follow-up like "same but cheaper" changes the search.',
      'A complete product: the search engine, plus the app store owners install. It shows each store how many sales the search brought in.',
      'Schema-validated LLM intent extraction, hybrid vector and keyword retrieval, SQL constraints, model fallbacks, cost metering.',
      'Bilingual evaluation suite with 98 regression cases.',
      'Engine v2 (Oct 2026) rebuilt around a decision model, the "judge".',
      '600+ commits in three months; 245 PRs merged, mostly through yoyo-loop. Still in active development.',
    ],
    stack: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Gemini AI', 'Docker'],
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
    era: 'ai',
    period: 'Aug 2026',
    voiceLine: '3D kart racing game that teaches kids how to talk to AI.',
    oneLiner:
      'A 3D kart racing game that teaches Israeli kids aged 8–15 how to talk to AI. Built for the Base44 "Hour of Vibe Code" 2026 contest.',
    cardFacts: [
      'Built for an AI-education contest for Israeli schools.',
      'A full game: seven AI rivals, upgrades and races that get harder.',
      'Runs entirely in the browser, even offline.',
    ],
    facts: [
      'One HTML file, zero network calls, no asset files. Graphics are procedural; audio is synthesized. Runs offline.',
      'Hebrew-first with full RTL and an English toggle.',
      "Seven AI rivals share the player's physics. Drift boosts, item boxes, upgrades, races that get harder.",
      'Three quality tiers to hold 60 fps.',
      '17 test suites, plus a verify gate that intercepts every network request and fails on any.',
    ],
    stack: ['JavaScript', 'Three.js', 'Web Audio'],
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
    era: 'ai',
    period: 'Jul 2026 – present',
    voiceLine: 'My own AI software team.',
    oneLiner: 'My own AI software team: eight Claude Code skills over Linear, GitHub and Slack, and nothing goes live until I approve it.',
    cardFacts: [
      "I write what to build. AI agents code it, test it and review each other's work.",
      'Nothing goes live until I approve it.',
      'It built most of Unfiltered.',
    ],
    facts: [
      '/yoyo-spec interviews me and files a Linear issue with AC-N acceptance criteria and NG-N non-goals.',
      '/yoyo-build claims an agent-ready issue, implements it in an isolated git worktree and opens a PR.',
      '/yoyo-review posts a three-group verdict tied to the exact commit and CI results. I approve and merge.',
      'Command guards, bounded repair cycles, stall detection, Slack alerts, sensitive-path escalation.',
      '44 PRs merged across 18 issues in 4 days on Unfiltered (3 Oct – 7 Oct 2026). It built most of Unfiltered.',
      '55 PRs merged in its own repo. Started as an adaptation of Finn-loop; now mine.',
    ],
    stack: ['Claude Code', 'GitHub Actions', 'Linear', 'Slack'],
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
    era: 'ai',
    period: 'Oct 2026',
    voiceLine: 'Lets students talk to AI about their own university courses.',
    oneLiner:
      'Lets Reichman students ask Claude or ChatGPT about their own university courses in plain language. Free and public.',
    cardFacts: [
      "Ask Claude or ChatGPT what's due, how you did, or what a lecture covered.",
      'Free and public for every Reichman student.',
      'Built and published in under a week.',
    ],
    facts: [
      'Reads Moodle, syllabi, the Student Info Station, Panopto lecture transcripts and Piazza.',
      'Submits assignments or posts to forums only after explicit confirmation.',
      'Free and public; published on npm; installs by double-clicking a .mcpb, or with one npx command.',
      'Credentials stay in the OS secure storage. It never retries a wrong password, so it cannot lock an account.',
      "First built on Cloudflare Workers. The university's bot protection blocks cloud servers, so it ships as a local connector.",
      'Built and published in under a week (Oct 14 – 19, 2026).',
    ],
    stack: ['TypeScript', 'Node.js', 'MCP'],
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
    era: 'ai',
    period: 'Mar – Apr 2026',
    voiceLine: 'Bot that tells me the moment a sold-out hotel has a room.',
    oneLiner: 'A bot that messages me on Telegram the moment a room opens up at a sold-out hotel (Metzoke Dragot).',
    cardFacts: [
      'Checks around the clock on its own, then messages me on Telegram.',
      'Got me a last-minute room over Passover.',
      'Built in two days.',
    ],
    facts: [
      'Checks around the clock on its own; flexible date windows, stay length and guest count.',
      'Runs locally or on GitHub Actions, and messages me on Telegram.',
      'Got me a last-minute room over Passover.',
      'Built in two days.',
    ],
    stack: ['TypeScript', 'Node.js', 'GitHub Actions', 'Telegram'],
    links: [gh('availability-monitor')],
    glyph: 'tent',
    showcase: 'availability-monitor',
    commits: 7,
    commitSpan: ['2026-03-31', '2026-04-01'],
    mergedPRs: 0,
  },
  {
    id: 'polybot',
    name: 'Polybot',
    status: 'stopped',
    era: 'ai',
    period: 'Mar – Oct 2026',
    voiceLine: 'Bot that hunted for mispriced sports bets on Polymarket.',
    oneLiner: 'A bot that hunted for mispriced sports bets on Polymarket by comparing live prices against a top bookmaker.',
    cardFacts: [
      'Compared live prices across 11 sports leagues against a top bookmaker.',
      'Built-in safety: spending limits and an instant off switch.',
      'I shut it down when the data showed the edge was too small to win.',
    ],
    facts: [
      'Compared live Polymarket sports prices against Pinnacle-derived reference prices.',
      '11 leagues, including 3-way soccer markets.',
      'Immutable time-series snapshots; a request broker with allowlists, dry-run, spending limits and a kill switch.',
      'Stopped in Oct 2026: the data showed the edge was too small to win, and big firms have the speed.',
    ],
    stack: ['TypeScript', 'Next.js', 'PostgreSQL', 'Prisma'],
    links: [gh('polybot')],
    glyph: 'diverge',
    showcase: 'polybot',
    commits: 5,
    commitSpan: ['2026-03-10', '2026-03-12'],
    mergedPRs: 0,
  },
  {
    id: 'sentiment-gauge',
    name: 'Crypto Sentiment Gauge',
    status: 'shipped',
    era: 'hand',
    period: '2025',
    voiceLine: 'Dashboard that measures the mood around any crypto project.',
    oneLiner: 'A dashboard that measures the mood around any crypto project: AI reads posts on X and turns them into one score.',
    cardFacts: [
      'AI reads thousands of posts on X and turns them into one score.',
      'Runs nonstop in the background, with live trends and top supporters.',
      'Full accounts: sign-up, Google sign-in, email verification.',
    ],
    facts: [
      'AI (Gemini) reads thousands of posts on X about a crypto project and turns them into one sentiment score.',
      'Background workers (BullMQ on Redis) run nonstop; live trends and the top supporters of each project.',
      'Full accounts: sign-up, Google sign-in, email verification, profiles.',
      'Written by hand in 2025, with chat help at most.',
    ],
    stack: ['React', 'Node.js', 'MongoDB', 'Redis', 'Gemini AI'],
    links: [gh('sentiment-analysis')],
    glyph: 'chart',
    showcase: 'sentiment-gauge',
  },
  {
    id: 'pnl-bot',
    name: 'Discord PnL bot',
    status: 'shipped',
    era: 'hand',
    period: 'Sep 2023',
    voiceLine: 'Discord bot that shows crypto traders what they really made or lost.',
    oneLiner: 'A Discord bot that shows crypto traders what they really made or lost: profit and loss from wallet-level buys, sells, fees and holdings.',
    cardFacts: [
      'Profit and loss for coins and NFTs across Ethereum, Solana and Bitcoin.',
      "Turns a wallet's whole trading history into a shareable profit card.",
      'Built for a trading community of 100 to 200 members.',
    ],
    facts: [
      'Realized and unrealized profit and loss for coins and NFTs across Ethereum, Solana and Bitcoin.',
      "Turns a wallet's whole trading history into a shareable profit card.",
      'Written by hand in 2023, before AI coding tools.',
      'Built for a trading community of 100 to 200 members.',
    ],
    stack: ['JavaScript', 'Node.js', 'Discord.js', 'MongoDB', 'Moralis'],
    links: [gh('discord-PnL-bot-0xYoyo')],
    glyph: 'chart',
    showcase: 'pnl-bot',
    commits: 57,
    commitSpan: ['2023-09-04', '2024-01-29'],
    mergedPRs: 0,
  },
  {
    id: 'vortex',
    name: 'Vortex application system',
    status: 'shipped',
    era: 'hand',
    period: '2023–2025',
    voiceLine: 'Membership system for a private crypto community.',
    oneLiner: 'A membership system for a private crypto community: a website, a Discord bot and an admin dashboard working as one.',
    cardFacts: [
      'A website, a Discord bot and an admin dashboard working as one.',
      'Tracks every applicant from first click to final decision.',
      'Approved members get access automatically.',
    ],
    facts: [
      'Applicants sign in with X (Twitter).',
      'Community members vote on each application in Discord; an admin dashboard shows the votes and decides.',
      'Tracks every applicant from first click to final decision; approved members get access automatically.',
      'The Discord bot is from Sep 2023 – Jan 2024; the application site from Mar–Apr 2025. Written by hand.',
    ],
    stack: ['React', 'Node.js', 'MongoDB', 'Discord.js', 'X login'],
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
    era: 'hand',
    period: 'Jul – Aug 2023',
    voiceLine: 'Social network built from scratch.',
    oneLiner: 'A social network built from scratch, with its own server, database and login. Written by hand in 2023.',
    cardFacts: [
      'Profiles, posts, photos, likes, comments and follows.',
      'Its own server, database and secure login.',
      'Still live today.',
    ],
    facts: [
      'A RESTful, stateless API and a React front end that talks to it.',
      'Sign up, log in, or look around as a guest with a demo profile.',
      'Home feed of followed users, profiles, follow and unfollow, posts with pictures, likes and comments.',
      'Login with Passport, bcrypt and JWTs; image uploads through Multer and Cloudinary.',
      'Written by hand in 2023. Still live today.',
    ],
    stack: ['React', 'Node.js', 'Express', 'MongoDB'],
    links: [gh('yoyo-network-0xYoyo'), { kind: 'live', label: 'Live', href: 'https://yoyo-network.netlify.app/' }],
    glyph: 'keyboard',
    showcase: 'yoyo-network',
    commits: 58,
    commitSpan: ['2023-07-30', '2023-08-25'],
    mergedPRs: 0,
  },
];

/** One era of the Work overlay, in order (WAVE4 C1 / U8). */
export const projectsOf = (era: Project['era']): Project[] => projects.filter((p) => p.era === era);

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
