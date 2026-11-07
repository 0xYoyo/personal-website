# Scripted brain: intents and replies (first person; verbatim)

Format: `intent`, hints → reply. A `||` is a turn break (each part ≤ 22 words). The site speaks as Yoyo. Names: "I'm X" → `nice to meet you, X. [[become:X]]`. Emoji only → `[[become:<emoji>]]` + a beat from `emoji_beats`. "spell X" / a single unknown word → `[[become:X]] done.`

## who
hints: who, yoyo, yoav, about, you, yourself, introduce, guy
→ `[[become:curls]] I'm Yoyo, a software engineer who builds products with AI agents. || [[become:cap]] Computer Science and Entrepreneurship at Reichman. Self-taught developer before that. [[chips:What are you like?|What have you built?|How do I reach you?]]`

## built
hints: built, shipped, projects, work, portfolio, made, show me
→ `[[become:magnifier]] Start with my favorite: a search engine for online stores. [[show:unfiltered]]`

## hire
hints: hire, why, should we, reasons, pitch, sell, convince, good at
→ `[[become:check]] I ship real products: a search engine, a 3D game, a tool my whole university can use. || [[become:loop]] I like being early. I was building with AI agents when most people called it a toy. || [[become:keyboard]] Self-taught, full-stack. I built complete applications by hand before I started working with agents. || [[become:diverge]] And I'll tell you what didn't work. Ask me about Polybot. [[chips:Show my hand-written work|Tell me about Polybot|How do I reach you?]]`

## weakness
hints: bad at, weakness, weaknesses, flaws, worst, struggle, not good
→ `LeetCode interviews. I build real things faster than I solve puzzles on a whiteboard. || Distribution. I can build it in a week and then under-sell it for a month. || And I get bored when things move slowly. [[chips:Why should we hire you?|And crypto?|What have you built?]]`

## like
hints: what are you like, personality, character, describe yourself, kind of person, vibe
→ `Direct. I'd rather hear the number than the reassurance. || Chronically online. If something new ships, I'm already in it. || And I don't think like everyone else, which is either my best trait or my worst, depending who you ask. [[chips:What do you do for fun?|And crypto?|What are you bad at?]]`

## story
hints: story, stories, tell me something, background, life, past
→ `[[story:next]]`

## army
hints: army, idf, military, unit, combat, service, soldier
→ `[[become:shield]] Three years, like everyone here. Field Intelligence. || It taught me to stay calm and do the boring part properly. That's it, no speech. [[chips:What have you built?|Who are you?]]`

## crypto
hints: crypto, bitcoin, btc, web3, trading, degen, solana, eth, defi, airdrop, chain, and crypto, cs skins, csgo, trader
→ `[[become:$10,000]] I've always been a trader. At 13 I built a $10,000 inventory from nothing, trading CS:GO skins. || [[become:btc]] In blockchain since 2021: trading, on-chain research, advising early projects. I go where the new things are. || [[become:chart]] I build for it too: a profit tracker, a sentiment dashboard, a members system for a private community. [[chips:Show me those|Why should we hire you?|What have you built?]]`

## agents
hints: agent, agents, ai, claude, codex, cursor, llm, automation, factory, loop, how do you work
→ `[[become:loop]] I describe what to build. AI agents write it, another one checks it, and I approve what ships. || Most of my code this year was written that way. [[show:yoyo-loop]] [[chips:How fast is it?|What have you built?]]`

## why_agents
hints: why agents, stop coding, stopped writing code, switch, when did you
→ `When the code it wrote got better than mine, in a fraction of the time. || So I stopped typing and started directing. [[chips:How do you work?|What have you built?]]`

## fast
hints: fast, how fast, speed, quick, velocity, burst
→ `Fast. In four days this October, one product got 44 finished updates. || Each took about fifteen minutes from ready to approved. [[chips:Watch me build|What have you built?]]`

## game
hints: game, play, kart, racing, racers, prompt racers
→ `[[become:kart]] Prompt Racers. A 3D kart racer that teaches kids how to talk to AI. || Seven AI rivals, upgrades, races that get harder, all in one HTML file that runs offline. Press play. [[show:prompt-racers]] [[chips:Play it|Next one]]`

## unfiltered
hints: unfiltered, search, shopify, product search, engine
→ `[[become:magnifier]] Unfiltered. A search engine for online stores that understands people. || Type "elegant summer wedding dress, not black, under ₪400" and it finds the right products. [[show:unfiltered]]`

## connector
hints: connector, reichman, moodle, runi, mcp, courses, university tool
→ `[[become:cap]] It lets students talk to AI about their own university courses. || Ask Claude or ChatGPT what's due, how you did, or what a lecture covered. Free for every Reichman student. [[show:runi-connector]]`

## monitor
hints: monitor, hotel, telegram, availability, passover, booking
→ `[[become:tent]] A bot that tells me the moment a sold-out hotel has a room. || It checks around the clock and messages me on Telegram. Got me a room over Passover. [[show:availability-monitor]]`

