/** Timeline helpers shared by the showcases. Pure functions of time, so any frame can be rendered exactly. */

/** Cubic-bezier easing (same maths as CSS), solved with Newton + bisection fallback. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - p;
      const d = dx(t);
      if (Math.abs(err) < 1e-5) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = p;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - p) < 1e-5) break;
      if (v < p) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** Entrances: cubic-bezier(0.2, 0.8, 0.2, 1). */
export const out = bezier(0.2, 0.8, 0.2, 1);
/** Symmetric moves (re-ranks, camera-ish pans). */
export const inOut = bezier(0.65, 0, 0.35, 1);
/** Exits. */
export const accel = bezier(0.5, 0, 0.75, 0);

/** Damped spring that settles at 1 with a small overshoot — for taps, stamps, pops. */
export function spring(p: number, stiffness = 7.5, freq = 10.5): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.exp(-stiffness * p) * Math.cos(freq * p);
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

/** Linear progress of t through [a, b], clamped to 0..1. */
export const prog = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Eased entrance progress through [a, b]. */
export const enter = (t: number, a: number, b: number) => out(prog(t, a, b));

/** 1 while inside the window, fading in over `fi` and out over `fo` at the ends. */
export function windowed(t: number, a: number, b: number, fi = 0.3, fo = 0.3): number {
  if (t < a || t > b) return 0;
  return Math.min(out(prog(t, a, a + fi)), 1 - accel(prog(t, b - fo, b)));
}

/** How many characters of `text` are typed at time t, starting at `start`, `cps` characters per second. */
export function typed(text: string, t: number, start: number, cps: number): string {
  const chars = Array.from(text);
  const n = Math.floor(clamp((t - start) * cps, 0, chars.length));
  return chars.slice(0, n).join('');
}

/** Caret blink: on/off, 1.06 s period, always on while typing. */
export const caretOn = (t: number) => Math.floor(t / 0.53) % 2 === 0;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
