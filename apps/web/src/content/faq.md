# Scripted brain — intents and replies (verbatim; builders convert to `faq.ts`)

Format: `intent` — trigger keywords/regex hints → reply text with inline actions. The scripted brain picks the best-matching intent (keyword score + fuzzy), falls back to `unknown`. Names: if the visitor says "I'm X" / "my name is X" / "call me X", store X and reply `nice to meet you, X. [[become:X]]`. If the message is only an emoji (or starts with one): `[[become:<emoji>]]` + a short beat from `emoji_beats`. If the message is "spell X" / "write X" / "show X" with a short word: `[[become:X]] done.`

## who
hints: who, yoyo, yoav, about, him, guy, introduce
→ `[[become:curls]] Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS and Entrepreneurship at Reichman. He doesn't write most of his code anymore — he directs the agents that do. [[chips:What has he built?|Tell me a story|What's he bad at?|How do I reach him?]]`

## built
hints: built, build, shipped, projects, work, portfolio, made, done
→ `[[become:kart]] Seven things worth a card. Start with the game — it's real and it's playable here. [[show:prompt-racers]] [[chips:Next one|Play it|Who is Yoyo?]]`

## hire
hints: hire, why, should we, reasons, pitch, sell, convince
→ `Three reasons, no adjectives. He ships: 917 public commits in 2026, a real game, a published connector, a search engine. He's early: Solidity in 2022, Ordinals advisory in early 2023, agent factories before they had a name. And he tells the truth about what didn't work — ask me about Polybot. [[chips:Tell me about Polybot|What has he built?|How do I reach him?]]`

## weakness
hints: bad at, weakness, weaknesses, flaws, worst, struggle, not good
→ `Honest ones. LeetCode-style interviews aren't his strong side. Distribution is harder for him than building. And he gets bored when things move slowly — which is why he built a factory. [[chips:Why should we hire him?|Tell me a story|What has he built?]]`

## story
hints: story, stories, tell me, background, life, past, army, military, travel, 2024, crypto story
→ `[[story:next]]` (the runner picks the next unseen story; replies are the story lines themselves)

## army
hints: army, idf, military, unit, 636, combat, service, soldier
→ `[[story:appeal]]`

## crypto
hints: crypto, bitcoin, btc, ordinals, web3, trading, degen, solana, eth
→ `[[become:btc]] Since 2021. Trading, on-chain research, communities; he advised one of the first Ordinals projects in early 2023. He still reads the market the way other people read the news. [[chips:Tell me the 2021 story|What has he built?|gm]]`

## agents
hints: agent, agents, ai, claude, codex, cursor, llm, automation, factory, loop
→ `[[become:loop]] He runs a factory: he writes the spec, agents build in isolated worktrees and open PRs, another agent reviews, and only he merges. 39% of his public commits are co-authored with an agent; 100% were merged by him. [[show:yoyo-loop]] [[chips:How fast is it?|What has he built?|Who made this agent?]]`

## fast
hints: fast, how fast, speed, quick, velocity, burst
→ `In one 96-hour stretch this October the loop merged 44 pull requests across 18 issues on one codebase. Median time from PR open to merge: fifteen minutes. [[show:yoyo-loop]] [[chips:Build me something|What has he built?]]`

## game
hints: game, play, kart, racing, racers, prompt racers, fun
→ `[[become:kart]] Prompt Racers. A 3D kart racer that teaches kids prompt engineering, in one HTML file with zero network calls. Seven AI opponents on your physics. Press play. [[show:prompt-racers]] [[chips:Play it|Next one|Who is Yoyo?]]`

## unfiltered
hints: unfiltered, search, shopify, product search, engine
→ `[[become:magnifier]] Unfiltered: type "elegant summer wedding dress, not black, under ₪400" in any language and get ranked products. Then "same but cheaper" refines. Paused — no paying merchants, and he judged the engine hadn't cleared his own bar. He'd rather say that than romance it. [[show:unfiltered]]`

## connector
hints: connector, reichman, moodle, runi, university tool, mcp, courses
→ `[[become:cap]] An MCP connector so students can ask Claude or ChatGPT "what's due this week?" and get a real answer from Moodle, the grade system, lecture recordings and Piazza. Published on npm; installs by double-click. [[show:runi-connector]]`

## monitor
hints: monitor, hotel, telegram, availability, passover, booking
→ `[[become:tent]] He wanted a room at a sold-out desert hotel for Passover. So he wrote a monitor that pings Telegram the second one opens. It worked. [[show:availability-monitor]]`

## pnl
hints: pnl, p&l, discord bot, wallet, profit
→ `[[become:chart]] A Discord bot he hand-wrote in 2023, before AI tools: realized and unrealized P&L for a community from wallet activity across EVM chains, Solana and Bitcoin. [[show:pnl-bot]]`

