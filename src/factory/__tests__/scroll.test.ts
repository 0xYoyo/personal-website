import { describe, expect, it } from 'vitest';
import { isScrolledPast } from '../useAutoMergeOnScroll';

describe('isScrolledPast', () => {
  const vh = 900;
  it('is false while the slot is on screen, even near the top', () => {
    expect(isScrolledPast({ top: 600, bottom: 1200 }, vh)).toBe(false);
    expect(isScrolledPast({ top: 20, bottom: 620 }, vh)).toBe(false);
    expect(isScrolledPast({ top: -400, bottom: 200 }, vh)).toBe(false);
  });
  it('is true once the top edge is 55% of a viewport above the screen', () => {
    expect(isScrolledPast({ top: -496, bottom: 600 }, vh)).toBe(true);
  });
  it('is true for a short slot that is entirely above the screen', () => {
    expect(isScrolledPast({ top: -330, bottom: -10 }, vh)).toBe(true);
  });
});
