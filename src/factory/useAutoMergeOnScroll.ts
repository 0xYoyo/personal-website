import { useEffect, type RefObject } from 'react';
import { factoryStore } from './store';
import { fastForwardAtBottom } from './useBottomReach';
import type { SectionId } from './types';

/** How far (as a fraction of the viewport height) a slot's top edge must rise above the top of the screen. */
export const PAST_LINE = 0.55;

/**
 * A slot has been scrolled past once its top edge is more than 55% of a
 * viewport height above the top of the screen, or it is entirely above it.
 * (Measured from the screen top rather than from 55% down the screen, so a
 * visitor can scroll to a slot and watch it build without it merging under them.)
 */
export function isScrolledPast(rect: { top: number; bottom: number }, viewportHeight: number): boolean {
  return rect.top < -viewportHeight * PAST_LINE || rect.bottom < 0;
}

/**
 * "Never block" (SPEC §4): when the visitor scrolls past an unmerged slot it
 * merges by itself, so nobody is ever stuck behind a button. Awaiting PRs merge
 * at once; queued or building ones fast-forward and merge within 400 ms (the
 * scheduler does the fast-forward when the store marks the PR as rushing).
 *
 * Only real scrolling triggers it: a slot that happens to sit high in a tall
 * viewport at load does not merge until the visitor actually scrolls.
 */
export function useAutoMergeOnScroll(id: SectionId, ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!isScrolledPast(rect, window.innerHeight)) return;
      // At the end of the page everything merges at once instead (useBottomReach).
      if (fastForwardAtBottom()) return;
      const s = factoryStore.getState();
      const st = s.sections[id]?.state;
      if (!st || st === 'merged' || s.skipped) return;
      // Entirely above the screen: nobody can watch it fold, so it lands at once (no pinned card).
      if (rect.bottom < 0) s.merge(id, 'scroll', 'instant');
      else if (st === 'awaiting-merge') s.merge(id, 'scroll');
      else s.rush(id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [id, ref, active]);
}
