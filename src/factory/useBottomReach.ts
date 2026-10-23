import { useEffect } from 'react';
import { factoryStore } from './store';

/** How close to the end of the document counts as "at the bottom" (px). */
export const BOTTOM_SLACK = 80;

/** Measured facts about this visit, for /yoyo-diagnose. Never sent anywhere. */
export const session = {
  /** Deepest point the viewport's bottom edge reached, as a share of the page (0..1). */
  maxScrollDepth: 0,
};

export function isAtBottom(scrollY: number, innerHeight: number, documentHeight: number): boolean {
  return scrollY + innerHeight >= documentHeight - BOTTOM_SLACK;
}

/**
 * If the viewport has reached the end of the page, fast-forward and merge
 * everything still open, at once (no per-section choreography), and return
 * true. Every scroll check calls this first, so a flick to the bottom is never
 * mistaken for a series of slots scrolled past one by one (each of which would
 * grow the page and move the bottom away).
 */
export function fastForwardAtBottom(): boolean {
  const s = factoryStore.getState();
  if (s.skipped || s.meta.length === 0) return false;
  if (!isAtBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight)) return false;
  s.rushAll('scroll');
  return true;
}

/**
 * "Flick to the bottom" (POLISH_WAVE F): a visitor who reaches the end of the
 * page has scrolled past everything, so every open PR fast-forwards and merges
 * (including #8, whose slot can never rise above the screen) and the end card
 * opens. Also records scroll depth for /yoyo-diagnose. Only real scrolling
 * counts: nothing fires at load.
 */
export function useBottomReach() {
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const doc = document.documentElement;
      const height = doc.scrollHeight;
      const bottom = window.scrollY + window.innerHeight;
      if (height > 0) session.maxScrollDepth = Math.max(session.maxScrollDepth, Math.min(1, bottom / height));
      fastForwardAtBottom();
    };
    const onScroll = () => {
      // Checked in the scroll event itself, before any slot's own check runs in the next frame.
      fastForwardAtBottom();
      if (!frame) frame = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
