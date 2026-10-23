// The stub's intent classifier: name / emoji / spell rules first, then keyword
// scoring over faq-stub intents. Returns the raw reply (tags included).
import { BECOME_TEXT_MAX, leadingEmoji } from '@yoyo/protocol';
import { EMOJI_BEATS, NOT_NAMES, STORY_KEYS, UNKNOWN_REPLY, intents } from './faq-stub';

export interface Classified {
  intent: string;
  raw: string;
  /** A name the visitor gave, to store */
  name?: string;
  /** The brain should treat the next message as a name */
  expectName?: boolean;
}

export interface ClassifyContext {
  name?: string | undefined;
  expectingName?: boolean;
  /** deterministic pick for emoji beats in tests */
  pick?: (n: number) => number;
}

const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}&'-]+/gu) ?? [];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NAME_RE = /^[\p{L}][\p{L}'-]{0,19}$/u;

export function scoreIntents(text: string): { id: string; score: number }[] {
  const toks = tokens(text);
  const set = new Set(toks);
  const padded = ` ${toks.join(' ')} `;
  return intents
    .map((it) => {
      let score = 0;
      for (const h of it.hints) {
        if (h.includes(' ')) {
          if (padded.includes(` ${h} `)) score += 2;
        } else if (set.has(h)) score += 1;
      }
      if (score > 0 && it.bonus) score += it.bonus;
      return { id: it.id, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function classify(input: string, ctx: ClassifyContext = {}): Classified {
  const text = input.trim();
  const pick = ctx.pick ?? ((n: number) => Math.floor(Math.random() * n));
  const lower = text.toLowerCase();

  // 1. Emoji (only, or leading)
  const emo = leadingEmoji(text);
  if (emo) return { intent: 'emoji', raw: `[[become:${emo}]] ${EMOJI_BEATS[pick(EMOJI_BEATS.length)]}` };

  // 2. A name the visitor gives
  const named =
    /\b(?:my name is|my name's|call me|name's)\s+([\p{L}][\p{L}'-]{0,19})/iu.exec(text) ??
    (tokens(text).length <= 4 ? /^(?:hi[,! ]+|hey[,! ]+|hello[,! ]+)?(?:i'?m|i am|it'?s)\s+([\p{L}][\p{L}'-]{0,19})[.!]?$/iu.exec(text) : null);
  if (named?.[1] && !NOT_NAMES.has(named[1].toLowerCase())) {
    const name = cap(named[1]);
    return { intent: 'name', raw: `nice to meet you, ${name}. [[become:${name}]]`, name };
  }
  if (ctx.expectingName && NAME_RE.test(text.split(/\s+/)[0] ?? '') && tokens(text).length <= 2) {
    const name = cap(text.split(/\s+/)[0]!);
    return { intent: 'name', raw: `nice to meet you, ${name}. [[become:${name}]]`, name };
  }

  // 3. "spell my name"
  if (/^spell my name\b/i.test(lower)) {
    return ctx.name
      ? { intent: 'spell', raw: `[[become:${ctx.name}]] done.` }
      : { intent: 'ask-name', raw: "type your name. I'll spell it.", expectName: true };
  }

  // 4. "spell X" / "write X" / "become X" / "show X" (short word)
  const spell = /^(?:spell|write|become|be|show)\s+(?:me\s+)?(?:a\s+|an\s+)?(.+)$/i.exec(text);
  if (spell?.[1]) {
    const arg = spell[1].replace(/[.!?]+$/, '').trim();
    const isShow = /^show/i.test(text);
    const oneWord = !/\s/.test(arg);
    if (arg && [...arg].length <= BECOME_TEXT_MAX && (!isShow || (oneWord && scoreIntents(text).length === 0))) {
      return { intent: 'spell', raw: `[[become:${arg}]] done.` };
    }
  }

  // 5. Help
  if (text === '?') return { intent: 'help', raw: intents.find((i) => i.id === 'help')!.reply };

  // 6. Keyword intents
  const ranked = scoreIntents(text);
  const best = ranked[0];
  if (best) {
    const it = intents.find((i) => i.id === best.id)!;
    if (it.id === 'story') {
      const key = STORY_KEYS.find(([re]) => re.test(lower));
      return { intent: 'story', raw: key ? `[[story:${key[1]}]]` : it.reply };
    }
    return { intent: it.id, raw: it.reply };
  }

  // 7. A single short word: become it
  if (/^[\p{L}\p{N}][\p{L}\p{N}'-]*$/u.test(text) && [...text].length <= BECOME_TEXT_MAX) {
    return { intent: 'word', raw: `[[become:${text}]] ${EMOJI_BEATS[pick(EMOJI_BEATS.length)]}` };
  }

  return { intent: 'unknown', raw: UNKNOWN_REPLY };
}
