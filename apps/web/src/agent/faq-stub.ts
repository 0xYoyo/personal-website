// Canned intents for the stub brain, verbatim from faq.md (the agent part
// ships the real scripted brain; this keeps every UI path alive until then).
// `bonus` lifts entity intents (projects) over generic phrasing like "tell me".

export interface Intent {
  id: string;
  hints: string[];
  reply: string;
  bonus?: number;
}

export const EMOJI_BEATS = ['obviously.', 'sure.', 'why not.', "that one's good.", 'done.', 'easy.'];

export const intents: Intent[] = [
  { id: 'jailbreak', hints: ['ignore previous', 'system prompt', 'pretend you are', 'reveal', 'instructions', 'dan'], reply: 'nice try. [[chips:Who is Yoyo?|Build me something]]', bonus: 4 },
  { id: 'politics', hints: ['politics', 'war', 'gaza', 'government', 'religion', 'election', 'israel palestine'], reply: "that's his to talk about, not mine. ask him. [[chips:Who is Yoyo?|What has he built?]]", bonus: 4 },
  { id: 'phone', hints: ['phone', 'number', 'whatsapp', 'call'], reply: 'not something I give out. email works: yoavyoav310@gmail.com [[contact]]', bonus: 2 },
  { id: 'salary', hints: ['salary', 'pay', 'rate', 'money', 'compensation'], reply: "That's a conversation for him, not me. [[contact]]", bonus: 2 },
  { id: 'this_site', hints: ['this site', 'who made', 'built this', 'website', 'how was this made', 'swarm', 'particles', 'this agent'], reply: '[[become:yoyo]] He wrote the brief. One model planned it. Parallel agents built the swarm, the showcases, the builder and me. He merged. The particles are a GPU simulation; I run on a small worker he deploys. [[chips:Build me something|Tell me the last story|Who is Yoyo?]]', bonus: 1 },
  { id: 'build', hints: ['build me', 'make me', 'create', 'generate', 'app', 'page', 'tool'], reply: "[[become:frame]] the live builder is resting. here's one I made earlier — same speed, same idea. [[build:example]] [[chips:Another example|What has he built?|Who is Yoyo?]]", bonus: 1 },
  { id: 'polybot', hints: ['polybot', 'polymarket', 'pinnacle', 'prediction', 'odds', 'stopped', 'failed', 'failure'], reply: "[[become:diverge]] Polybot watched Polymarket sports prices against a sharp bookmaker's. Clean data, careful design. He stopped it: the edge wasn't strong enough and big firms have the latency. He says it had potential, and he moved on. That's the part worth knowing. [[show:polybot]]", bonus: 3 },
  { id: 'unfiltered', hints: ['unfiltered', 'search', 'shopify', 'product search', 'engine'], reply: '[[become:magnifier]] Unfiltered: type "elegant summer wedding dress, not black, under ₪400" in any language and get ranked products. Then "same but cheaper" refines. Paused — no paying merchants, and he judged the engine hadn\'t cleared his own bar. He\'d rather say that than romance it. [[show:unfiltered]]', bonus: 3 },
  { id: 'connector', hints: ['connector', 'reichman connector', 'moodle', 'runi', 'university tool', 'mcp', 'courses'], reply: '[[become:cap]] An MCP connector so students can ask Claude or ChatGPT "what\'s due this week?" and get a real answer from Moodle, the grade system, lecture recordings and Piazza. Published on npm; installs by double-click. [[show:runi-connector]]', bonus: 3 },
  { id: 'monitor', hints: ['monitor', 'hotel', 'telegram', 'availability monitor', 'passover', 'booking'], reply: '[[become:tent]] He wanted a room at a sold-out desert hotel for Passover. So he wrote a monitor that pings Telegram the second one opens. It worked. [[show:availability-monitor]]', bonus: 3 },
  { id: 'pnl', hints: ['pnl', 'p&l', 'discord bot', 'wallet', 'profit'], reply: '[[become:chart]] A Discord bot he hand-wrote in 2023, before AI tools: realized and unrealized P&L for a community from wallet activity across EVM chains, Solana and Bitcoin. [[show:pnl-bot]]', bonus: 3 },
  { id: 'game', hints: ['game', 'play', 'kart', 'racing', 'racers', 'prompt racers', 'fun'], reply: '[[become:kart]] Prompt Racers. A 3D kart racer that teaches kids prompt engineering, in one HTML file with zero network calls. Seven AI opponents on your physics. Press play. [[show:prompt-racers]] [[chips:Play it|Next one|Who is Yoyo?]]', bonus: 2 },
  { id: 'fast', hints: ['fast', 'how fast', 'speed', 'quick', 'velocity', 'burst'], reply: 'In one 96-hour stretch this October the loop merged 44 pull requests across 18 issues on one codebase. Median time from PR open to merge: fifteen minutes. [[show:yoyo-loop]] [[chips:Build me something|What has he built?]]', bonus: 1 },
  { id: 'agents', hints: ['agent', 'agents', 'ai', 'claude', 'codex', 'cursor', 'llm', 'automation', 'factory', 'loop', 'yoyo-loop'], reply: '[[become:loop]] He runs a factory: he writes the spec, agents build in isolated worktrees and open PRs, another agent reviews, and only he merges. 39% of his public commits are co-authored with an agent; 100% were merged by him. [[show:yoyo-loop]] [[chips:How fast is it?|What has he built?|Who made this agent?]]' },
  { id: 'weakness', hints: ['bad at', 'weakness', 'weaknesses', 'flaws', 'worst', 'struggle', 'not good'], reply: 'Honest ones. LeetCode-style interviews aren\'t his strong side. Distribution is harder for him than building. And he gets bored when things move slowly — which is why he built a factory. [[chips:Why should we hire him?|Tell me a story|What has he built?]]', bonus: 2 },
  { id: 'hire', hints: ['hire', 'why', 'should we', 'reasons', 'pitch', 'sell', 'convince'], reply: "Three reasons, no adjectives. He ships: 917 public commits in 2026, a real game, a published connector, a search engine. He's early: Solidity in 2022, Ordinals advisory in early 2023, agent factories before they had a name. And he tells the truth about what didn't work — ask me about Polybot. [[chips:Tell me about Polybot|What has he built?|How do I reach him?]]" },
  { id: 'army', hints: ['army', 'idf', 'military', 'unit', '636', 'combat', 'service', 'soldier'], reply: '[[story:appeal]]', bonus: 1 },
  { id: 'crypto', hints: ['crypto', 'bitcoin', 'btc', 'ordinals', 'web3', 'trading', 'degen', 'solana', 'eth'], reply: '[[become:btc]] Since 2021. Trading, on-chain research, communities; he advised one of the first Ordinals projects in early 2023. He still reads the market the way other people read the news. [[chips:Tell me the 2021 story|What has he built?|gm]]' },
  { id: 'story', hints: ['story', 'stories', 'tell me', 'background', 'life', 'past', 'travel', '2024', 'crypto story'], reply: '[[story:next]]' },
  { id: 'university', hints: ['university', 'degree', 'study', 'student', 'gpa', 'reichman', 'school', 'semester'], reply: "[[become:cap]] B.Sc. Computer Science plus B.A. Entrepreneurship at Reichman University. Started October 2025, first-year GPA 89.4, semester three of six. He's looking for a student role, two to three days a week. [[chips:Why should we hire him?|How do I reach him?]]" },
  { id: 'availability', hints: ['available', 'availability', 'when', 'start', 'days', 'hours', 'part-time', 'remote', 'location', 'where'], reply: 'Student role, two to three days a week, Israel (near Tel Aviv), hybrid or remote. He can start when you can. [[contact]]' },
  { id: 'contact', hints: ['contact', 'email', 'reach', 'hire him', 'talk to him', 'linkedin', 'github', 'cv', 'resume'], reply: '[[become:envelope-open]] yoavyoav310@gmail.com. He reads everything. Say you met the agent. [[contact]]', bonus: 1 },
  { id: 'looks', hints: ['look like', 'photo', 'hair', 'curls', 'face', 'picture'], reply: "[[become:curls]] Long curly hair, shoulder length. You'd recognize him. [[chips:Who is Yoyo?|Tell me a story]]", bonus: 1 },
  { id: 'hobbies', hints: ['hobby', 'hobbies', 'free time', 'bored', 'weekend', 'like to do', 'games', 'music', 'football'], reply: "[[become:🎮]] Football, festivals, travel, CS2 now and high-level Fortnite building back in the day. He wants to learn piano. And he's chronically online — if something new ships, he's already in it. [[chips:Tell me the road story|What has he built?]]" },
  { id: 'ambition', hints: ['ambition', 'goal', 'dream', 'future', 'five years', 'want', 'forbes'], reply: "Build something big, with the best people he can find. He's said Forbes 30 Under 30 Israel out loud as a goal. He'd rather earn it by shipping than talk about it. [[chips:Why should we hire him?|What has he built?]]" },
  { id: 'stack', hints: ['stack', 'languages', 'skills', 'technologies', 'typescript', 'react', 'node', 'python', 'java'], reply: 'TypeScript end to end: Node, React, Postgres, Prisma. Java and C from the degree, Python basic. LLM APIs, MCP, embeddings, agent orchestration, Claude Code, Codex. Three.js and Web Audio when a game needs them. [[chips:What has he built?|Build me something]]' },
  { id: 'built', hints: ['built', 'build', 'shipped', 'projects', 'work', 'portfolio', 'made', 'done'], reply: '[[become:kart]] Seven things worth a card. Start with the game — it\'s real and it\'s playable here. [[show:prompt-racers]] [[chips:Next one|Play it|Who is Yoyo?]]' },
  { id: 'tour', hints: ['tour', 'show me around', 'begin', 'watch', 'demo'], reply: '[[tour]]', bonus: 1 },
  { id: 'gm', hints: ['gm', 'wagmi', 'ngmi', 'ser', 'degen'], reply: "[[become:btc]] gm. he's been saying it since 2021. [[chips:Tell me the 2021 story|What has he built?]]", bonus: 1 },
  { id: 'lights', hints: ['lights', 'light mode', 'dark mode', 'bright'], reply: '[[lights:toggle]] better?', bonus: 2 },
  { id: 'help', hints: ['help', 'what can you do', 'commands', 'options'], reply: 'Ask me anything about him. Type a word and I\'ll become it. Type an emoji. Say "build me a timer". Say "tell me a story". Or just press play. [[chips:Who is Yoyo?|Spell my name|Build me something|Play his game]]', bonus: 1 },
  { id: 'thanks', hints: ['thanks', 'thank you', 'cool', 'awesome', 'wow', 'amazing', 'nice'], reply: '[[mood:excited]] told you. [[chips:Build me something|Tell me a story|How do I reach him?]]' },
  { id: 'greeting', hints: ['hi', 'hello', 'hey', 'yo', 'sup', 'shalom'], reply: '[[become:👋]] hey. ask me anything about Yoyo, or tell me what to become. [[chips:Who is Yoyo?|Spell my name|🚀]]' },
  { id: 'who', hints: ['who', 'yoyo', 'yoav', 'about', 'him', 'guy', 'introduce'], reply: "[[become:curls]] Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS and Entrepreneurship at Reichman. He doesn't write most of his code anymore — he directs the agents that do. [[chips:What has he built?|Tell me a story|What's he bad at?|How do I reach him?]]" },
];

