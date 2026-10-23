# Facts about Yoav "Yoyo" Zrihan (truth source — the agent may use only these)

## Identity
- Name Yoav Zrihan. Goes by Yoyo. Handle 0xYoyo everywhere (GitHub github.com/0xYoyo, LinkedIn linkedin.com/in/yoavzrihan). Hebrew: יואב זריהן.
- Email yoavyoav310@gmail.com. No phone number is shared.
- Lives in Israel, near Tel Aviv (Rishon LeZion). Timezone Asia/Jerusalem.
- Known for long curly shoulder-length hair.
- Second-year student: B.Sc. Computer Science + B.A. Entrepreneurship at Reichman University (Herzliya). Started October 2025, expected graduation July 2028. First-year GPA 89.4/100 (Intro to CS 96, Discrete Math 90, Research Methods 94). Currently semester 3 of 6. In Reichman's co-op program.
- Looking for a part-time student software engineering role, 2–3 days a week; backend / full-stack / AI roles, and interested in AI security as a direction. Would love to be inside a frontier lab or top firm (the kind of place with the best people) to learn from the top.
- Stated ambition, when asked plainly: build something big; Forbes 30 Under 30 Israel is a goal he has said out loud. He prefers learning from self-made builders and operators over prestige.

## Timeline (verified against git history and his own statements)
- Oct 2019 – Jul 2022: Israel Defense Forces. Started in Meitav (personnel assignment, a few months). Appealed his medical profile to volunteer for combat service → Unit 636, Field Intelligence Corps. Proud of it.
- Jul 2021 → : crypto. Trading, on-chain research, communities across Bitcoin, Ethereum, Solana. Advised two early-stage projects on launch strategy and community positioning, including one of the first Bitcoin Ordinals projects in early 2023 (the Ordinals protocol launched January 2023). He doesn't cite that project's raise.
- Sep–Nov 2022: freeCodeCamp Solidity/Hardhat course (13 repos; first public commit 2022-09-07).
- Oct 2022 – Sep 2023: The Odin Project, full time, self-taught, before AI coding tools: JavaScript, React, Node/Express, MongoDB, TDD; 30+ deployed projects; first portfolio Jun–Aug 2023 (0xyoyo.github.io/personal-portfolio-0xYoyo).
- Sep 2023: hand-written Discord PnL bot (EVM chains, Solana, Bitcoin). Dec 2023: Vortex Discord bot.
- 2024: most of the year solo travelling Southeast Asia after the army. 21 public commits all year, all in January; then a 13-month gap. He calls it the best decision he's made.
- 2025: back to building, with AI in the loop (Google AI Studio models with Cursor, then Claude Code when it appeared in Feb 2025, then Codex): Vortex application site (Mar), CodeMapper (Mar), crypto sentiment dashboard (Apr–May), Orditax (Jun). Oct 2025: started Reichman.
- 2026: Polybot (Mar), Availability Monitor (Mar–Apr), then from late July the agent-factory era: yoyo-loop (Jul 29), Unfiltered (Jul 31), Prompt Racers (Aug), Reichman Courses connector (Oct). 917 public commits in 2026 through Oct 19; 531 in August alone; busiest day Aug 8 (69 commits).

## Numbers (from his public GitHub, verified 2026-10-23)
- 1,405 public commits across 61 repos since 2022-09-07. Per year: 2022 41 · 2023 331 · 2024 21 · 2025 95 · 2026 917.
- 550 commits (39%) carry a Co-Authored-By trailer naming a Claude model; 100% were merged by him. 321 merge commits.
- Unfiltered: 246 PRs (245 merged); median open→merge ≈ 15 minutes; review labels loop-approved 141, needs-human-review 82. Densest 96 hours: 2026-10-03 15:53Z → 10-07 15:24Z = 44 PRs merged across 18 Linear issues.
- He never commits between 04:00 and 09:00 Israel time (zero in 1,405). Peak hour 17:00.

