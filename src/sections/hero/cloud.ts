import type { Commit } from '../../data/stats';

// The commit cloud: every public commit is one particle. This file is the
// maths (where each commit settles, how it gets there) and a small Canvas 2D
// renderer. React glue lives in Component.tsx; agent flights in flights.ts.

/** The ribbon's time axis: Sep 2022 to the end of Oct 2026, linear, so gaps keep their real length. */
export const DOMAIN = { start: Date.UTC(2022, 8, 1), end: Date.UTC(2026, 9, 31) };
export const xOf = (ms: number) => (ms - DOMAIN.start) / (DOMAIN.end - DOMAIN.start);

/** Canvas inset (CSS px) so the glow never clips; the DOM year ticks use it too. */
export const PAD = 8;

/**
 * Bands, top to bottom (y in 0..1). 2022–2025 run as a narrow ribbon through
 * the middle; the 2026 agent-era repos fan out to fill the height. First match wins.
 */
const BANDS: { y: number; test: (repo: string) => boolean }[] = [
  { y: 0.1, test: (r) => r === 'prompt-racers' },
  { y: 0.29, test: (r) => ['yoyo-loop', 'factory-infra', 'finn-project-bootstrap'].includes(r) },
  { y: 0.53, test: (r) => r === 'unfiltered' },
  { y: 0.68, test: (r) => r === 'polybot' || r === 'availability-monitor' },
  { y: 0.8, test: (r) => r === 'briza' || r === 'loop-tryouts' },
  { y: 0.92, test: (r) => r === 'runi-connector' },
  { y: 0.44, test: (r) => ['vortex-application', 'code-mapper', 'football-bot', 'sentiment-analysis', 'orditax'].includes(r) },
  { y: 0.58, test: (r) => ['discord-PnL-bot-0xYoyo', 'vortex-bot', 'backtrack-test', 'cart-bunny', 'blaze-website'].includes(r) },
  { y: 0.62, test: (r) => r === 'personal-portfolio-0xYoyo' },
  { y: 0.47, test: (r) => /fcc/i.test(r) },
  { y: 0.4, test: (r) => /^(shopping-cart|where-is-waldo|mini-message|express-local|inventory|members-only|blog-api|yoyo-network)/.test(r) },
  { y: 0.51, test: () => true }, // the rest of the Odin Project basics, 2022–2023
];

/** FNV-1a plus a murmur3 finalizer, mapped to [0, 1): stable per-commit randomness, the same on every load. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Standard normal from two hashes (Box–Muller), truncated at ±2.2. */
const gauss = (a: number, b: number) =>
  Math.max(-2.2, Math.min(2.2, Math.sqrt(-2 * Math.log(1 - a)) * Math.cos(2 * Math.PI * b)));

export interface Particle {
  commit: Commit;
  /** settled position, 0..1 */
  tx: number;
  ty: number;
  /** scattered start, 0..1 */
  sx: number;
  sy: number;
  /** sideways bow of the flight path, and the breathing phase */
  bend: number;
  phase: number;
  /** current position in CSS px, written every frame (hover picks from it) */
  x: number;
  y: number;
}

export function layout(commits: readonly Commit[]): Particle[] {
  const size: Record<number, number> = {};
  const bandOf = commits.map((c) => BANDS.findIndex((b) => b.test(c.r)));
  for (const b of bandOf) size[b] = (size[b] ?? 0) + 1;
  return commits.map((c, i) => {
    const band = bandOf[i]!;
    // Spread grows with the band's commit count, so the busy repos read as walls.
    const sigma = Math.min(0.14, Math.max(0.025, 0.006 * Math.sqrt(size[band]!)));
    const k = c.s + c.r;
    const day = 86_400_000 / (DOMAIN.end - DOMAIN.start);
    return {
      commit: c,
      tx: xOf(Date.parse(c.d)) + (hash(k + 'x') - 0.5) * day,
      ty: Math.min(1, Math.max(0, BANDS[band]!.y + gauss(hash(k + 'a'), hash(k + 'b')) * sigma)),
      sx: hash(k + 'n') * 1.1 - 0.05,
      sy: hash(k + 'm'),
      bend: (hash(k + 'c') - 0.5) * 0.5,
      phase: hash(k + 'p') * Math.PI * 2,
      x: 0,
      y: 0,
    };
  });
}

/* ---------- Motion ---------- */

/** Coalesce: particles leave in date order over STAGGER ms, each flight lasts FLIGHT ms (~2 s total). */
export const STAGGER = 750;
export const FLIGHT = 1250;
/** Every particle has landed this many ms after the coalesce starts. */
export const SETTLED = STAGGER + FLIGHT;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0 = still scattered, 1 = settled, for a particle at date position tx, `t` ms after the start. */
export const settleAt = (t: number, tx: number) =>
  easeInOutCubic(Math.min(1, Math.max(0, (t - tx * STAGGER) / FLIGHT)));

/**
 * Where a particle is at settle `e` (0..1), in CSS px for a w×h box.
 * Path: a quadratic Bézier from its scattered start to its slot, bowed
 * sideways by `bend` so the cloud gathers rather than slides. Once settled it
 * breathes: a sub-pixel drift (amplitude `breath` px) on a slow per-particle phase.
 */