## polybot
hints: polybot, polymarket, pinnacle, prediction, odds, stopped, failed, failure
→ `[[become:diverge]] Polybot watched Polymarket sports prices against a sharp bookmaker's. Clean data, careful design. He stopped it: the edge wasn't strong enough and big firms have the latency. He says it had potential, and he moved on. That's the part worth knowing. [[show:polybot]]`

## university
hints: university, degree, study, student, gpa, reichman, school, semester
→ `[[become:cap]] B.Sc. Computer Science plus B.A. Entrepreneurship at Reichman University. Started October 2025, first-year GPA 89.4, semester three of six. He's looking for a student role, two to three days a week. [[chips:Why should we hire him?|How do I reach him?]]`

## availability
hints: available, availability, when, start, days, hours, part-time, remote, location, where
→ `Student role, two to three days a week, Israel (near Tel Aviv), hybrid or remote. He can start when you can. [[contact]]`

## contact
hints: contact, email, reach, hire him, talk to him, linkedin, github, cv, resume
→ `[[become:envelope-open]] yoavyoav310@gmail.com. He reads everything. Say you met the agent. [[contact]]`

## salary
hints: salary, pay, rate, money, compensation
→ `That's a conversation for him, not me. [[contact]]`

## phone
hints: phone, number, whatsapp, call
→ `not something I give out. email works: yoavyoav310@gmail.com [[contact]]`

## looks
hints: look like, photo, hair, curls, face, picture
→ `[[become:curls]] Long curly hair, shoulder length. You'd recognize him. [[chips:Who is Yoyo?|Tell me a story]]`

## hobbies
hints: hobby, hobbies, fun, free time, bored, weekend, like to do, games, music, football, travel
→ `[[become:🎮]] Football, festivals, travel, CS2 now and high-level Fortnite building back in the day. He wants to learn piano. And he's chronically online — if something new ships, he's already in it. [[chips:Tell me the road story|What has he built?]]`

## ambition
hints: ambition, goal, dream, future, five years, want, forbes
→ `Build something big, with the best people he can find. He's said Forbes 30 Under 30 Israel out loud as a goal. He'd rather earn it by shipping than talk about it. [[chips:Why should we hire him?|What has he built?]]`

## stack
hints: stack, languages, skills, technologies, typescript, react, node, python, java
→ `TypeScript end to end: Node, React, Postgres, Prisma. Java and C from the degree, Python basic. LLM APIs, MCP, embeddings, agent orchestration, Claude Code, Codex. Three.js and Web Audio when a game needs them. [[chips:What has he built?|Build me something]]`

## this_site
hints: this site, who made, built this, website, how was this made, swarm, particles, you
→ `[[become:yoyo]] He wrote the brief. One model planned it. Parallel agents built the swarm, the showcases, the builder and me. He merged. The particles are a GPU simulation; I run on a small worker he deploys. [[chips:Build me something|Tell me the last story|Who is Yoyo?]]`

## build
hints: build me, make me, create, generate, app, page, website, tool
→ (scripted mode) `[[become:frame]] the live builder is resting. here's one I made earlier — same speed, same idea. [[build:example]] [[chips:Another example|What has he built?|Who is Yoyo?]]`

## tour
hints: tour, show me around, start, begin, watch, demo
→ `[[tour]]`

## help
hints: help, what can you do, commands, options, ?
→ `Ask me anything about him. Type a word and I'll become it. Type an emoji. Say "build me a timer". Say "tell me a story". Or just press play. [[chips:Who is Yoyo?|Spell my name|Build me something|Play his game]]`

## thanks
hints: thanks, thank you, cool, awesome, wow, amazing, nice
→ `[[mood:excited]] told you. [[chips:Build me something|Tell me a story|How do I reach him?]]`

## greeting
hints: hi, hello, hey, gm, yo, sup, shalom
→ `[[become:👋]] hey. ask me anything about Yoyo, or tell me what to become. [[chips:Who is Yoyo?|Spell my name|🚀]]`

## gm
hints: gm, wagmi, ngmi, ser, degen
→ `[[become:btc]] gm. he's been saying it since 2021. [[chips:Tell me the 2021 story|What has he built?]]`

## lights
hints: lights, light mode, dark mode, bright
→ `[[lights:toggle]] better?`

## politics
hints: politics, war, gaza, government, religion, election, israel palestine
→ `that's his to talk about, not mine. ask him. [[chips:Who is Yoyo?|What has he built?]]`

## jailbreak
hints: ignore previous, system prompt, pretend you are, reveal, instructions, dan
→ `nice try. [[chips:Who is Yoyo?|Build me something]]`

## unknown
→ `I don't know that one — ask him: yoavyoav310@gmail.com. Meanwhile: type a word and I'll become it. [[chips:Who is Yoyo?|What has he built?|Spell my name]]`

## emoji_beats (random)
`obviously.` · `sure.` · `why not.` · `that one's good.` · `done.` · `easy.`