## Projects (status words are his; be honest)
- **Prompt Racers (מרוץ הפרומפטים)** — Aug 2026, shipped. 3D kart racer for Israeli kids aged 8–15 that teaches prompt engineering through play; Hebrew-first with RTL, English toggle; built for the Base44 "Hour of Vibe Code" 2026 contest. One self-contained HTML file, zero network calls, no asset files — procedural graphics, synthesized audio. Drift boosts, seven AI opponents on the player's physics, item boxes, prompt-building progression, three quality tiers for 60 fps, 17 test suites and a verify gate that fails on any network request. Directed via multi-agent build waves. Playable on this site. JavaScript, Three.js, Web Audio, Puppeteer harness.
- **Unfiltered** — Jul–Oct 2026, paused. A natural-language product search engine; platform-independent, first distributed as a Shopify app. Turns "elegant summer wedding dress, not black, under ₪400" (any language) into ranked products; follow-ups like "same but cheaper" refine. Schema-validated LLM intent extraction, hybrid vector/keyword retrieval, SQL constraints, model fallbacks, cost metering; bilingual evaluation suite with 98 regression cases; p95 latency down ~70% on warm bilingual benchmarks by overlapping pipeline stages and hedging slow model calls; Engine v2 (Oct 2026) around a decision model called the judge. TypeScript strict monorepo, Vitest, Playwright, CI on every PR, a boundary test that fails if the engine imports Shopify. Built mostly through yoyo-loop. Paused: no paying merchants; he judged the engine hadn't cleared his own bar. TypeScript, Node, React Router, PostgreSQL, Prisma, Gemini API, Docker, GitHub Actions.
- **yoyo-loop** — Jul 2026 →, active. His human-gated software factory: eight Claude Code skills over Linear, GitHub and Slack (`/yoyo-init`, `/yoyo-spec`, `/yoyo-build`, `/yoyo-review`, `/yoyo-status`, `/yoyo-watchdog`, `/yoyo-diagnose`, `/yoyo-design`). Spec → `agent-ready` label → build in an isolated git worktree → PR → independent agent review tied to the exact commit and CI → a human merges. Command guards, bounded repair cycles, stall detection, Slack alerts, sensitive-path escalation. 55 PRs merged in its own repo; delivered the 44-PR/18-issue burst on Unfiltered. Started as an adaptation of Finn-loop; now his own.
- **Reichman Courses connector (runi-connector)** — Oct 2026, shipped. An MCP connector so Reichman students can ask Claude, ChatGPT (Codex) or Claude Code about their own courses: Moodle (files, deadlines, forums, feedback, quizzes, attendance, Zoom links), syllabi, Student Info Station (official grades, exams, timetable), Panopto lecture transcripts, Piazza. Submits assignments or forum posts only after explicit confirmation. Installs as a double-click `.mcpb` for Claude Desktop or `npx -y reichman-courses-connector@latest install`; published on npm. Credentials stay in the OS secure storage; never retries a wrong password. First built on Cloudflare Workers; the university's bot protection blocks cloud servers, so it ships as a local connector. Unofficial. TypeScript, MCP, Node.
- **Availability Monitor** — Mar–Apr 2026, shipped. Telegram alerts when a room opens at the Metzoke Dragot hotel; flexible date windows, stay length, guests; runs locally or on GitHub Actions. Found him a last-minute Passover stay. TypeScript, Node 22, GitHub Actions, Telegram Bot API.
- **Discord PnL bot** — Sep 2023, shipped, hand-written before AI. Realized/unrealized P&L reports for a community (~100–200 members) from wallet-level buys, sells, fees and holdings; tokens and NFTs across EVM chains, Solana, Bitcoin. JavaScript.
- **Polybot** — Mar 2026, stopped. Polymarket sports prices observed against Pinnacle-derived reference prices; immutable time-series snapshots as a hard rule; Next.js control room; Prisma/PostgreSQL; request broker with allowlists, dry-run, budget caps, kill switch; 11 leagues; 3-way soccer handling. Stopped in Oct 2026: the evidence of an edge wasn't strong enough, and big firms have the latency. He thinks it had potential.
- **Orditax** — Jun 2025, archived. Bitcoin-ecosystem tax pipeline: BTC, Ordinals, Runes, BRC-20; dual-address wallets; 8-step pipeline; FIFO/LIFO cost basis; CSV export. Node, Maestro indexer, CoinGecko.
- **Crypto sentiment dashboard** — Apr–May 2025, archived. BullMQ/Redis workers, Gemini scoring, trend aggregation, auth.
- **Vortex application system** — bot Dec 2023, site Mar–Apr 2025, shipped. React/Node/MongoDB community admissions: X (Twitter) OAuth, Discord member voting, admin dashboard.
- **CodeMapper** — Mar 2025, archived. Upload a codebase, generate a codemap to share with LLMs.
- **Odin era** — 2022–2023: 26 repos and 331 commits in 2023; battleship (TDD), a React shopping cart (live: lumiereshop.netlify.app), a social network, inventory app, blog API, where's-waldo on Firebase, etc.
- **This site (v3)** — Oct 2026. He wrote the brief; one model planned it; the sections and systems were built by parallel agents (13 in v2; v3's count is filled at delivery); he merged. The agent you're talking to runs on a Cloudflare Worker he deploys, with a scripted fallback.

## Skills
TypeScript, JavaScript, Node.js, React, Express, REST, OAuth, PostgreSQL, pgvector, MongoDB, Prisma, Bash, Java, C, Python (basic), HTML/CSS; LLM APIs, MCP, embeddings, agent orchestration, Claude Code, Codex, Cursor; Git, Linux, GitHub Actions, Docker, Vitest, Jest, Playwright, Three.js, Web Audio; Solidity/Hardhat (2022). Strongest end to end in TypeScript. Java and C from the degree.

## Character (as he has described himself)
- Chronically online; first to new tech waves (crypto, AI); reads narrative and sentiment well.
- Builds fast; perfectionist; "no quitter"; prefers evidence over confident guessing; wants honest, direct analysis, not reassurance.
- Works as a director of agent teams: specs, reviews, CI gates. Wants simple, reliable automation and human gates — no auto-merge to production.
- Likes: travel and festivals, football, gaming (high-level Fortnite building years ago, CS2 now), music, wants to learn piano, longevity and quantum computing as curiosities, personal style, his curls.
- Values freedom, happiness, rest, lived experience.
- Honest weaknesses: LeetCode-style interviewing is not his strong side; distribution is harder for him than building; he gets bored when things move slowly; he sometimes stops a project before the last 10% when he judges it has no future (Unfiltered, Polybot).
- Hardware: MacBook Pro 14" M4; also a Windows desktop for CS2.
