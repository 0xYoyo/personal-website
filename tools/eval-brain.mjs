#!/usr/bin/env node
// Offline eval of the scripted brain (POLISH1 C6). No network, no browser.
//
//   npm run eval            → scripted brain + mock worker, prints a table, exits 1 on any miss
//   node tools/eval-brain.mjs --quiet
//
// 1. Every hint of every faq.md intent → classify() → the intent that lists it (or one of the
//    intents, when faq.md lists a hint under several; or the easter egg that claims it), and the
//    reply's actions are exactly the actions of that intent's faq.md line.
// 2. Every chip label the site can show (content/chips.ts + every [[chips:…]] in faq.md and the
//    easter eggs) → resolveChip(); UI chips must resolve to their command, the rest are sent to
//    the brain and must land on the expected intent with the expected actions. The same chips go
//    through the mock worker's reply (tools/mock-worker.mjs), so the mock can't drift (C2).
// 3. Turns (POLISH2 C1): every reply the scripted brain can give (faq.md, easter eggs, unknown,
//    each with the resting line in front) and every mock reply, through the client's pipeline
//    (pacer → tag parser → turn splitter): each turn ≤ 22 words, no `|` left on screen, nothing
//    lost, and the resting line a turn of its own. The Worker's pacer (apps/worker/src/pace.ts,
//    C4) must pace every one of them — and long unpaced replies — exactly like the client's.
// 4. Once-only facts (FIX4 C5, WAVE4): "44 pull requests" only in the "How fast is it?" reply (and the
//    yoyo-loop showcase); "since 2021" only in the crypto reply (and the show's scene 6).
// 5. Questions (WAVE4 C4): typed questions → the intent they must land on, with words their reply
//    must not say.
// 6. Wave 6 copy (WAVE6 C5): the hire reply's words, shapes and chips; the who wording; the show's scene 6
//    caption; the hobbies reply's monochrome glyphs (no emoji anywhere in it); the Prompt Racers card facts.

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { loadAgent } from './lib/agent-bundle.mjs';

const A = await loadAgent();

/** `become:glyph:curls`, `show:prompt-racers`, `story:next`, `build:<instruction>`, `chips`, … */
export function actionKey(a) {
  switch (a.type) {
    case 'become': {
      const s = a.shape;
      return `become:${s.kind}${s.kind === 'glyph' ? `:${s.id}` : s.kind === 'text' ? `:${s.text}` : s.kind === 'emoji' ? `:${s.emoji}` : ''}`;
    }
    case 'show':
      return `show:${a.project}`;
    case 'story':
      return `story:${a.id}`;
    case 'build':
      return `build:${a.instruction}`;
    case 'mood':
      return `mood:${a.mood}`;
    case 'lights':
      return `lights:${a.mode}`;
    default:
      return a.type;
  }
}

export const actionsOf = (raw) => A.extractActions(raw, { glyphs: A.GLYPH_IDS }).actions.map(actionKey);

/** `build:*` matches any build; other keys must be equal. */
const keyMatch = (want, got) => (want.endsWith(':*') ? got.startsWith(want.slice(0, -1)) : want === got);
const hasAll = (wants, gots) => wants.every((w) => gots.some((g) => keyMatch(w, g)));

/**
 * What each chip must do. `ui`: the chip is a UI command (resolveChip kind), never sent to the brain.
 * `intent`: the classification (intent id, or kind:id for commands/extras); `actions`: must all appear.
 * `say`: the text a UI chip forwards to the brain when it has nothing to act on.
 */