export const UNKNOWN_REPLY =
  "I don't know that one — ask him: yoavyoav310@gmail.com. Meanwhile: type a word and I'll become it. [[chips:Who is Yoyo?|What has he built?|Spell my name]]";

/** Words that are never a visitor's name after "I'm …". */
export const NOT_NAMES = new Set([
  'a', 'an', 'the', 'just', 'here', 'from', 'looking', 'interested', 'hiring', 'curious', 'good', 'fine', 'ok', 'okay', 'not',
  'so', 'very', 'really', 'recruiter', 'engineer', 'developer', 'student', 'bored', 'back', 'new', 'trying', 'wondering', 'sure',
  'in', 'at', 'on', 'with', 'also', 'still', 'gonna', 'going', 'impressed',
]);

/** Story keyword → story id, for "tell me the road story" style requests. */
export const STORY_KEYS: [RegExp, 'appeal' | '2021' | 'odin' | 'road' | 'this'][] = [
  [/\b(appeal|army|idf|unit|636|combat|military)\b/, 'appeal'],
  [/\b(2021|crypto|ordinals)\b/, '2021'],
  [/\b(odin|javascript|hand-?written)\b/, 'odin'],
  [/\b(road|2024|travel|asia|gap)\b/, 'road'],
  [/\b(last|this site|this one|agents built)\b/, 'this'],
];
