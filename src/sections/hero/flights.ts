// Agents emerging from the cloud: when a PR starts building, a few particles
// (copies; the ribbon keeps every commit) fly to the control room and fade.
// Drawn on one fixed canvas sized to the flights' bounding box, shown only
// while a flight is in the air (an idle full-viewport layer still costs a
// composite every frame).

export interface Point {
  x: number;
  y: number;
}

interface Flight {
  from: Point;
  ctrl: Point;
  to: Point;
  start: number;
}

export const FLIGHT_MS = 600;
/** Below this viewport width (px) no agents fly. */
export const FLIGHTS_MIN_WIDTH = 900;
const TRAIL = 9;
const TRAIL_STEP = 0.028;

/** Quadratic Bézier, eased in so the agent accelerates toward the control room. */
function at(f: Flight, t: number): Point {
  const e = t * t;
  const u = 1 - e;
  return {
    x: u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * f.to.x,
    y: u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * f.to.y,
  };
}

export class AgentFlights {
  private flights: Flight[] = [];
  private raf = 0;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** Viewport box the canvas covers, CSS px. */
  private box = { x: 0, y: 0, w: 0, h: 0 };
  /** Resolution cap, lowered with the cloud's on slow devices. */
  dprCap = 2;

  constructor(
    private canvas: HTMLCanvasElement,
    private colors: () => { dot: string; glow: number },
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Launch one agent per start point toward `to`, staggered by 70 ms. */
  launch(from: Point[], to: Point) {
    // On narrow screens the flights cross the text the reader is on: skip them.
    if (window.innerWidth < FLIGHTS_MIN_WIDTH) return;
    const now = performance.now();
    from.forEach((p, i) => {
      const dx = to.x - p.x;
      const dy = to.y - p.y;
      // Bow each path to alternating sides of the straight line.
      const side = (i % 2 ? 1 : -1) * (0.18 + 0.08 * i);
      this.flights.push({
        from: p,
        to: { x: to.x + (i - from.length / 2) * 6, y: to.y },
        ctrl: { x: p.x + dx * 0.5 - dy * side, y: p.y + dy * 0.5 + dx * side },
        start: now + i * 70,
      });
    });
    this.fit();
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.flights = [];
    this.hide();
  }

  private hide() {
    this.canvas.style.display = 'none';
    this.canvas.width = this.canvas.height = 0;
  }

  /** Cover every path in the air: a quadratic Bézier stays inside the box of its three points. */
  private fit() {
    this.dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    const pad = 12; // the glow halo's radius, plus a little
    const xs = this.flights.flatMap((f) => [f.from.x, f.ctrl.x, f.to.x]);
    const ys = this.flights.flatMap((f) => [f.from.y, f.ctrl.y, f.to.y]);
    const x = Math.max(0, Math.floor(Math.min(...xs) - pad));
    const y = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const w = Math.min(window.innerWidth, Math.ceil(Math.max(...xs) + pad)) - x;
    const h = Math.min(window.innerHeight, Math.ceil(Math.max(...ys) + pad)) - y;
    this.box = { x, y, w: Math.max(1, w), h: Math.max(1, h) };
    Object.assign(this.canvas.style, {
      display: 'block',
      left: `${x}px`,
      top: `${y}px`,
      width: `${this.box.w}px`,
      height: `${this.box.h}px`,
    });
    this.canvas.width = Math.round(this.box.w * this.dpr);
    this.canvas.height = Math.round(this.box.h * this.dpr);
  }

  private tick = (now: number) => {
    const { ctx, dpr } = this;
    const { dot, glow } = this.colors();
    const { box } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, -box.x * dpr, -box.y * dpr);
    ctx.fillStyle = dot;
    this.flights = this.flights.filter((f) => now - f.start < FLIGHT_MS + TRAIL * TRAIL_STEP * FLIGHT_MS);
    for (const f of this.flights) {
      const t = (now - f.start) / FLIGHT_MS;
      if (t < 0) continue;
      // Head plus a short trail of earlier positions, shrinking and fading.
      for (let k = 0; k < TRAIL; k++) {
        const tk = t - k * TRAIL_STEP;
        if (tk < 0 || tk > 1) continue;
        const p = at(f, tk);
        const fade = Math.min(1, (1 - tk) / 0.2); // fade out on arrival
        const a = (1 - k / TRAIL) * fade;
        const r = 2 * (1 - k / (TRAIL + 2));
        if (glow > 0.01) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.22 * glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.raf = this.flights.length ? requestAnimationFrame(this.tick) : 0;
    if (!this.raf) this.hide();
  };
}