export const CHIP_EXPECT = {
  'Who are you?': { intent: 'who', actions: ['become:glyph:curls', 'become:glyph:cap', 'chips'] },
  'What have you built?': { intent: 'built', actions: ['become:glyph:magnifier', 'show:unfiltered'] },
  // with no name known the chip asks itself, in one line (FIX4 U6): it never reaches the brain
  'Spell my name': { ui: 'ask-name' },
  // the card chip (WAVE4 C2): with a card open it builds the project's seed; elsewhere the brain's `build`
  'Build me something': { ui: 'build' },
  'Play the game': { ui: 'play' },
  'Tell me a story': { ui: 'story-next' },
  'What are you like?': { intent: 'like', actions: ['chips'] },
  'And crypto?': { intent: 'crypto', actions: ['become:glyph:btc', 'chips'] },
  // opens Work on the Hand-written tab (the UI acts on the `work` action, WAVE4 U8)
  'Show me those': { intent: 'hand_work', actions: ['work'] },
  'What are you bad at?': { intent: 'weakness', actions: ['chips'] },
  'Why should we hire you?': { intent: 'hire', actions: ['chips'] },
  'How do I reach you?': { intent: 'contact', actions: ['become:glyph:envelope-open', 'contact'] },
  'What do you do for fun?': { intent: 'hobbies', actions: ['chips'] },
  'How do you work?': { intent: 'agents', actions: ['show:yoyo-loop'] },
  'How do you work now?': { intent: 'agents', actions: ['show:yoyo-loop'] },
  'What happened after?': { intent: 'after_travel', actions: ['chips'] },
  'What do you think about AI coding?': { intent: 'opinion_ai', actions: ['chips'] },
  'What do you think about crypto?': { intent: 'opinion_crypto', actions: ['chips'] },
  'Change it': { ui: 'change-build' },
  'Share it': { ui: 'share-build' },
  // the build's row (WAVE4 U7): closes the build in the UI
  Close: { ui: 'close' },
  'Build another': { ui: 'say', say: 'Build me something', intent: 'build', actions: ['build:*'] },
  // WAVE5 C5: the build row's chip, and the main conversation's build chip (a build replay)
  'Another build': { ui: 'say', say: 'Build me something', intent: 'build', actions: ['build:*'] },
  // a build command in intents.ts (like "another build"): always a build, never the tour's "watch"
  'Watch me build': { intent: 'command:another-build', actions: ['build:*'] },
  // WAVE5 C5: the card rows' question chips (with a card open the site answers my_part as my_part_<id>)
  // `project`: the card these chips sit on (scoped intents answer only there or when the message names it)
  'What was the hardest part?': { intent: 'unfiltered_hard', actions: [], project: 'unfiltered' },
  'How does it teach prompting?': { intent: 'racers_teach', actions: [], project: 'prompt-racers' },
  'What if an agent gets it wrong?': { intent: 'loop_wrong', actions: [], project: 'yoyo-loop' },
  'What can it access?': { intent: 'connector_access', actions: [], project: 'runi-connector' },
  // with no card open: the general answer (faq.md `my_part`); per card it is `my_part_<id>` (evalMyPart)
  'What did you do on this?': { intent: 'my_part', actions: [] },
  'Another example': { ui: 'say', say: 'Build me something', intent: 'build', actions: ['build:*'] },
  'How was this made?': { intent: 'this_site', actions: ['become:yoyo3d'] },
  'Next story': { ui: 'story-next' },
  'Next one': { ui: 'next-project' },
  'Play it': { ui: 'play' },
  'sound on': { ui: 'sound-on' },
  // the hire reply's first chip (WAVE6 X5): Work on the Hand-written era, in the UI
  'Show my hand-written work': { ui: 'work' },
  'Tell me about Polybot': { intent: 'polybot', actions: ['become:glyph:diverge', 'show:polybot'] },
  'How fast is it?': { intent: 'fast', actions: [] },
  gm: { intent: 'gm', actions: ['become:glyph:btc'] },
  'Now a rocket': { intent: 'command:rocket', actions: ['become:emoji:🚀'] },
  '🚀': { intent: 'emoji', actions: ['become:emoji:🚀'] },
};

