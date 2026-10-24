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
//    lost, and the resting line a turn of its own.

import { fileURLToPath } from 'node:url';
import { normalize } from 'node:path';
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
  'Who is Yoyo?': { intent: 'who', actions: ['become:glyph:curls', 'chips'] },
  'What has he built?': { intent: 'built', actions: ['show:prompt-racers'] },
  'Spell my name': { intent: 'spell-my-name', actions: ['become:glyph:question'] },
  'Build me something': { intent: 'build', actions: ['build:*'] },
  'Play his game': { ui: 'play' },
  'Tell me a story': { ui: 'story-next' },
  "What's he bad at?": { intent: 'weakness', actions: ['chips'] },
  'Why should we hire him?': { intent: 'hire', actions: ['chips'] },
  'How do I reach him?': { intent: 'contact', actions: ['become:glyph:envelope-open', 'contact'] },
  'Change it': { ui: 'change-build' },
  'Share it': { ui: 'share-build' },
  'Build another': { ui: 'say', say: 'Build me something' },
  'Another example': { ui: 'say', say: 'Build me something' },
  'Who made this agent?': { intent: 'this_site', actions: ['become:yoyo3d'] },
  'Next story': { ui: 'story-next' },
  'Next one': { ui: 'next-project' },
  'Play it': { ui: 'play' },
  'Build me something like this': { ui: 'build' },
  'sound on': { ui: 'sound-on' },
  'Tell me about Polybot': { intent: 'polybot', actions: ['become:glyph:diverge', 'show:polybot'] },
  'How fast is it?': { intent: 'fast', actions: ['show:yoyo-loop'] },
  'Tell me the 2021 story': { intent: 'story', actions: ['story:2021'] },
  'Tell me the road story': { intent: 'story', actions: ['story:road'] },
  'Tell me the last story': { intent: 'story', actions: ['story:this'] },
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

/** Runs the hint checks; returns rows {kind, input, want, got, ok}. */
export function evalHints() {
  const rows = [];
  for (const intent of A.FAQ_INTENTS) {
    for (const hint of intent.hints) {
      const owners = A.FAQ_INTENTS.filter((i) => i.hints.includes(hint)).map((i) => i.id);
      const egg = A.EXTRA_INTENTS.find((x) => x.match.test(hint));
      const c = A.classify(hint);
      const got = classKey(c);
      const want = egg ? `extra:${egg.id}` : owners.length > 1 ? owners.join('|') : intent.id;
      let ok = egg ? got === want : owners.includes(got);
      let detail = '';
      if (ok && !egg) {
        const reply = A.scriptedReply(hint, CTX).raw;
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
    const got = classKey(A.classify(text));
    const acts = actionsOf(replyFn(text));
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
    if (longest > A.TURN_MAX_WORDS) problems.push(`a turn of ${longest} words`);
    if (shown.includes('|')) problems.push('a | on screen');
    if (flat(shown) !== plain) problems.push('text changed');
    if (raw.includes(A.RESTING_LINE) && raw.trim() !== A.RESTING_LINE && !turns.includes(A.RESTING_LINE)) problems.push('resting line not its own turn');
    rows.push({ kind: `turns/${label}`, input, want: `≤ ${A.TURN_MAX_WORDS} words a turn`, got: problems.join(', ') || `${turns.length} turns, longest ${longest}`, ok: !problems.length });
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
    ...evalChips((t) => A.scriptedReply(t, CTX).raw, 'scripted'),
    ...evalChips((t) => mockReply(t, {}, []), 'mock'),
    ...evalTurns(scriptedReplies(), 'scripted'),
    ...evalTurns(
      A.FAQ_INTENTS.flatMap((i) => i.hints).map((h) => [h, mockReply(h, {}, [])]),
      'mock',
    ),
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
      fails.length ? `${fails.length} FAILED` : 'all passed',
    ].join('\n'),
  );
  return fails.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const failed = await runEval({ quiet: process.argv.includes('--quiet') });
  process.exit(failed ? 1 : 0);
}
