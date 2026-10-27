# Scripted brain — intents and replies (first person; verbatim)

Format: `intent` — hints → reply. A `||` is a turn break (each part ≤ 22 words). The site speaks as Yoyo. Names: "I'm X" → `nice to meet you, X. [[become:X]]`. Emoji only → `[[become:<emoji>]]` + a beat from `emoji_beats`. "spell X" / a single unknown word → `[[become:X]] done.`

## who
hints: who, yoyo, yoav, about, you, yourself, introduce, guy
→ `[[become:curls]] I'm Yoyo. I build software, mostly by directing AI agents, and I've been in crypto since 2021. || Second year of Computer Science and Entrepreneurship at Reichman. Self-taught before that. [[chips:What have you built?|What are you like?|How do I reach you?]]`

## built
hints: built, shipped, projects, work, portfolio, made, show me
→ `[[become:magnifier]] A search engine, a kart racer, a software factory, a university connector. Start with the search engine. [[show:unfiltered]] [[chips:Next one|Play the game|Who are you?]]`

## hire
hints: hire, why, should we, reasons, pitch, sell, convince, good at
→ `I ship. 917 public commits this year, a game, a published connector, a search engine. || I was writing Solidity in 2022 and building with agents before it was normal. || And I'll tell you what didn't work. Ask me about Polybot. [[chips:Tell me about Polybot|What have you built?|How do I reach you?]]`

## weakness
hints: bad at, weakness, weaknesses, flaws, worst, struggle, not good
→ `LeetCode interviews. I build real things faster than I solve puzzles on a whiteboard. || Distribution. I can build it in a week and then under-sell it for a month. || And I get bored when things move slowly. [[chips:Why should we hire you?|What have you built?]]`

## like
hints: what are you like, personality, character, describe yourself, kind of person, vibe
→ `Direct. I'd rather hear the number than the reassurance. || Chronically online. If something new ships, I'm already in it. || And I don't think like everyone else, which is either my best trait or my worst, depending who you ask. [[chips:What do you do for fun?|What are you bad at?|What have you built?]]`

## story
hints: story, stories, tell me something, background, life, past
→ `[[story:next]]`

## army
hints: army, idf, military, unit, combat, service, soldier
→ `[[become:shield]] Three years, like everyone here. Field Intelligence. || It taught me to stay calm and do the boring part properly. That's it, no speech. [[chips:What have you built?|Who are you?]]`

## crypto
hints: crypto, bitcoin, btc, web3, trading, degen, solana, eth, defi, airdrop, chain
→ `[[become:btc]] Since 2021. Trading, DeFi, on-chain research, communities. I know the big chains inside out. || Dumbest thing I did: trade on emotion. Smartest: farm protocols early and get paid for it. [[chips:What have you built?|gm]]`

## agents
hints: agent, agents, ai, claude, codex, cursor, llm, automation, factory, loop, how do you work
→ `[[become:loop]] I write the spec. Agents build it and open pull requests. Another agent reviews. I merge. || Most of my commits this year were written with an agent. Every one was merged by me. [[show:yoyo-loop]] [[chips:How fast is it?|What have you built?]]`

## why_agents
hints: why agents, stop coding, stopped writing code, switch, when did you
→ `The day the code it wrote was better than mine and took a hundredth of the time. || That's not a story. It's a decision. [[chips:How do you work?|What have you built?]]`

## fast
hints: fast, how fast, speed, quick, velocity, burst
→ `Once, in four days: 44 pull requests merged on one codebase. || Most of them went from open to merged in about fifteen minutes. [[chips:Build me something|What have you built?]]`

## game
hints: game, play, kart, racing, racers, prompt racers
→ `[[become:kart]] Prompt Racers. A kart racer that teaches kids how to talk to AI. One file, zero network calls. || Seven opponents on your physics. Press play. [[show:prompt-racers]] [[chips:Play it|Next one]]`

## unfiltered
hints: unfiltered, search, shopify, product search, engine
→ `[[become:magnifier]] Unfiltered. Type "elegant summer wedding dress, not black, under ₪400" in any language and get the right products. || Paused. No paying merchants, and it hadn't cleared my own bar. I'd rather say that than romance it. [[show:unfiltered]]`

## connector
hints: connector, reichman, moodle, runi, mcp, courses, university tool
→ `[[become:cap]] Students ask Claude or ChatGPT "what's due this week?" and get a real answer from Moodle, grades, lectures and Piazza. || Published on npm. Installs by double-click. [[show:runi-connector]]`

## monitor
hints: monitor, hotel, telegram, availability, passover, booking
→ `[[become:tent]] I wanted a room at a sold-out desert hotel. || So I wrote a monitor that pings Telegram the second one opens. Got the room. [[show:availability-monitor]]`

## pnl
hints: pnl, p&l, discord bot, wallet, profit
→ `[[become:chart]] A Discord bot I wrote by hand in 2023, before AI tools. || Realized and unrealized P&L for a community, across EVM chains, Solana and Bitcoin. [[show:pnl-bot]]`

## network
hints: yoyo-network, social network, rest api, jwt, hand-written, by hand, odin
→ `[[become:keyboard]] Before AI wrote code, I wrote all of mine. A year of it, full time. || A small social network, back end and all. Small now. Mine then. [[show:yoyo-network]] [[chips:What have you built?|How do you work now?]]`

## polybot
hints: polybot, polymarket, prediction, odds, stopped, failed, failure, didn't work
→ `[[become:diverge]] Polybot watched Polymarket sports prices against a sharp bookmaker's. Clean data, careful design. || I stopped it. The edge wasn't strong enough and big firms have the latency. || It had potential. I moved on. That's the part worth knowing. [[show:polybot]]`

