// Chips never go backwards (WAVE4 U5). Every question the visitor asks this session (typed or a chip)
// is remembered by what it means (the scripted classifier's intent, so "tell me about yourself"
// answers "Who are you?" too). A chip whose meaning was already answered gives its place to the next
// unanswered one from PRIORITY; "What have you built?" may always stay. Contact (U6) never offers
// "How do I reach you?" while it is open.
import { classify } from '../agent/client/intents';

/** The order replacements are taken in. */
export const PRIORITY = [
  'What have you built?',
  'Why should we hire you?',
  'What are you like?',
  'What do you do for fun?',
  'What are you bad at?',
  'And crypto?',
  'How do I reach you?',
  'Play the game',
  'Spell my name',
] as const;

/** May stay up however often it was answered. */
const ALWAYS = new Set(['what have you built']);
const REACH = 'how do i reach you';

const norm = (s: string) => s.trim().toLowerCase().replace(/[?.!…]+$/, '');

/** Moves, not questions: they never count as answered, whatever the classifier makes of their words. */
const MOVES = new Set(['copy my email', 'email copied', 'next one', 'build me something', 'build another', 'share it', 'close', 'play it', 'show me those']);

const keys = new Map<string, string | null>();
/** What a question means (`i:who`, `c:play-it`, `spell-my-name`), or null for a move with no answer of its own. */
export function meaningOf(text: string): string | null {
  const n = norm(text);
  if (!n || MOVES.has(n)) return null;
  if (keys.has(n)) return keys.get(n)!;
  const c = classify(text);
  const k =
    c.kind === 'intent' ? `i:${c.id}` : c.kind === 'command' && c.id === 'play-it' ? 'c:play-it' : c.kind === 'spell-my-name' ? 'spell-my-name' : null;
  keys.set(n, k);
  return k;
}

/** Remember that `text` has been asked (and so answered) this session. Returns the new set. */
export function withAnswered(answered: readonly string[], text: string): string[] {
  const k = meaningOf(text);
  return k && !answered.includes(k) ? [...answered, k] : [...answered];
}

/**
 * The row with every answered chip replaced by the next unanswered one from PRIORITY (or dropped when
 * none is left). `contactOpen`: "How do I reach you?" never shows.
 */
export function moveChipsOn(chips: readonly string[], answered: readonly string[], opts: { contactOpen?: boolean } = {}): string[] {
  const done = new Set(answered);
  const stale = (c: string) => {
    const n = norm(c);
    if (opts.contactOpen && n === REACH) return true;
    if (ALWAYS.has(n)) return false;
    const k = meaningOf(c);
    return !!k && done.has(k);
  };
  const out: string[] = [];
  const has = (c: string) => out.some((x) => norm(x) === norm(c)) || chips.some((x) => norm(x) === norm(c) && !stale(x));
  for (const c of chips) {
    if (!stale(c)) {
      if (!out.some((x) => norm(x) === norm(c))) out.push(c);
      continue;
    }
    const next = PRIORITY.find((p) => !stale(p) && !has(p));
    if (next) out.push(next);
  }
  return out;
}