export function place(p: Particle, e: number, w: number, h: number, now: number, breath: number) {
  const iw = w - PAD * 2;
  const ih = h - PAD * 2;
  const sx = p.sx * iw;
  const sy = p.sy * ih;
  const tx = p.tx * iw;
  const ty = p.ty * ih;
  // Control point: the midpoint pushed along the path's normal.
  const cx = (sx + tx) / 2 - (ty - sy) * p.bend;
  const cy = (sy + ty) / 2 + (tx - sx) * p.bend;
  const u = 1 - e;
  // Scattered particles wander a few px while they wait; settled ones only breathe.
  const drift = breath * (e + u * 8);
  p.x = PAD + u * u * sx + 2 * u * e * cx + e * e * tx + Math.sin(now * 0.0009 + p.phase) * drift;
  p.y = PAD + u * u * sy + 2 * u * e * cy + e * e * ty + Math.cos(now * 0.0007 + p.phase * 1.3) * drift;
}

/* ---------- Rendering ---------- */

export interface Palette {
  /** particle color (any CSS color string) */
  dot: string;
  /** constant cobalt for the glow layer, so it never needs repainting as the lights change */
  halo: string;
  /** page foreground, for the hover ring */
  fg: string;
  /** 0..1: additive glow on the dark end, none on the light end */
  glow: number;
}

/** Alpha steps for particles in flight: one batched path fill per step, not one draw per particle. */
const STEPS = 6;
/** The glow layer ignites over the last stretch of the coalesce, as the wall lands. */
const IGNITE = 700;

function haloSprite(color: string, radius: number): HTMLCanvasElement {
  const r = Math.ceil(radius);
  const c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'transparent');
  g.globalAlpha = 0.34;
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

/**
 * Draws the particles into one canvas. Owns nothing but pixels: the caller
 * decides when to draw (see CommitCloud.tsx) and passes the clock.
 */
export class CloudRenderer {
  readonly particles: Particle[];
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  /** devicePixelRatio as the page reports it; `dpr` is this capped at `dprCap`. */
  private deviceDpr = 1;
  /** 2 normally; 1 once the coalesce proves too slow for this device (see CommitCloud.tsx). */
  private dprCap = 2;
  private radius = 1.4;
  private palette: Palette | null = null;
  /** The settled ribbon's glow, painted once per size; composited with one drawImage per frame. */
  private glowLayer: HTMLCanvasElement | null = null;
  private haloDot: HTMLCanvasElement | null = null;
  active = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    commits: readonly Commit[],
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.particles = layout(commits);
  }

  resize(w: number, h: number, dpr: number, radius: number) {
    this.w = w;
    this.h = h;
    this.deviceDpr = dpr;
    this.dpr = Math.min(this.dprCap, dpr);
    this.radius = radius;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.glowLayer = this.haloDot = null;
  }

  /** Lower (or raise) the resolution cap; re-allocates the backing store only if it changes. */
  setDprCap(cap: number) {
    if (cap === this.dprCap) return;
    this.dprCap = cap;
    if (Math.min(cap, this.deviceDpr) !== this.dpr) this.resize(this.w, this.h, this.deviceDpr, this.radius);
  }

  setPalette(p: Palette) {
    if (this.palette?.halo !== p.halo) this.glowLayer = this.haloDot = null;
    this.palette = p;
  }

  get size() {
    return { w: this.w, h: this.h };
  }

  private paintGlow(halo: string): HTMLCanvasElement {
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const g = layer.getContext('2d')!;
    const dot = (this.haloDot ??= haloSprite(halo, this.radius * 6 * this.dpr));
    const r = dot.width / 2;
    g.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      place(p, 1, this.w, this.h, 0, 0);
      g.drawImage(dot, p.x * this.dpr - r, p.y * this.dpr - r);
    }
    return layer;
  }

  /**
   * One frame. `t` is ms since the coalesce started (Infinity = settled),
   * `now` drives breathing, `breath` is its amplitude in px (0 = still),
   * `glowScale` (0..1) scales the glow on top of the palette's (0 skips its work entirely).
   */
  draw(t: number, now: number, breath: number, glowScale = 1) {
    const { ctx, w, h, dpr, palette } = this;
    if (!palette || w === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // The glow (dark end only), as one composite.
    const ignite = Math.min(1, Math.max(0, (t - (SETTLED - IGNITE)) / IGNITE));
    const glow = palette.glow * glowScale * ignite;
    if (glow > 0.01) {
      this.glowLayer ??= this.paintGlow(palette.halo);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow;
      ctx.drawImage(this.glowLayer, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Move every particle, bucketing by how settled it is (scattered = dimmer).
    const buckets: Particle[][] = Array.from({ length: STEPS }, () => []);
    for (const p of this.particles) {
      const e = settleAt(t, p.tx);
      place(p, e, w, h, now, breath);
      buckets[Math.round(e * (STEPS - 1))]!.push(p);
    }
    const r = this.radius * dpr;
    ctx.fillStyle = palette.dot;
    buckets.forEach((list, step) => {
      if (!list.length) return;
      ctx.globalAlpha = 0.45 + (0.5 * step) / (STEPS - 1);
      ctx.beginPath();
      for (const p of list) {
        ctx.moveTo(p.x * dpr + r, p.y * dpr);
        ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2);
      }
      ctx.fill();
    });

    // The hovered commit: brighter, larger, ringed.
    const a = this.particles[this.active];
    if (a) {
      const x = a.x * dpr;
      const y = a.y * dpr;
      if (palette.glow * glowScale > 0.01) {
        const dot = (this.haloDot ??= haloSprite(palette.halo, this.radius * 6 * dpr));
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = palette.glow * glowScale;
        for (let i = 0; i < 3; i++) ctx.drawImage(dot, x - dot.width / 2, y - dot.width / 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.fg;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(x, y, r * 2 + 4 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Index of the particle nearest (x, y) in CSS px within `within` px, or -1. */
  pick(x: number, y: number, within: number): number {
    let best = -1;
    let bestD = within * within;
    this.particles.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }
}