/** Every chip label the site can show. */
export function allChipLabels() {
  const c = A.chips;
  const labels = new Set([
    ...c.ENTRY_CHIPS,
    ...c.WHO_CHIPS,
    ...c.BUILD_CHIPS,
    ...c.STORY_CHIPS,
    ...(c.TOUR_END_CHIPS ?? []),
    ...A.PROJECT_IDS.flatMap((id) => c.projectChips(id)),
    'sound on',
    // returning visitor (POLISH1 A6), when content/chips.ts has it
    ...(typeof c.returningChips === 'function' ? c.returningChips('Pomodoro') : []),
  ]);
  for (const r of [...A.FAQ_INTENTS.map((i) => i.reply), ...A.EXTRA_INTENTS.map((x) => x.reply), A.FAQ_UNKNOWN]) {
    for (const m of r.matchAll(/\[\[chips:([^\]]*)\]\]/g)) for (const l of m[1].split('|')) if (l.trim()) labels.add(l.trim());
  }
  return [...labels];
}

const classKey = (c) => (c.kind === 'intent' ? c.id : c.kind === 'command' || c.kind === 'extra' ? `${c.kind}:${c.id}` : c.kind);

const CTX = { name: null, lastShown: null, random: () => 0 };
const CHIP_STATE = { project: 'prompt-racers', hasBuild: true, hasStoredBuild: true };

/** Expectation for a label; "Open my <title>" chips are dynamic. */
const expectFor = (chip) => CHIP_EXPECT[chip] ?? (/^Open my /.test(chip) ? { ui: 'open-build' } : undefined);

/** Intents that answer only with their card open or the project named (WAVE5 C4, intents.ts SCOPED_INTENTS). */
const SCOPED = { unfiltered_hard: 'unfiltered', racers_teach: 'prompt-racers', loop_wrong: 'yoyo-loop', connector_access: 'runi-connector' };

/** Runs the hint checks; returns rows {kind, input, want, got, ok}. */
export function evalHints() {
  const rows = [];
  for (const intent of A.FAQ_INTENTS) {
    for (const hint of intent.hints) {
      const owners = A.FAQ_INTENTS.filter((i) => i.hints.includes(hint)).map((i) => i.id);
      const egg = A.EXTRA_INTENTS.find((x) => x.match.test(hint));
      const project = SCOPED[intent.id] ?? null;
      const c = A.classify(hint, { project });
      const got = classKey(c);
      const want = egg ? `extra:${egg.id}` : owners.length > 1 ? owners.join('|') : intent.id;
      let ok = egg ? got === want : owners.includes(got);
      let detail = '';
      if (ok && !egg) {
        const reply = A.scriptedReply(hint, { ...CTX, project }).raw;
        const gotActions = actionsOf(reply);
        let wantActions = actionsOf(A.FAQ_INTENTS.find((i) => i.id === got).reply);
        if (got === 'build') wantActions = wantActions.map((k) => (k === 'build:example' ? 'build:*' : k));
        if (got === 'story') wantActions = ['story:*'];
        ok = wantActions.length === gotActions.length && wantActions.every((w, i) => keyMatch(w, gotActions[i]));
        if (!ok) detail = ` actions ${JSON.stringify(gotActions)} ≠ ${JSON.stringify(wantActions)}`;
      }
      rows.push({ kind: 'hint', input: hint, want, got: got + detail, ok });
    }
  }
  return rows;
}

