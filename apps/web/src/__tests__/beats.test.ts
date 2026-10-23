import { describe, expect, it } from 'vitest';
import { lineCount, packBeats } from '../ui/beats';

// monospace stand-in: 10 px per character
const m = (t: string) => t.length * 10;
const words = (s: string) => s.split(' ');

describe('beats', () => {
  it('wraps greedily', () => {
    expect(lineCount(words('aaa bbb ccc'), m, 70)).toBe(2);
  });
  it('keeps each beat within two lines', () => {
    const text = "Three reasons, no adjectives. He ships: 917 public commits in 2026, a real game, a published connector, a search engine.";
    for (const b of packBeats(words(text), m, 300)) expect(lineCount(words(b), m, 300)).toBeLessThanOrEqual(2);
  });
  it('is prefix-stable for completed beats', () => {
    const all = words("Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS and Entrepreneurship at Reichman. He doesn't write most of his code anymore — he directs the agents that do.");
    const full = packBeats(all, m, 260);
    for (let n = 1; n <= all.length; n++) {
      const part = packBeats(all.slice(0, n), m, 260);
      // every beat except the last two in the partial split is final
      part.slice(0, -2).forEach((b, i) => expect(b).toBe(full[i]));
    }
  });
  it('never leaves a sentence-final word alone', () => {
    const b = packBeats(words('They put me in personnel assignment. I appealed my medical profile to serve in combat.'), m, 200);
    expect(b.every((x) => x.split(' ').length > 1)).toBe(true);
  });
});
