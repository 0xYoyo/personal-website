import { describe, expect, it } from 'vitest';
import { AGENT_LH, createFitter, fitFont, toWords, typeScale } from '../ui/fit';

/**
 * jsdom has no layout, so give the element a scrollHeight that behaves like
 * wrapped text: characters × 0.5 em per character over a fixed width, rounded
 * up to whole lines of `size × line-height`.
 */
function textBox(width: number) {
  const el = document.createElement('p');
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get() {
      const px = parseFloat(el.style.fontSize) || 16;
      const chars = (el.textContent ?? '').length;
      const perLine = Math.max(1, Math.floor(width / (px * 0.5)));
      return Math.max(1, Math.ceil(chars / perLine)) * px * AGENT_LH;
    },
  });
  return el;
}
const lines = (el: HTMLElement, width: number) => {
  const px = parseFloat(el.style.fontSize);
  return Math.ceil((el.textContent ?? '').length / Math.floor(width / (px * 0.5)));
};

describe('typeScale', () => {
  it('starts at 72/60/55/47 px by desktop width and 35 px on mobile', () => {
    expect(typeScale(1920)).toEqual({ max: 72, min: 30, maxLines: 3 });
    expect(typeScale(1440).max).toBe(60);
    expect(typeScale(1280).max).toBe(55);
    expect(typeScale(1024).max).toBe(47);
    expect(typeScale(390)).toEqual({ max: 35, min: 24, maxLines: 4 });
  });
});

describe('fitFont', () => {
  it('keeps the max size when the reply already fits', () => {
    const el = textBox(900);
    el.textContent = 'done.';
    expect(fitFont(el, 60, typeScale(1440))).toBe(60);
    expect(el.style.fontSize).toBe('60px');
  });

  it('steps down until the whole reply fits in 3 lines', () => {
    const el = textBox(900);
    el.textContent = "hey. I'm Yoyo's agent — the one he keeps around to answer what the CV can't. Ask me anything."; // 95 chars: 4 lines at 60 px
    const px = fitFont(el, 60, typeScale(1440));
    expect(px).toBeLessThan(60);
    expect(lines(el, 900)).toBeLessThanOrEqual(3);
    // and it is the largest 2-px step that fits
    el.style.fontSize = `${px + 2}px`;
    expect(lines(el, 900)).toBeGreaterThan(3);
  });

  it('never goes below the floor (the block grows lines instead)', () => {
    const el = textBox(300);
    el.textContent = 'x'.repeat(2000);
    expect(fitFont(el, 60, typeScale(1440))).toBe(30);
    const m = textBox(358);
    m.textContent = 'x'.repeat(2000);
    expect(fitFont(m, 35, typeScale(390))).toBe(24);
  });

  it('allows 4 lines on mobile', () => {
    const el = textBox(358);
    el.textContent = 'x'.repeat(80); // at 35 px: 20 chars a line → 4 lines
    expect(fitFont(el, 35, typeScale(390))).toBe(35);
  });
});

describe('createFitter', () => {
  it('only steps down while a reply streams, and starts over for the next reply', () => {
    const el = textBox(900);
    const f = createFitter();
    const words = "Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS and Entrepreneurship at Reichman. He doesn't write most of his code anymore.".split(' ');
    let last = Infinity;
    for (let i = 1; i <= words.length; i++) {
      el.textContent = words.slice(0, i).join(' ');
      const px = f.fit(el, 'a:1', 1440);
      expect(px).toBeLessThanOrEqual(last); // never grows mid-reply
      last = px;
    }
    expect(last).toBeLessThan(60);
    el.textContent = 'done.';
    expect(f.fit(el, 'a:1', 1440)).toBe(last); // same reply: stays put even if the text got shorter
    expect(f.fit(el, 'a:2', 1440)).toBe(60); // next reply: back to the max
  });

  it('re-fits from the max when the viewport width changes', () => {
    const el = textBox(358);
    el.textContent = 'short';
    const f = createFitter();
    expect(f.fit(el, 'a:1', 1440)).toBe(60);
    expect(f.fit(el, 'a:1', 390)).toBe(35);
  });
});

describe('toWords', () => {
  it('keeps hyphenated words on one line', () => {
    const w = toWords('Self-taught, LeetCode-style interviewing; second-year.');
    expect(w.filter((x) => x.nowrap).map((x) => x.text)).toEqual(['Self-taught,', 'LeetCode-style', 'second-year.']);
    expect(w.find((x) => x.text === 'interviewing;')?.nowrap).toBe(false);
  });

  it('glues a lone dash to the word before it so no line starts with one', () => {
    const w = toWords('anymore — he directs');
    expect(w.map((x) => x.text)).toEqual(['anymore\u00a0—', 'he', 'directs']);
    expect(w[0]!.nowrap).toBe(true);
  });

  it('never drops or reorders words', () => {
    const t = 'a b - c d-e f';
    expect(toWords(t).map((x) => x.text.replace('\u00a0', ' ')).join(' ')).toBe(t);
  });
});
