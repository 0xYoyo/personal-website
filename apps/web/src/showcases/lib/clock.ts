import { useEffect, useRef, useState, type RefObject } from 'react';

export interface ShowcaseProps {
  /** Render one static key frame, no motion. Also forced on by `prefers-reduced-motion: reduce`. */
  reducedMotion?: boolean;
  /** false pauses the loop where it is. Default true. The loop also pauses offscreen and in hidden tabs. */
  playing?: boolean;
  /** QA only: render exactly this time (seconds into the loop) and do not animate. */
  seek?: number;
}

function usePrefersReducedMotion(): boolean {
  const [rm, setRm] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setRm(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return rm;
}

/** True while the element intersects the viewport (true when IntersectionObserver is unavailable). */
export function useOnscreen(ref: RefObject<Element>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setOn(e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

function usePageVisible(): boolean {
  const [vis, setVis] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const on = () => setVis(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return vis;
}

export interface LoopState {
  /** Seconds into the loop, 0 ≤ t < duration. */
  t: number;
  /** True when rendering the static key frame. */
  still: boolean;
  /** True when the clock is advancing. */
  running: boolean;
}

/**
 * The loop clock. Time only advances while playing, onscreen and the tab is visible;
 * pausing keeps the current frame. Under reduced motion it returns `keyTime` forever.
 */
export function useLoop(
  ref: RefObject<Element>,
  duration: number,
  keyTime: number,
  { reducedMotion, playing = true, seek }: ShowcaseProps,
): LoopState {
  const prefersRm = usePrefersReducedMotion();
  const onscreen = useOnscreen(ref);
  const visible = usePageVisible();
  const still = !!reducedMotion || prefersRm;
  const running = !still && seek === undefined && playing && onscreen && visible;
  const [t, setT] = useState(0);
  const tRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = -1;
    const step = (now: number) => {
      if (last >= 0) {
        const dt = Math.min(0.1, (now - last) / 1000);
        tRef.current = (tRef.current + dt) % duration;
        setT(tRef.current);
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, duration]);

  if (seek !== undefined) return { t: ((seek % duration) + duration) % duration, still: false, running: false };
  if (still) return { t: keyTime, still: true, running: false };
  return { t, still: false, running };
}
