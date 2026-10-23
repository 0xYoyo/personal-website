// Intent classifier for the scripted brain: keyword + phrase scoring with a light
// fuzzy match over the hints in faq.md, plus the special rules faq.md describes
// (name capture, emoji, "spell X") and a few chip follow-ups.

import { FAQ_INTENTS, type FaqIntent } from './faq';
import { leadingEmoji } from './tags';
import type { StoryId } from '@yoyo/protocol';

export type Classification =
  | { kind: 'intent'; id: string; score: number; story?: StoryId }
  | { kind: 'name'; name: string }
  | { kind: 'emoji'; emoji: string }
  | { kind: 'spell'; text: string }
  | { kind: 'spell-my-name' }
  | { kind: 'command'; id: 'play-it' | 'next-one' | 'rocket' | 'another-build' }
  | { kind: 'unknown' };

/** Hints too common to carry much signal on their own. */
const GENERIC = new Set([
  'about', 'him', 'guy', 'why', 'when', 'where', 'want', 'you', 'tell me', 'start', 'done', 'made', 'work',
  'life', 'past', 'fun', 'cool', 'nice', 'call', 'number', 'rate', 'days', 'hours', 'location', 'create',
  'app', 'page', 'tool', 'website', 'begin', 'watch', 'options', 'reveal', 'instructions', 'future', 'bright',
]);

/** Words that follow "I'm" but are not names. */
const NOT_NAMES = new Set([
  'a', 'an', 'the', 'looking', 'interested', 'curious', 'here', 'from', 'just', 'not', 'hiring', 'recruiter',
  'fine', 'good', 'ok', 'okay', 'bored', 'back', 'new', 'sorry', 'trying', 'wondering', 'so', 'very', 'really',
  'also', 'still', 'going', 'at', 'with', 'in', 'on', 'working', 'building', 'impressed', 'confused', 'lost',
  'tired', 'great', 'well', 'cool', 'sure', 'done', 'ready', 'hungry', 'busy', 'happy', 'sad', 'your', 'his',
  'gonna', 'kinda', 'like', 'into', 'excited', 'amazed', 'thinking', 'checking', 'testing', 'only', 'always',
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFKC').replace(/[’`]/g, "'").match(/[\p{L}\p{N}&']+/gu) ?? [])
    .map((t) => t.replace(/'s$/, '').replace(/'/g, ''))
    .filter(Boolean);
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] ?? max + 1;
}

const fuzzyEq = (a: string, b: string): boolean => {
  if (a.length < 5 || b.length < 5 || a[0] !== b[0] || /\d/.test(a) || /\d/.test(b)) return false;
  const d = levenshtein(a, b, 2);
  return d <= (Math.min(a.length, b.length) >= 8 ? 2 : 1);
};