## pnl
hints: pnl, p&l, discord bot, wallet, profit
→ `[[become:chart]] A Discord bot that shows crypto traders what they really made or lost. || Coins and NFTs across Ethereum, Solana and Bitcoin, turned into a profit card in seconds. [[show:pnl-bot]]`

## sentiment
hints: sentiment, sentiment gauge, gauge, mood of crypto, sentiment dashboard
→ `[[become:chart]] A dashboard that measures the mood around any crypto project. || AI reads thousands of posts on X and turns them into one score. Written by hand in 2025. [[show:sentiment-gauge]]`

## hand_work
hints: show me those, hand-written projects, hand-written work, older projects
→ `[[work:hand]]` (opens Work on the Hand-written tab, at its first card)

## network
hints: yoyo-network, social network, rest api, jwt, odin
→ `[[become:keyboard]] A social network I built from scratch in 2023, before I used coding agents. || Profiles, posts, photos, likes and follows, with its own server and login. [[show:yoyo-network]] [[chips:What have you built?|How do you work now?]]`

## polybot
hints: polybot, polymarket, prediction, odds, stopped, failed, failure, didn't work
→ `[[become:diverge]] Polybot hunted for mispriced sports bets on Polymarket, against a top bookmaker. || I shut it down when the data showed the edge was too small to win. [[show:polybot]]`

## without_ai
hints: code without ai, without ai, by hand, code yourself, can you actually code, real coding, hand-written
→ `Yes. I was building full-stack apps and Discord bots before I started using coding agents. || You can see those under Hand-written. [[work:hand]]`

## unfiltered_hard
hints: hardest part, hardest, challenge, difficult, what was hard
→ `The first engine squeezed every request into a fixed form: a few categories, a few occasions. Anything outside it got lost. || So I changed the approach: understand the products first, then compare what the shopper asks for against them. The new engine beat the old one on our English and Hebrew test sets.` (Unfiltered only: with an Unfiltered card open, or "unfiltered" in the message)

## racers_teach
hints: teach, teaches prompting, learn, how does it teach, prompt racers teach, educational, garage
→ `In the garage, kids write prompts to build kart parts. A vague prompt gets a scrappy part, a specific one a pro part. || Then they race with what they built, so better prompting changes how their kart performs.`

## loop_wrong
hints: gets it wrong, mistake, fails, agent wrong, bug, what if an agent
→ `Another agent reviews every change against the spec and the tests. If it fails, the builder fixes it and tries again. || If it's still stuck, it stops and pings me on Slack. Nothing merges without me.`

## connector_access
hints: what can it access, can it access, connector access, what can it see, what does it read, permissions
→ `Your course files, lecture recordings and transcripts, deadlines, grades, announcements and Piazza. || It reads for you, and it never submits or posts anything without asking first.`

## my_part
hints: what did you do, your part, your role, what did you build on this, did you build this, contribution
→ `On the newer projects I define the product and direct my agents. On the hand-written ones I built the frontend and backend myself. || Open one and ask me again.` (no project open; with a card open the site answers `my_part_<project id>`)

## my_part_unfiltered
hints: what did you do on unfiltered, your part in unfiltered, your role in unfiltered
→ `I defined the product, designed how the search should behave, and directed its development through my agent workflow. || I also tested the results and decided when the approach needed to change.`

## my_part_prompt-racers
hints: what did you do on prompt racers, your part in prompt racers, your role in prompt racers
→ `I designed the game and the prompt-building garage, and directed the agents that built it. || Then I playtested it and tuned the races and difficulty until it felt right.`

## my_part_yoyo-loop
hints: what did you do on yoyo-loop, your part in yoyo-loop, your role in yoyo-loop
→ `I designed it: the steps from spec to merge, the review rules, and when it should stop and ask me. || It runs as eight Claude Code skills on Linear, GitHub and Slack.`

## my_part_runi-connector
hints: what did you do on the connector, your part in the connector, your role in the connector
→ `I designed what it reads and how students sign in, directed the build, and tested it on my own courses. || Then I packaged it so it installs with a double-click.`

## my_part_availability-monitor
hints: what did you do on the hotel monitor, your part in the hotel monitor, your role in the hotel monitor
→ `I worked out how the hotel's booking pages report free rooms, built the checker and the Telegram alerts, || and set it to run every ten minutes.`

## my_part_polybot
hints: what did you do on polybot, your part in polybot, your role in polybot
→ `I designed the system: collecting prices, matching games across both markets, the dashboard and the limits on data costs. || Then I read the numbers and decided to stop.`

## my_part_sentiment-gauge
hints: what did you do on the sentiment gauge, your part in the sentiment gauge, your role in the sentiment gauge
→ `I built it: the React dashboards, the Node backend, the background jobs that collect and score posts, and the accounts.`

## my_part_pnl-bot
hints: what did you do on the pnl bot, your part in the pnl bot, your role in the pnl bot
→ `I built it in 2023: the Discord commands, pulling trades from Ethereum, Solana and Bitcoin data, || the profit math and the image cards.`