/** Runs the chip checks against a reply function (text → raw reply); returns rows. */
export function evalChips(replyFn, label = 'scripted') {
  // replyFn(text, project): the reply with that card open (null: none)
  const rows = [];
  for (const chip of allChipLabels()) {
    const exp = expectFor(chip);
    if (!exp) {
      rows.push({ kind: `chip/${label}`, input: chip, want: '(expectation)', got: 'no entry in CHIP_EXPECT', ok: false });
      continue;
    }
    const cmd = A.chips.resolveChip(chip, CHIP_STATE);
    if (exp.ui && exp.ui !== 'say') {
      rows.push({ kind: `chip/${label}`, input: chip, want: `ui:${exp.ui}`, got: `ui:${cmd.kind}`, ok: cmd.kind === exp.ui });
      continue;
    }
    let text = chip;
    if (exp.ui === 'say') {
      if (cmd.kind !== 'say' || cmd.text !== exp.say) {
        rows.push({ kind: `chip/${label}`, input: chip, want: `say:${exp.say}`, got: `${cmd.kind}:${cmd.text ?? ''}`, ok: false });
        continue;
      }
      text = cmd.text;
    } else if (cmd.kind !== 'say') {
      rows.push({ kind: `chip/${label}`, input: chip, want: 'sent to the brain', got: `ui:${cmd.kind}`, ok: false });
      continue;
    }
    const want = exp.intent ?? CHIP_EXPECT[text]?.intent;
    const wantActions = exp.actions ?? CHIP_EXPECT[text]?.actions ?? [];
    const project = exp.project ?? null;
    const got = classKey(A.classify(text, { project }));
    const raw = replyFn(text, project);
    const acts = actionsOf(raw);
    // a scoped chip must get its own reply, not the unknown line
    if (exp.intent && want !== 'build' && A.FAQ_INTENTS.some((i) => i.id === want) && !raw.includes(A.FAQ_INTENTS.find((i) => i.id === want).reply.slice(0, 40))) {
      rows.push({ kind: `chip/${label}`, input: chip, want: `${want}'s reply`, got: raw.slice(0, 60), ok: false });
      continue;
    }
    const ok = got === want && hasAll(wantActions, acts);
    rows.push({ kind: `chip/${label}`, input: chip, want: `${want} ${wantActions.join(' ')}`, got: `${got} ${acts.join(' ')}`, ok });
  }
  return rows;
}

/** raw reply → the turns the visitor sees (the client's pipeline: pace.ts → tags.ts → turns.ts). */
export function turnsOf(raw) {
  const { text } = A.extractActions(A.paceReply(raw), { glyphs: A.GLYPH_IDS });
  const turns = [''];
  const t = A.createTurnSplitter((o) => {
    if (o.type === 'turn') turns.push('');
    else if (o.type === 'token') turns[turns.length - 1] += o.text;
  });
  t.text(text);
  t.end();
  return turns.filter((x, i) => x || i === 0);
}

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const flat = (s) => s.replace(/\|\|/g, ' ').replace(/\s+/g, ' ').trim();

/** Turn checks over a set of [label, raw] replies; returns rows. */
export function evalTurns(replies, label) {
  const rows = [];
  for (const [input, raw] of replies) {
    const turns = turnsOf(raw);
    const longest = Math.max(...turns.map(words));
    const shown = turns.join(' ');
    const plain = flat(A.extractActions(raw, { glyphs: A.GLYPH_IDS }).text);
    const problems = [];
    // an unpaced reply of up to 32 words stays one turn (C1); past that, or once paced, ≤ 22 a turn
    const unpacedShort = !raw.includes('||') && A.countWords(raw) <= A.AUTO_PACE_WORDS;
    if (unpacedShort ? turns.length !== 1 : longest > A.TURN_MAX_WORDS) problems.push(unpacedShort ? `${turns.length} turns` : `a turn of ${longest} words`);
    if (shown.includes('|')) problems.push('a | on screen');
    if (flat(shown) !== plain) problems.push('text changed');
    if (raw.includes(A.RESTING_LINE) && raw.trim() !== A.RESTING_LINE && !turns.includes(A.RESTING_LINE)) problems.push('resting line not its own turn');
    rows.push({ kind: `turns/${label}`, input, want: unpacedShort ? 'one turn' : `≤ ${A.TURN_MAX_WORDS} words a turn`, got: problems.join(', ') || `${turns.length} turns, longest ${longest}`, ok: !problems.length });
  }
  return rows;
}

/** Long replies with no `||`, as a model that ignores the persona would give them. */
export const UNPACED = [
  ...A.FAQ_INTENTS.filter((i) => i.reply.includes('||')).map((i) => [`unpaced:${i.id}`, i.reply.replace(/\s*\|\|\s*/g, ' ')]),
];