function containsSeq(tokens: string[], seq: string[]): boolean {
  outer: for (let i = 0; i + seq.length <= tokens.length; i++) {
    for (let j = 0; j < seq.length; j++) if (tokens[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

/** Score one intent against a tokenised message. */
export function scoreIntent(intent: FaqIntent, tokens: string[], raw: string): number {
  let score = 0;
  for (const hint of intent.hints) {
    const generic = GENERIC.has(hint);
    if (hint === '?') {
      if (raw.trim() === '?') score += 3;
      continue;
    }
    const ht = tokenize(hint);
    if (!ht.length) continue;
    if (ht.length > 1) {
      if (containsSeq(tokens, ht)) score += generic ? 1 : 1.5 * ht.length + 0.5;
      continue;
    }
    const h = ht[0]!;
    if (tokens.includes(h)) score += generic ? 1 : 2;
    else if (tokens.some((t) => fuzzyEq(t, h))) score += generic ? 0.5 : 1;
  }
  return score;
}

export function rankIntents(text: string, intents: readonly FaqIntent[] = FAQ_INTENTS): { id: string; score: number }[] {
  const tokens = tokenize(text);
  return intents
    .map((it, order) => ({ id: it.id, score: scoreIntent(it, tokens, text), n: it.hints.length, order }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.n - b.n || a.order - b.order)
    .map(({ id, score }) => ({ id, score }));
}

const STORY_KEYS: [StoryId, RegExp][] = [
  ['2021', /\b(2021|crypto|bitcoin|btc|ordinals)\b/],
  ['road', /\b(road|travel|travelling|traveling|trip|asia|2024|backpacking)\b/],
  ['appeal', /\b(appeal|army|idf|636|military|combat|unit)\b/],
  ['odin', /\b(odin|javascript|hand[- ]?written|self[- ]?taught)\b/],
  ['this', /\b(last|this site|this one|website)\b/],
];

const cap = (w: string) => (/^\p{Ll}/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w);
const graphemes = (s: string) => [...s].length;

/** Name capture: "I'm Dana", "my name is Dana", "call me Dana" (also "hi, I'm Dana Levi"). */
export function captureName(text: string): string | null {
  const t = text.trim();
  const re = /^(?:(?:hi|hey|hello|yo|shalom)[\s,!.]+)?(?:i'?m|i am|my name is|my name's|call me|name's)\s+([\p{L}][\p{L}\p{M}'’-]*)(?:\s+([\p{L}][\p{L}\p{M}'’-]*))?(.*)$/iu;
  const m = re.exec(t.replace(/’/g, "'"));
  if (!m?.[1]) return null;
  const first = m[1];
  const second = m[2];
  const rest = (m[3] ?? '').trim();
  if (NOT_NAMES.has(first.toLowerCase())) return null;
  const whole = !rest || /^[.!,]*$/.test(rest);
  const capitalised = (w: string) => /^\p{Lu}/u.test(w) || !/^\p{Script=Latin}/u.test(w);
  // Longer sentence ("I'm Dana, I hire for…"): accept only a capitalised (or non-Latin) name followed by punctuation.
  if (!whole && (!capitalised(first) || !/^[,.!;]/.test(rest))) return null;
  const useSecond = !!second && !NOT_NAMES.has(second.toLowerCase()) && (whole || capitalised(second));
  const name = [cap(first), useSecond ? cap(second) : ''].filter(Boolean).join(' ');
  return graphemes(name) <= 24 ? name : cap(first);
}

const norm = (s: string) => tokenize(s).join(' ');

export function classify(text: string): Classification {
  const raw = text.trim();
  if (!raw || raw === '?') return { kind: 'intent', id: 'help', score: 3 };

  const emoji = leadingEmoji(raw);
  if (emoji) return { kind: 'emoji', emoji };

  const name = captureName(raw);
  if (name) return { kind: 'name', name };

  const n = norm(raw);
  if (/^(play it|play now|lets play|play the game)$/.test(n)) return { kind: 'command', id: 'play-it' };
  if (/^(next|next one|next project|another one|show me another)$/.test(n)) return { kind: 'command', id: 'next-one' };
  if (/^(now )?a rocket$|^rocket$/.test(n)) return { kind: 'command', id: 'rocket' };
  if (/^(who|what) are you$|^are you (an? )?(ai|bot|agent|real)$/.test(n)) return { kind: 'intent', id: 'this_site', score: 3 };
  if (/^(another example|build another|change it|make another|another build|one more)$/.test(n)) return { kind: 'command', id: 'another-build' };

  const spell = /^(?:please\s+)?(spell|write|show|become)\s+(.+?)[.!]*$/i.exec(raw);
  if (spell?.[2]) {
    const verb = spell[1]!.toLowerCase();
    const arg = spell[2].replace(/^["'“‘]|["'”’]$/g, '').trim();
    if (/^my name$/i.test(arg)) return { kind: 'spell-my-name' };
    const e = leadingEmoji(arg);
    if (e) return { kind: 'emoji', emoji: e };
    const words = arg.split(/\s+/);
    const looksLikeRequest = /^(me|us|you|his|him|the|some|all|what|how|a|an)$/i.test(words[0] ?? '');
    const fits = graphemes(arg) <= 24 && words.length <= 3;
    if (fits && !(verb !== 'spell' && verb !== 'write' && looksLikeRequest)) {
      // "show unfiltered" / "show projects" are requests, not words to spell.
      const best = verb === 'show' || verb === 'become' ? rankIntents(arg)[0] : undefined;
      if (!best || best.score < 2) return { kind: 'spell', text: arg };
    }
  }

  const ranked = rankIntents(raw);
  const best = ranked[0];
  if (best && best.score >= 1) {
    if (best.id === 'story') {
      const story = STORY_KEYS.find(([, re]) => re.test(n))?.[0];
      return story ? { kind: 'intent', id: 'story', score: best.score, story } : { kind: 'intent', id: 'story', score: best.score };
    }
    return { kind: 'intent', id: best.id, score: best.score };
  }

  // A single unknown word (or a name typed on its own): become it, as the help line promises.
  const words = raw.split(/\s+/);
  if (words.length === 1 && graphemes(raw) <= 12 && /^[\p{L}\p{N}'’-]+$/u.test(raw)) {
    return { kind: 'spell', text: raw };
  }
  return { kind: 'unknown' };
}
