// The scripted brain: answers from faq.md when the live brain is unreachable,
// over quota, or slow. Replies carry the same inline actions as live replies and
// are streamed word by word with live-like timing.

import { EXTRA_INTENTS } from './extras';
import { EMOJI_BEATS, FAQ_INTENTS, FAQ_UNKNOWN } from './faq';
import { classify, type Classification } from './intents';
import { PROJECT_IDS, type ProjectId } from '@yoyo/protocol';

/** The one-time honesty line after a live failure (SPEC §7). */
export const RESTING_LINE = 'the live brain is resting — I still know everything.';

/**
 * Lines that are not in faq.md but are needed to close a path the chips open.
 * Kept here, clearly separated, so the planner can replace them.
 */
export const ADDED_LINES = {
  /** "Spell my name" chip before the visitor has told us a name. */
  askName: "[[become:question]] what's your name?",
  /** "Now a rocket" chip (persona.md example reply for 🚀). */
  rocket: '[[become:🚀]] [[mood:excited]] obviously.',
} as const;

export interface ScriptedContext {
  /** visitor name from memory, if any */
  name: string | null;
  /** last project card opened in this session (for "Next one") */
  lastShown: ProjectId | null;
  random: () => number;
}

export interface ScriptedReply {
  /** raw reply with inline tags, ready for the tag parser */
  raw: string;
  classification: Classification;
}

const reply = (id: string): string => FAQ_INTENTS.find((i) => i.id === id)?.reply ?? FAQ_UNKNOWN;

/** Visitor-supplied text inside a tag can't close the tag or add chips. */
const tagSafe = (s: string) => s.replace(/[[\]|]/g, '').trim();

export function scriptedReply(text: string, ctx: ScriptedContext): ScriptedReply {
  const c = classify(text);
  let raw = replyFor(c, ctx);
  // faq.md's build line hands off `[[build:example]]`; carry the visitor's own words instead,
  // so the example picked matches what they asked for (POLISH1 C1). Chip follow-ups
  // ("Another example") keep `example` and rotate.
  if (c.kind === 'intent' && c.id === 'build') {
    const ask = tagSafe(text).slice(0, 280);
    if (ask) raw = raw.replace('[[build:example]]', `[[build:${ask}]]`);
  }
  return { raw, classification: c };
}

export function replyFor(c: Classification, ctx: ScriptedContext): string {
  switch (c.kind) {
    case 'intent':
      if (c.id === 'story' && c.story) return `[[story:${c.story}]]`;
      return reply(c.id);
    case 'name': {
      const n = tagSafe(c.name);
      return `nice to meet you, ${n}. [[become:${n}]]`;
    }
    case 'emoji': {
      const beat = EMOJI_BEATS[Math.floor(ctx.random() * EMOJI_BEATS.length)] ?? 'done.';
      return `[[become:${tagSafe(c.emoji)}]] ${beat}`;
    }
    case 'spell':
      return `[[become:${tagSafe(c.text)}]] done.`;
    case 'spell-my-name':
      return ctx.name ? `[[become:${tagSafe(ctx.name)}]] done.` : ADDED_LINES.askName;
    case 'command':
      switch (c.id) {
        case 'play-it':
          return '[[play]]';
        case 'next-one': {
          const i = ctx.lastShown ? PROJECT_IDS.indexOf(ctx.lastShown) : -1;
          return `[[show:${PROJECT_IDS[(i + 1) % PROJECT_IDS.length]}]]`;
        }
        case 'rocket':
          return ADDED_LINES.rocket;
        case 'another-build':
          return reply('build');
      }
      return FAQ_UNKNOWN;
    case 'extra':
      return EXTRA_INTENTS.find((x) => x.id === c.id)?.reply ?? FAQ_UNKNOWN;
    case 'unknown':
      return FAQ_UNKNOWN;
  }
}

/** Puts the resting line after any leading tags so the body still moves first. */
export function withRestingLine(raw: string): string {
  const m = /^(\s*(?:\[\[[^\]]*\]\]\s*)*)/.exec(raw);
  const lead = m?.[1] ?? '';
  const rest = raw.slice(lead.length);
  return `${lead}${RESTING_LINE}${rest ? ` ${rest}` : ''}`;
}

/** Splits a raw reply into word-sized pieces (keeping the spaces) for streaming. */
export function wordPieces(raw: string): string[] {
  return raw.match(/\S+\s*|\s+/g) ?? [];
}
