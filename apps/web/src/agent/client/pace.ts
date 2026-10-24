// Turn pacing (POLISH2 C1). Replies are shown as turns: short blocks split by `||` (faq.md, and the
// persona asks the live model to do the same). This makes sure of it, on the raw reply text (tags
// included), as it streams, ahead of the tag parser:
//   - a reply that runs past AUTO_PACE_WORDS words without a single `||` gets them at sentence
//     boundaries, packing sentences into turns of at most TURN_MAX_WORDS words;
//   - once a reply is paced (by the model or by this), a turn that still runs past TURN_MAX_WORDS is
//     split the same way;
//   - an unpaced reply of up to AUTO_PACE_WORDS words stays one turn.
// `[[…]]` tags are opaque: no boundary inside one, and they don't count as words. While it can't yet
// tell whether a reply needs pacing, it holds the text back — except tags at the head of what is
// pending, which pass at once so `[[become:…]]` still moves the body while the agent speaks. The UI
// shows a turn only once it is complete, so holding costs nothing visible.
//
// The Worker runs the same pacer (apps/worker/src/pace.ts — keep the two in step); here it is the
// client's safety net for a Worker or a mock that doesn't, and it paces the scripted copy.

/** Turn break marker in reply text (faq.md, persona.md). */
export const TURN_MARK = '||';
/** A turn should read in one glance at large type. */
export const TURN_MAX_WORDS = 22;
/** Unpaced replies longer than this get paced. */
export const AUTO_PACE_WORDS = 32;

export interface Pacer {
  push(chunk: string): string;
  end(): string;
}

const TAG = /\[\[[^\]]*(?:\]\]|$)/g;

/** Visible words (tags and turn marks excluded). */
export function countWords(s: string): number {
  return s
    .replace(TAG, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== TURN_MARK).length;
}

/** Tag spans in `s` (an unterminated tag at the end counts as one). */
const tagSpans = (s: string): [number, number][] => [...s.matchAll(TAG)].map((m) => [m.index, m.index + m[0].length]);
const inside = (spans: [number, number][], i: number) => spans.some(([a, b]) => i >= a && i < b);

/** `||` outside tags? */
const hasMark = (s: string) => s.replace(TAG, ' ').includes(TURN_MARK);