/** The Worker's pacer agrees with the client's; returns rows. */
export function evalWorkerPace(replies) {
  return replies.map(([input, raw]) => {
    const w = A.workerPaceReply(raw);
    const c = A.paceReply(raw);
    return { kind: 'pace/worker', input, want: 'same as the client', got: w === c ? 'same' : JSON.stringify(w), ok: w === c };
  });
}

/**
 * Once-only facts (FIX4 C5): "44 pull requests" belongs to the factory story and the yoyo-loop card,
 * never to a reply (it would repeat what the card or the story just said). Returns rows.
 */
export const ONCE_FACTS = [
  { id: '44 pull requests', re: /\b44[\s-]*(pull requests|PRs?)\b/i, home: ['fast'] },
  { id: 'since 2021', re: /\bsince 2021\b/i, home: ['crypto'] },
];
/** `fast`, `resting+fast`, `mock:<chip>` → the intent id a reply row belongs to. */
const homeOf = (input) => (input.startsWith('mock:') ? classKey(A.classify(input.slice(5))) : input.replace(/^resting\+/, ''));
export function evalOnceFacts(replies) {
  return ONCE_FACTS.flatMap(({ id, re, home }) =>
    replies
      .filter(([input]) => !home.includes(homeOf(input)))
      .map(([input, raw]) => ({ kind: 'facts/once', input, want: `no "${id}"`, got: re.test(raw) ? 'has it' : 'clean', ok: !re.test(raw) })),
  );
}

/**
 * Typed questions (WAVE4 C4) → the intent they must land on; `not`: words the reply must not say.
 */
export const QUESTIONS = [
  { q: 'what languages do you know', intent: 'stack' },
  { q: 'And crypto?', intent: 'crypto' },
  { q: 'and crypto', intent: 'crypto' },
  { q: 'do you like football', intent: 'hobbies', not: /football/i },
  { q: 'did you trade cs skins', intent: 'crypto' },
  { q: 'tell me about the sentiment gauge', intent: 'sentiment', actions: ['show:sentiment-gauge'] },
  { q: 'Show me those', intent: 'hand_work', actions: ['work'] },
  // WAVE5 C4 / C7: the new intents, typed
  { q: 'can you code without AI', intent: 'without_ai', actions: ['work'] },
  { q: 'Can you code without AI?', intent: 'without_ai', actions: ['work'] },
  { q: 'do you write code by hand', intent: 'without_ai', actions: ['work'] },
  { q: 'can you actually code', intent: 'without_ai', actions: ['work'] },
  { q: 'what was the hardest part of unfiltered', intent: 'unfiltered_hard' },
  { q: 'what was the biggest challenge', intent: 'unfiltered_hard', project: 'unfiltered' },
  { q: 'what was the hardest part', intent: 'unfiltered_hard', project: 'unfiltered' },
  { q: 'what is this', intent: 'unfiltered', project: 'unfiltered' },
  { q: 'how does prompt racers teach prompting', intent: 'racers_teach' },
  { q: 'what do kids learn', intent: 'racers_teach', project: 'prompt-racers' },
  { q: 'what happens when an agent gets it wrong', intent: 'loop_wrong' },
  { q: 'what if the review fails', intent: 'loop_wrong', project: 'yoyo-loop' },
  { q: 'what if an agent writes a bug', intent: 'loop_wrong' },
  { q: 'what can the connector access', intent: 'connector_access' },
  { q: 'what does it read', intent: 'connector_access', project: 'runi-connector' },
  // scoped follow-ups don't answer off their card: "learn" and "mistake" mean something else there
  { q: 'what was the hardest part', intent: 'unknown', not: /engine/i },
  { q: 'what did you do on this project', intent: 'my_part', not: /\bUnfiltered\b/ },
  { q: 'what was your role', intent: 'my_part' },
  { q: 'what did you do on unfiltered', intent: 'my_part_unfiltered' },
  { q: 'your part in prompt racers', intent: 'my_part_prompt-racers' },
  { q: 'your role in vortex', intent: 'my_part_vortex' },
  { q: 'Watch me build', intent: 'command:another-build', actions: ['build:*'] },
  // the card chip on every card without its own question chip, and typed, with that card open
  ...['prompt-racers', 'yoyo-loop', 'runi-connector', 'availability-monitor', 'polybot', 'sentiment-gauge', 'pnl-bot', 'vortex', 'yoyo-network', 'unfiltered'].flatMap((project) => [
    { q: 'What did you do on this?', intent: `my_part_${project}`, project },
    { q: 'what was your part', intent: `my_part_${project}`, project },
  ]),
];
export function evalQuestions(replyFn, label = 'scripted') {
  return QUESTIONS.map(({ q, intent, not, actions = [], project = null }) => {
    const got = classKey(A.classify(q, { project }));
    const raw = replyFn(q, project);
    const acts = actionsOf(raw);
    const problems = [];
    if (got !== intent) problems.push(`landed on ${got}`);
    if (not && not.test(A.extractActions(raw, { glyphs: A.GLYPH_IDS }).text)) problems.push(`says ${not}`);
    if (!hasAll(actions, acts)) problems.push(`actions ${acts.join(' ')}`);
    return { kind: `ask/${label}`, input: q, want: `${intent} ${actions.join(' ')}${not ? ` not ${not}` : ''}`, got: problems.join(', ') || got, ok: !problems.length };
  });
}