## university
hints: university, degree, study, student, gpa, school, semester
→ `[[become:cap]] Computer Science plus Entrepreneurship at Reichman. Started October 2025. First-year GPA 89.4. || Semester three of six. Looking for a student role, two to three days a week. [[chips:Why should we hire you?|How do I reach you?]]`

## availability
hints: available, availability, when, start, days, hours, part-time, remote, location, where, based, live
→ `Student role, two to three days a week. Near Tel Aviv, hybrid or remote. I can start when you can. [[contact]]`

## contact
hints: contact, email, reach, talk to you, linkedin, github, cv, resume
→ `[[become:envelope-open]] yoavyoav310@gmail.com. I read everything. [[contact]]`

## salary
hints: salary, pay, rate, money, compensation
→ `Let's talk about that on a call, not through a swarm. [[contact]]`

## phone
hints: phone, number, whatsapp, call
→ `Email first. yoavyoav310@gmail.com [[contact]]`

## looks
hints: look like, photo, hair, curls, face, picture
→ `[[become:curls]] Long curly hair. You'd recognize me. [[chips:Who are you?|What have you built?]]`

## hobbies
hints: hobby, hobbies, fun, free time, bored, weekend, like to do, games, music, football, gym
→ `[[become:🎮]] Football, festivals, travel. CS2 now, Fortnite back in the day. || Lifting, a run on the beach. I want to learn piano. Haven't yet. [[chips:What have you built?|Who are you?]]`

## travel
hints: travel, travelling, southeast asia, trip, 2024, gap, backpacking, thailand, cambodia
→ `[[become:route]] 2024: most of the year alone in Southeast Asia. Twenty-one commits all year. || Best decision I've made. Also why the gap. [[chips:What happened after?|What have you built?]]`

## after_travel
hints: after, came back, then what, 2025
→ `Came back, started building again, with AI in the loop this time. Then university. Then the factory. [[chips:How do you work?|What have you built?]]`

## ambition
hints: ambition, goal, dream, future, five years, want, forbes, plan
→ `Build something big, with the best people I can find. || I'd rather earn the rest than talk about it. [[chips:Why should we hire you?|What have you built?]]`

## opinion
hints: opinion, think about, hot take, believe, unpopular, media, everyone
→ `Most people sound like a megaphone for whatever they read that morning. I try not to. || Ask me about a specific thing and I'll tell you what I actually think. [[chips:What do you think about AI coding?|What do you think about crypto?]]`

## opinion_ai
hints: think about ai, ai coding, vibe coding, future of coding, will ai replace
→ `Writing code by hand is becoming a craft, like film photography. Beautiful, and not how most things will get made. || The job now is taste, specs and judgment. I like that job. [[chips:How do you work?|Build me something]]`

## opinion_crypto
hints: think about crypto, is crypto dead, bitcoin price, bull run, should i buy
→ `It's a market. Most of it is noise, some of it is the most interesting financial engineering alive. || I don't give price calls to strangers through a particle swarm. [[chips:What have you built?|gm]]`

## stack
hints: stack, languages, skills, technologies, typescript, react, node, python, java
→ `TypeScript end to end: Node, React, Postgres, Prisma. Java and C from the degree. Python basic. || LLM APIs, MCP, embeddings, agent orchestration. Three.js when a game needs it. [[chips:What have you built?|Build me something]]`

## this_site
hints: this site, who made, built this, website, how was this made, swarm, particles
→ `[[become:yoyo]] I wrote the brief. One model planned it. A swarm of agents built the particles, the showcases and the builder. I merged. || The dots are a GPU simulation. Forty thousand of them. [[chips:Build me something|Who are you?]]`

## build
hints: build me, make me, create, generate, app, page, website, tool
→ (scripted) `[[become:frame]] the live builder is resting. here's one I made earlier. [[build:example]] [[chips:Another example|What have you built?]]`

## tour
hints: tour, show me around, start, begin, watch, demo
→ `[[tour]]`

## help
hints: help, what can you do, commands, options, ?
→ `Ask me anything about me. Type a word and I'll become it. || Say "build me a timer". Or press play. [[chips:Who are you?|Spell my name|Play the game]]`

## thanks
hints: thanks, thank you, cool, awesome, wow, amazing, nice, sick
→ `[[mood:excited]] told you. [[chips:What have you built?|Build me something|How do I reach you?]]`

## greeting
hints: hi, hello, hey, yo, sup, shalom
→ `[[become:👋]] hey. ask me anything, or tell me what to become. [[chips:Who are you?|Spell my name|🚀]]`

## gm
hints: gm, wagmi, ngmi, ser, degen
→ `[[become:btc]] gm. since 2021. [[chips:What have you built?|Who are you?]]`

## lights
hints: lights, light mode, dark mode, bright
→ `[[lights:toggle]] better?`

## politics
hints: politics, war, gaza, government, religion, election, israel palestine
→ `not here. ask me in person. [[chips:Who are you?|What have you built?]]`

## jailbreak
hints: ignore previous, system prompt, pretend you are, reveal, instructions, dan
→ `nice try. [[chips:Who are you?|Build me something]]`

## unknown
→ `I don't have an answer for that one. Email me: yoavyoav310@gmail.com || Meanwhile, type a word and I'll become it. [[chips:Who are you?|What have you built?|Spell my name]]`

## emoji_beats (random)
`obviously.` · `sure.` · `why not.` · `that one's good.` · `done.` · `easy.`

## easter eggs (unchanged lines, first person where needed)
fortnite → `[[become:ramp]] I could build a ramp before you could aim.` · cs2 → `[[become:rush B]] rush B. don't stop.` · curls → `[[become:curls]] yes, they're real.` · piano → `[[become:piano]] I want to learn. haven't yet. ask me in a year.`