/** End offsets of the sentences in `s` (after the punctuation and closing quotes), outside tags, followed by whitespace. */
export function sentenceEnds(s: string): number[] {
  const spans = tagSpans(s);
  const ends: number[] = [];
  for (const m of s.matchAll(/[.!?…]+(["'”’)\]]*)(?=\s+(.?))/g)) {
    // `ask "what's due?" and get…`: a quote or bracket closing mid-sentence is not an end
    if (m[1] && /\p{Ll}/u.test(m[2] ?? '')) continue;
    if (!inside(spans, m.index)) ends.push(m.index + m[0].length);
  }
  return ends;
}

type Cut = { at: number; to: number; mark: boolean };

/** Sentence ends and `||` marks outside tags, in order. */
function cuts(s: string): Cut[] {
  const spans = tagSpans(s);
  const out: Cut[] = sentenceEnds(s).map((e) => ({ at: e, to: e, mark: false }));
  for (const m of s.matchAll(/\|\|/g)) if (!inside(spans, m.index)) out.push({ at: m.index, to: m.index + 2, mark: true });
  return out.sort((x, y) => x.at - y.at || Number(x.mark) - Number(y.mark));
}

/**
 * Splits one complete turn that runs past `maxWords` at its sentences, into as few turns as
 * possible, as even as possible ("A. B. C-long. D." → "A. B. || C-long. D.", not "A. B. C-long. || D.").
 */
export function balanceTurn(seg: string, maxWords = TURN_MAX_WORDS): string {
  if (countWords(seg) <= maxWords) return seg;
  const ends = sentenceEnds(seg);
  const pieces = [0, ...ends].map((e, i, all) => seg.slice(e, all[i + 1] ?? seg.length)).filter(Boolean);
  const w = pieces.map(countWords);
  // best[i]: fewest turns (then the smallest longest turn) for pieces[0..i)
  const best: { k: number; worst: number; from: number }[] = [{ k: 0, worst: 0, from: 0 }];
  for (let i = 1; i <= pieces.length; i++) {
    let pick: { k: number; worst: number; from: number } | null = null;
    let sum = 0;
    for (let j = i - 1; j >= 0; j--) {
      sum += w[j]!;
      if (sum > maxWords && i - j > 1) break;
      const c = { k: best[j]!.k + 1, worst: Math.max(best[j]!.worst, sum), from: j };
      if (!pick || c.k < pick.k || (c.k === pick.k && c.worst < pick.worst)) pick = c;
    }
    best.push(pick!);
  }
  const starts = new Set<number>();
  for (let i = pieces.length; i > 0; i = best[i]!.from) starts.add(best[i]!.from);
  return pieces.map((p, i) => (i > 0 && starts.has(i) ? p.replace(/^(\s*)/, `$1${TURN_MARK} `) : p)).join('');
}

const LEAD_TAGS = /^\s*(?:\[\[[^\]]*\]\]\s*)+/;

export function createPacer(opts: { maxWords?: number; threshold?: number } = {}): Pacer {
  const maxWords = opts.maxWords ?? TURN_MAX_WORDS;
  const threshold = opts.threshold ?? AUTO_PACE_WORDS;
  let buf = '';
  /**
   * hold: can't tell yet · greedy: unpaced and past the threshold, so sentences are packed as they
   * complete · marks: the reply is paced, so each turn is released when its mark arrives (and split
   * evenly if it runs long)
   */
  let mode: 'hold' | 'greedy' | 'marks' = 'hold';
  /** words in the open turn (greedy) */
  let cur = 0;

  /** greedy: one sentence; starts a new turn first when it wouldn't fit */
  const sentence = (s: string): string => {
    const w = countWords(s);
    if (!w) return s;
    if (cur > 0 && cur + w > maxWords) {
      cur = w;
      return s.replace(/^(\s*)/, `$1${TURN_MARK} `);
    }
    cur += w;
    return s;
  };

  /** releases the tags at the head of what is pending */
  const leadTags = (): string => {
    const lead = LEAD_TAGS.exec(buf)?.[0] ?? '';
    buf = buf.slice(lead.length);
    return lead;
  };

  const run = (final: boolean): string => {
    if (mode === 'hold') {
      if (hasMark(buf)) mode = 'marks';
      else if (countWords(buf) > threshold) mode = 'greedy';
      else if (final) {
        const out = buf;
        buf = '';
        return out;
      } else return leadTags();
    }
    let out = '';
    if (mode === 'greedy') {
      let start = 0;
      for (const c of cuts(buf)) {
        if (c.at < start) continue;
        out += sentence(buf.slice(start, c.at));
        start = c.at;
        if (c.mark) {
          // the model started pacing after all: from here on, turn by turn
          mode = 'marks';
          break;
        }
      }
      buf = buf.slice(start);
      if (mode === 'greedy') {
        if (!final) return out + leadTags();
        out += sentence(buf);
        buf = '';
        return out;
      }
    }
    // marks
    const spans = tagSpans(buf);
    let start = 0;
    for (const m of buf.matchAll(/\|\|/g)) {
      if (m.index < start || inside(spans, m.index)) continue;
      out += balanceTurn(buf.slice(start, m.index), maxWords) + TURN_MARK;
      start = m.index + 2;
    }
    buf = buf.slice(start);
    if (!final) return out + leadTags();
    out += balanceTurn(buf, maxWords);
    buf = '';
    return out;
  };

  return {
    push(chunk) {
      buf += chunk;
      return run(false);
    },
    end: () => run(true),
  };
}

/** Non-streaming: pace a complete reply. */
export function paceReply(raw: string, opts?: { maxWords?: number; threshold?: number }): string {
  const p = createPacer(opts);
  return p.push(raw) + p.end();
}