/**
 * WAVE5 C7: claims the site no longer makes. Nothing the brain or the mock can say, no builder line, and no
 * visible copy in content/ (copy.ts, projects.ts, show.ts, chips.ts) or the Vortex showcase says them.
 */
export const BANNED = /made earlier|15 seconds|fifteen seconds|still live|role granted|every language|live builder/i;
const CONTENT_FILES = ['content/copy.ts', 'content/projects.ts', 'content/show.ts', 'content/chips.ts', 'showcases/parts/vortex/Vortex.tsx'];
export function evalBanned(replies) {
  const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');
  const lines = [
    ['line:EXAMPLE_DONE_LINE', A.EXAMPLE_DONE_LINE],
    ['line:CHANGE_RESTING_LINE', A.CHANGE_RESTING_LINE],
    ['line:CHANGE_SAME_LINE', A.CHANGE_SAME_LINE],
    ...CONTENT_FILES.map((f) => [`file:${f}`, readFileSync(join(web, f), 'utf8').replace(/^\s*(\/\/|\/?\*).*$/gm, '')]),
  ];
  return [...replies, ...lines].map(([input, raw]) => {
    const m = BANNED.exec(raw);
    return { kind: 'copy/banned', input, want: 'none of the retired claims', got: m ? `says "${m[0]}"` : 'clean', ok: !m };
  });
}

