// Auto-fit for the agent's words (POLISH1 A1). A reply is one block of large
// type that starts at the viewport's max size and steps down as the text
// grows, so the whole reply fits in ≤ 3 lines on desktop (≤ 4 on mobile),
// never below the floor. The fit reads the real DOM (`scrollHeight`), not a
// word count, and within one reply the size only ever goes down.

export interface TypeScale {
  /** starting (largest) size, px */
  max: number;
  /** floor, px: below this the block grows extra lines instead */
  min: number;
  maxLines: number;
}

/** Line height of the agent type (mirrors --t-agent-lh in tokens.css). */
export const AGENT_LH = 1.04;
/** Size of one fit step, px. */
export const FIT_STEP = 2;

export const isMobileWidth = (vw: number): boolean => vw <= 720;

/** The agent type scale for a viewport width: 72/60/55/47 px desktop, 35 px mobile. */
export function typeScale(vw: number): TypeScale {
  if (isMobileWidth(vw)) return { max: 35, min: 24, maxLines: 4 };
  const max = vw >= 1800 ? 72 : vw >= 1400 ? 60 : vw >= 1200 ? 55 : 47;
  return { max, min: 30, maxLines: 3 };
}

/** Does `el` hold its text within `maxLines` at `px`? (sets the size to measure it) */
export function fitsAt(el: HTMLElement, px: number, maxLines: number, lh = AGENT_LH): boolean {
  el.style.fontSize = `${px}px`;
  // half a line of slack absorbs sub-pixel rounding without admitting an extra line
  return el.scrollHeight <= px * lh * (maxLines + 0.5);
}

/**
 * Fit `el` starting from `from` px (the size the reply already has; the scale's
 * max for a new reply) and stepping down until it fits or hits the floor.
 * Never returns a size larger than `from`. Leaves `el.style.fontSize` set.
 */
export function fitFont(el: HTMLElement, from: number, scale: TypeScale, lh = AGENT_LH, step = FIT_STEP): number {
  let px = Math.max(scale.min, Math.min(from, scale.max));
  while (px > scale.min && !fitsAt(el, px, scale.maxLines, lh)) px = Math.max(scale.min, px - step);
  el.style.fontSize = `${px}px`;
  return px;
}

/**
 * A per-reply fitter: remembers the size for the current reply key so a growing
 * (streamed) reply only steps down, and starts over at the max for a new reply
 * or a new viewport width.
 */
export function createFitter() {
  let key = '';
  let vw = -1;
  let px = 0;
  return {
    fit(el: HTMLElement, replyKey: string, viewportW: number): number {
      const scale = typeScale(viewportW);
      if (replyKey !== key || viewportW !== vw) {
        key = replyKey;
        vw = viewportW;
        px = scale.max;
      }
      px = fitFont(el, px, scale);
      return px;
    },
    get size() {
      return px;
    },
  };
}

// ---- words ------------------------------------------------------------------

export interface Word {
  text: string;
  /** keep on one line (hyphenated words, "LeetCode-style", "Self-taught") */
  nowrap: boolean;
}

const HYPHENATED = /\p{L}[-‐‑]\p{L}/u;

/**
 * Splits a reply into display words. Hyphenated words are marked nowrap (the
 * renderer puts them in a `white-space: nowrap` span, keeping the font's own
 * hyphen glyph) so "Self-taught" and "LeetCode-style" never split; a lone dash
 * is glued to the word before it so a line never starts with "—".
 */
export function toWords(text: string): Word[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const out: Word[] = [];
  for (const w of raw) {
    if (/^[—–-]$/.test(w) && out.length) {
      const prev = out[out.length - 1]!;
      out[out.length - 1] = { text: `${prev.text}\u00a0${w}`, nowrap: true };
      continue;
    }
    out.push({ text: w, nowrap: HYPHENATED.test(w) });
  }
  return out;
}
