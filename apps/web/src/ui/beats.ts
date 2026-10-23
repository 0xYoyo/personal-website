// Long agent replies are shown as successive ≤ 2-line "beats" (SPEC §5).
// Greedy and prefix-stable: the beats of a growing (streamed) text never
// change except the last one, so the display can advance while streaming.

export type Measure = (text: string) => number;

/** Greedy wrap: how many lines `words` occupy at `maxWidth`. */
export function lineCount(words: string[], measure: Measure, maxWidth: number): number {
  if (!words.length) return 0;
  const space = measure(' ');
  let lines = 1;
  let w = 0;
  for (const word of words) {
    const ww = measure(word);
    if (w === 0) w = ww;
    else if (w + space + ww <= maxWidth) w += space + ww;
    else {
      lines++;
      w = ww;
    }
  }
  return lines;
}

const ENDS_SENTENCE = /[.?!]["”')]?$/;
const ENDS_CLAUSE = /[.?!,;:—]["”')]?$|^—$/;

/**
 * Split words into beats of at most `maxLines` lines. Greedy (so a growing
 * text keeps its earlier beats), with two refinements: a new sentence starts
 * a new beat once the current one is more than half full, and an overflowing
 * beat backs up to its last clause break (comma, dash, full stop) when that
 * break is past the beat's middle.
 */
export function packBeats(words: string[], measure: Measure, maxWidth: number, maxLines = 2): string[] {
  const beats: string[][] = [];
  const capacity = maxWidth * maxLines;
  let cur: string[] = [];
  for (const word of words) {
    if (!cur.length) {
      cur.push(word);
      continue;
    }
    const prev = cur[cur.length - 1]!;
    if (ENDS_SENTENCE.test(prev) && measure(cur.join(' ')) / capacity > 0.5) {
      beats.push(cur);
      cur = [word];
      continue;
    }
    const withWord = [...cur, word];
    if (lineCount(withWord, measure, maxWidth) <= maxLines) {
      cur = withWord;
      continue;
    }
    // overflow: back up to the last clause break past the middle
    let j = -1;
    for (let k = cur.length - 1; k >= Math.ceil(cur.length * 0.25); k--) {
      if (ENDS_CLAUSE.test(cur[k]!)) {
        j = k;
        break;
      }
    }
    if (j >= 0 && j < cur.length - 1) {
      beats.push(cur.slice(0, j + 1));
      cur = [...cur.slice(j + 1), word];
    } else if (ENDS_SENTENCE.test(word) && cur.length > 3) {
      // never orphan a sentence's last word: carry a few words with it
      const carry = Math.min(3, Math.floor(cur.length / 3));
      beats.push(cur.slice(0, cur.length - carry));
      cur = [...cur.slice(cur.length - carry), word];
    } else {
      beats.push(cur);
      cur = [word];
    }
  }
  if (cur.length) beats.push(cur);
  return beats.map((b) => b.join(' '));
}

/** How long a finished beat holds before the next replaces it. Spec minimum 1.2 s; longer beats get reading time. */
export const beatHold = (beat: string): number => Math.max(1200, beat.split(/\s+/).length * 170);

/** A canvas-backed measurer for the agent font at a given size. */
export function canvasMeasure(fontPx: number, family: string, weight = 600, trackingEm = -0.025): Measure {
  const c = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (!c) return (t) => t.length * fontPx * 0.52;
  c.font = `${weight} ${fontPx}px ${family}`;
  const cache = new Map<string, number>();
  return (t) => {
    let v = cache.get(t);
    if (v === undefined) {
      v = c.measureText(t).width + [...t].length * fontPx * trackingEm;
      cache.set(t, v);
    }
    return v;
  };
}