/** No em dash (or a ` -- `) in anything the visitor can read from the brain (WAVE4 copy rules). */
export function evalDashes(replies) {
  return replies.map(([input, raw]) => {
    const shown = A.extractActions(raw, { glyphs: A.GLYPH_IDS }).text;
    const bad = /—| -- /.test(shown) || /\[\[chips:[^\]]*—/.test(raw);
    return { kind: 'copy/dash', input, want: 'no em dash', got: bad ? 'has one' : 'clean', ok: !bad };
  });
}

/** The site's content modules (projects, the show), bundled like the brain (tools/lib/agent-bundle.mjs). */
async function loadContent() {
  const { build } = await import('esbuild');
  const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'src');
  const out = await build({
    stdin: {
      contents: `export { projects } from './content/projects';\nexport { SHOW_LINES, SCENE6_LINES, SHOW_CAPTIONS } from './content/show';`,
      resolveDir: web, loader: 'ts', sourcefile: 'content-entry.ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22', logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}

/** WAVE6 C1–C4, verbatim. */
export const WAVE6 = {
  hire: [
    'I ship real products: a search engine, a 3D game, a tool my whole university can use.',
    'I like being early. I was building with AI agents when most people called it a toy.',
    'Self-taught, full-stack. I built complete applications by hand before I started working with agents.',
    "And I'll tell you what didn't work. Ask me about Polybot.",
  ],
  hireBecomes: ['become:glyph:check', 'become:glyph:loop', 'become:glyph:keyboard', 'become:glyph:diverge'],
  hireChips: ['Show my hand-written work', 'Tell me about Polybot', 'How do I reach you?'],
  who: 'Computer Science and Entrepreneurship at Reichman. Self-taught developer before that.',
  scene6: 'Self-taught dev since 2022.',
  hobbies: ['Festivals, travel, video games.', 'Lifting, running on the beach. Sometimes coding, just for fun.'],
  hobbiesBecomes: ['become:glyph:weekend', 'become:glyph:workout'],
  racersFacts: [
    'Kids build better kart parts by writing better prompts, then race with what they built.',
    'A full game: seven AI rivals, upgrades and races that get harder.',
    'Made for an AI-education contest for Israeli schools.',
  ],
};
const EMOJI = /\p{Extended_Pictographic}/u;

/** Wave 6 copy checks (C5); returns rows. `replyFn(text)` → the raw reply (scripted brain or mock). */
export async function evalWave6(replyFn, label = 'scripted') {
  const rows = [];
  const row = (input, want, problems) => rows.push({ kind: `wave6/${label}`, input, want, got: problems.join(', ') || 'ok', ok: !problems.length });
  const parts = (raw) => A.extractActions(raw, { glyphs: A.GLYPH_IDS }).text.split('||').map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chipsOf = (raw) => A.extractActions(raw, { glyphs: A.GLYPH_IDS }).actions.filter((a) => a.type === 'chips').map((a) => a.chips);
  {
    const raw = replyFn('Why should we hire you?');
    const p = [];
    if (JSON.stringify(parts(raw)) !== JSON.stringify(WAVE6.hire)) p.push(`text ${JSON.stringify(parts(raw))}`);
    const becomes = actionsOf(raw).filter((k) => k.startsWith('become:'));
    if (JSON.stringify(becomes) !== JSON.stringify(WAVE6.hireBecomes)) p.push(`shapes ${becomes.join(' ')}`);
    if (JSON.stringify(chipsOf(raw)) !== JSON.stringify([WAVE6.hireChips])) p.push(`chips ${JSON.stringify(chipsOf(raw))}`);
    row('hire', 'four beats, keyboard on beat 3, the hire chips', p);
  }
  {
    const raw = replyFn('Who are you?');
    const t = parts(raw);
    row('who', WAVE6.who, [...(t[1] === WAVE6.who ? [] : [`said ${JSON.stringify(t[1])}`]), ...(/Self-taught before/.test(raw) ? ['still "Self-taught before"'] : [])]);
  }
  {
    const raw = replyFn('What do you do for fun?');
    const p = [];
    if (JSON.stringify(parts(raw)) !== JSON.stringify(WAVE6.hobbies)) p.push(`text ${JSON.stringify(parts(raw))}`);
    const acts = A.extractActions(raw, { glyphs: A.GLYPH_IDS }).actions;
    const becomes = acts.filter((a) => a.type === 'become').map(actionKey);
    if (JSON.stringify(becomes) !== JSON.stringify(WAVE6.hobbiesBecomes)) p.push(`shapes ${becomes.join(' ')}`);
    if (acts.some((a) => a.type === 'become' && a.shape.kind === 'emoji') || EMOJI.test(raw)) p.push('an emoji');
    row('hobbies', 'weekend + workout glyphs, no emoji', p);
  }
  if (label === 'scripted') {
    const C = await loadContent();
    const p = [];
    if (C.SCENE6_LINES[1] !== WAVE6.scene6) p.push(`scene 6 beat "${C.SCENE6_LINES[1]}"`);
    if (!C.SHOW_LINES[5].includes(WAVE6.scene6)) p.push(`scene 6 line "${C.SHOW_LINES[5]}"`);
    if (!C.SHOW_CAPTIONS.includes(WAVE6.scene6)) p.push('not among the captions');
    if (C.SHOW_CAPTIONS.some((c) => /Self-taught (since|before)/.test(c)) || /Self-taught (since|before)/.test(C.SHOW_LINES.join(' '))) p.push('old wording left');
    row('show:scene6', WAVE6.scene6, p);
    const racers = C.projects.find((x) => x.id === 'prompt-racers');
    row('card:prompt-racers', 'the three card facts', JSON.stringify(racers?.cardFacts) === JSON.stringify(WAVE6.racersFacts) ? [] : [`facts ${JSON.stringify(racers?.cardFacts)}`]);
  }
  return rows;
}

/** Every reply the scripted brain can give, plain and behind the resting line. */
export function scriptedReplies() {
  const base = [
    ...A.FAQ_INTENTS.map((i) => [i.id, i.reply]),
    ...A.EXTRA_INTENTS.map((x) => [`egg:${x.id}`, x.reply]),
    ['unknown', A.FAQ_UNKNOWN],
    ...Object.entries(A.ADDED_LINES).map(([k, v]) => [`added:${k}`, v]),
  ];
  return [...base, ...base.map(([k, v]) => [`resting+${k}`, A.withRestingLine(v)])];
}

export async function runEval({ quiet = false } = {}) {
  const { mockReply } = await import('./mock-worker.mjs');
  const rows = [
    ...evalHints(),
    ...evalChips((t, project) => A.scriptedReply(t, { ...CTX, project }).raw, 'scripted'),
    ...evalChips((t, project) => mockReply(t, {}, [], { project }), 'mock'),
    ...evalTurns(scriptedReplies(), 'scripted'),
    ...evalTurns(
      A.FAQ_INTENTS.flatMap((i) => i.hints).map((h) => [h, mockReply(h, {}, [])]),
      'mock',
    ),
    ...evalTurns(UNPACED, 'unpaced'),
    ...evalWorkerPace([...scriptedReplies(), ...UNPACED]),
    ...evalOnceFacts([...scriptedReplies(), ...allChipLabels().map((c) => [`mock:${c}`, mockReply(c, {}, [])])]),
    ...evalQuestions((t, project) => A.scriptedReply(t, { ...CTX, project }).raw, 'scripted'),
    ...evalQuestions((t, project) => mockReply(t, {}, [], { project }), 'mock'),
    ...evalDashes(scriptedReplies()),
    ...evalBanned([...scriptedReplies(), ...allChipLabels().map((c) => [`mock:${c}`, mockReply(c, {}, [])])]),
    ...(await evalWave6((t) => A.scriptedReply(t, CTX).raw, 'scripted')),
    ...(await evalWave6((t) => mockReply(t, {}, []), 'mock')),
  ];
  const fails = rows.filter((r) => !r.ok);
  const by = (k) => rows.filter((r) => r.kind === k);
  if (!quiet) {
    for (const r of rows) if (!r.ok || process.env.EVAL_VERBOSE) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.kind.padEnd(13)} ${JSON.stringify(r.input).padEnd(34)} want ${r.want}  got ${r.got}`);
  }
  const line = (k) => {
    const rs = by(k);
    return `${k.padEnd(13)} ${rs.filter((r) => r.ok).length}/${rs.length}`;
  };
  console.log(
    [
      `eval-brain: ${A.FAQ_INTENTS.length} faq intents, ${by('hint').length} hints, ${allChipLabels().length} chip labels`,
      line('hint'),
      line('chip/scripted'),
      line('chip/mock'),
      line('turns/scripted'),
      line('turns/mock'),
      line('turns/unpaced'),
      line('pace/worker'),
      line('facts/once'),
      line('ask/scripted'),
      line('ask/mock'),
      line('copy/dash'),
      line('copy/banned'),
      line('wave6/scripted'),
      line('wave6/mock'),
      fails.length ? `${fails.length} FAILED` : 'all passed',
    ].join('\n'),
  );
  return fails.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const failed = await runEval({ quiet: process.argv.includes('--quiet') });
  process.exit(failed ? 1 : 0);
}