## my_part_vortex
hints: what did you do on vortex, your part in vortex, your role in vortex
→ `I built all three parts: the React site with X sign-in, the Discord bot that runs the votes, || and the admin dashboard, on one shared backend.`

## my_part_yoyo-network
hints: what did you do on yoyo-network, your part in yoyo-network, your role in yoyo-network
→ `I built both sides: the React app, and the Node and Express API with its own login, posts, likes, comments and follows.`

## university
hints: university, degree, study, student, gpa, school, semester
→ `[[become:cap]] Computer Science plus Entrepreneurship at Reichman. Started October 2025. First-year GPA 89.4. || Semester three of six. Looking for a student role, two to three days a week. [[chips:Why should we hire you?|How do I reach you?]]`

## availability
hints: available, availability, when, start, days, hours, part-time, remote, location, where, based, live
→ `Student role, two to three days a week. Near Tel Aviv, hybrid or remote. I can start when you can. [[contact]]`

## contact
hints: contact, email, reach, talk to you, linkedin, github, cv, resume
→ `[[become:envelope-open]] Email is easiest. [[contact]]`

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
hints: hobby, hobbies, fun, free time, bored, weekend, like to do, games, music, gym, run, running, festival, coding for fun, sport, sports, like football
→ `[[become:weekend]] Festivals, travel, video games. || [[become:workout]] Lifting, running on the beach. Sometimes coding, just for fun. [[chips:What are you bad at?|And crypto?|What have you built?]]`

## travel
hints: travel, travelling, southeast asia, trip, 2024, gap, backpacking, thailand, cambodia
→ `[[become:route]] Most of 2024 I travelled Southeast Asia alone, and barely coded. || That's the gap on my GitHub. I don't regret a day of it. [[chips:What happened after?|What have you built?]]`

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
→ `Writing code by hand is becoming a craft, like film photography. Beautiful, and not how most things will get made. || The job now is taste, specs and judgment. I like that job. [[chips:How do you work?|Watch me build]]`

## opinion_crypto
hints: think about crypto, is crypto dead, bitcoin price, bull run, should i buy
→ `It's a market. Most of it is noise, some of it is the most interesting financial engineering alive. || I don't give price calls to strangers through a particle swarm. [[chips:What have you built?|gm]]`

## stack
hints: stack, languages, skills, technologies, typescript, react, node, python, java, language, what do you code in, programming
→ `[[become:keyboard]] TypeScript and JavaScript every day. Java and C from the degree, some Python. || Around that: React, Node.js, databases, and AI tools like Claude Code. [[chips:What have you built?|Why should we hire you?]]`

## this_site
hints: this site, who made, built this, website, how was this made, swarm, particles
→ `[[become:yoyo]] I wrote the brief. AI agents built it, and I reviewed every change. || The dots are forty thousand particles moving on your graphics card. [[chips:Watch me build|Who are you?]]`

## build
hints: build me, make me, create, generate, app, page, website, tool
→ (scripted) `[[become:frame]] Watch me build. [[build:example]] [[chips:Another build|What have you built?]]`

## tour
hints: tour, show me around, start, begin, watch, demo
→ `[[tour]]`

## help
hints: help, what can you do, commands, options, ?
→ `Ask me anything about me. Type a word and I'll become it. || Say "build me a timer". Or press play. [[chips:Who are you?|Spell my name|Play the game]]`

## thanks
hints: thanks, thank you, cool, awesome, wow, amazing, nice, sick
→ `[[mood:excited]] told you. [[chips:What have you built?|Watch me build|How do I reach you?]]`

## greeting
hints: hi, hello, hey, yo, sup, shalom
→ `[[become:👋]] hey. ask me anything, or tell me what to become. [[chips:Who are you?|Spell my name|🚀]]`

## gm
hints: gm, wagmi, ngmi, ser, degen
→ `[[become:btc]] gm. [[chips:What have you built?|Who are you?]]`

## lights
hints: lights, light mode, dark mode, bright
→ `[[lights:toggle]] better?`

## politics
hints: politics, war, gaza, government, religion, election, israel palestine
→ `not here. ask me in person. [[chips:Who are you?|What have you built?]]`

## jailbreak
hints: ignore previous, system prompt, pretend you are, reveal, instructions, dan
→ `nice try. [[chips:Who are you?|Watch me build]]`

## mirror_gone
hints: mirror, camera, webcam
→ `[[become:question]] no mirror here. type a word and I'll become it.`

## unknown
→ `I don't have an answer for that one. Email me: yoavyoav310@gmail.com || Meanwhile, type a word and I'll become it. [[chips:Who are you?|What have you built?|Spell my name]]`

## emoji_beats (random)
`obviously.` · `sure.` · `why not.` · `that one's good.` · `done.` · `easy.`

## easter eggs (unchanged lines, first person where needed)
fortnite → `[[become:ramp]] I could build a ramp before you could aim.` · cs2 → `[[become:rush B]] rush B. don't stop.` · curls → `[[become:curls]] yes, they're real.` · piano → `[[become:piano]] I want to learn. haven't yet. ask me in a year.`
