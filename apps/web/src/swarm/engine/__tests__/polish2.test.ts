import { describe, expect, it } from 'vitest';
import { Controller, DIM_SHARE, type Rect } from '../backend/controller';
import { CpuEngine } from '../backend/cpu';
import { Scheduler } from '../backend/scheduler';
import { BOUND_INSET, curiousOf, steerGoal } from '../backend/params';
import { edgeMask, extrudeSamples, sampleMask, sampleMaskEdged, YOYO_FACES } from '../shapes';

const W = 1440, H = 900;
// the site's desktop layout: stage on the right, keep-outs = top bar, reply block, chips, command bar
const STAGE: Rect = { x: 864, y: 72, w: 536, h: 628 };
const TOP: Rect = { x: 0, y: 0, w: W, h: 56 };
const REPLY: Rect = { x: 40, y: 300, w: 600, h: 200 };
const CHIPS: Rect = { x: 400, y: 740, w: 640, h: 40 };
const BAR: Rect = { x: 360, y: 800, w: 720, h: 56 };
const KO = [TOP, REPLY, CHIPS, BAR];

function rig(n: number, W = 1440, H = 900) {
  const sched = new Scheduler();
  const engine = new CpuEngine({ canvas: {} as HTMLCanvasElement, count: n, bloom: false, dprCap: 1, scene: 'dark' });
  const ctrl = new Controller(n, { upload: (a, b) => engine.setTargets(a, b) }, sched);
  ctrl.setViewport(W, H);
  const st = ctrl.spawn('scatter');
  engine.setState(st.pos, st.vel);
  const ab = ctrl.targets; engine.setTargets(ab[0], ab[1]);
  const inner = engine as unknown as { pos: Float32Array; vel: Float32Array; seed: Float32Array };
  const step = (sec: number, each?: () => void): void => {
    for (let i = 0; i < Math.round(sec * 60); i++) { sched.advance(1 / 60); engine.frame(ctrl.update(1 / 60), false); each?.(); }
  };
  const xy = (i: number): [number, number] => [inner.pos[i * 4]! + W / 2, H / 2 - inner.pos[i * 4 + 1]!];
  const share = (f: (x: number, y: number, i: number) => boolean): number => {
    let k = 0;
    for (let i = 0; i < n; i++) { const [x, y] = xy(i); if (f(x, y, i)) k++; }
    return k / n;
  };
  const inside = (r: Rect): number => share((x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  const meanW = (): number => { let s = 0; for (let i = 0; i < n; i++) s += inner.vel[i * 4 + 3]!; return s / n; };
  return { sched, engine, ctrl, step, share, inside, meanW, xy, inner, W, H };
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('free range (POLISH2 B1)', () => {
  it('the idle flock roams the whole viewport outside the keep-outs, not a strip by the stage', () => {
    const r = rig(3000);
    r.ctrl.setStage(STAGE, KO);
    r.step(4);
    // the free band left of the stage (between the reply and the chips, and above the reply) gets visited
    const left: Rect = { x: 48, y: 56, w: STAGE.x - 48 - 60, h: H - 56 - 48 };
    let leftMax = 0, koSum = 0, koWorst = 0, edgeWorst = 0, frames = 0;
    r.step(16, () => {
      leftMax = Math.max(leftMax, r.inside(left));
      const k = r.share((x, y) => KO.some((q) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h));
      koSum += k; koWorst = Math.max(koWorst, k); frames++;
      // never cut off at the screen edge
      edgeWorst = Math.max(edgeWorst, r.share((x, y) => x < 8 || y < 8 || x > W - 8 || y > H - 8));
    });
    expect(leftMax).toBeGreaterThan(0.15);
    expect(koSum / frames).toBeLessThan(0.01);
    expect(koWorst).toBeLessThan(0.04);
    expect(edgeWorst).toBeLessThan(0.004);
    expect(r.ctrl.p.boundHw).toBeCloseTo(W / 2 - BOUND_INSET, 0);
  });

  it('steerGoal projects goals out of a keep-out and routes paths around it', () => {
    const kos = [0, 0, 100, 50]; // world px, centre + half size
    const out: [number, number] = [0, 0];
    steerGoal(-300, 0, 10, 5, kos, 1, 20, out); // goal inside → nearest face (top: 50 - 5 < 100 - 10)
    expect(out[1]).toBeGreaterThanOrEqual(70);
    steerGoal(-300, 10, 300, 0, kos, 1, 20, out); // straight through it → aim at its near corner, above
    expect(out[0]).toBeCloseTo(-120); expect(out[1]).toBeCloseTo(70);
    steerGoal(-110, 80, 300, 0, kos, 1, 20, out); // already above it → the far corner
    expect(out[0]).toBeCloseTo(120); expect(out[1]).toBeCloseTo(70);
    steerGoal(-300, 200, 300, 200, kos, 1, 20, out); // clear path → unchanged
    expect(out).toEqual([300, 200]);
  });
});

describe('cursor presence (POLISH2 B2)', () => {
  it('opens a hole around the cursor within a few frames, and a still cursor gathers a curious few', () => {
    const r = rig(3000);
    r.ctrl.setStage(STAGE, KO);
    r.step(5);
    // pick the densest 80 px cell of the flock
    const cells = new Map<string, number>();
    for (let i = 0; i < 3000; i++) { const [x, y] = r.xy(i); if (x > 700 && x < W - 60 && y > 80 && y < H - 120) { const k = `${Math.floor(x / 80)},${Math.floor(y / 80)}`; cells.set(k, (cells.get(k) ?? 0) + 1); } }
    const [cx, cy] = [...cells.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map((v) => (+v + 0.5) * 80) as [number, number];
    const near = (rad: number): number => r.share((x, y) => Math.hypot(x - cx, y - cy) < rad);
    const before = near(50);
    expect(before).toBeGreaterThan(0.004);
    r.ctrl.pointer(cx - 300, cy, 1500, 0);
    for (let k = 1; k <= 4; k++) { r.ctrl.pointer(cx - 300 + 75 * k, cy, 1500, 0); r.step(0.05); }
    r.step(0.2); // 0.2 s after the fast sweep arrives
    expect(near(50)).toBeLessThan(before * 0.35);
    // still: the curious particles (2.5 %) that were within reach drift in and orbit loosely
    const S = r.inner.seed;
    const cur: number[] = [];
    for (let i = 0; i < 3000; i++) if (curiousOf(S[i * 4]!, S[i * 4 + 2]!, r.ctrl.p.curiousFrac)) cur.push(i);
    expect(cur.length / 3000).toBeGreaterThan(0.015); expect(cur.length / 3000).toBeLessThan(0.035);
    const reach = cur.filter((i) => { const [x, y] = r.xy(i); return Math.hypot(x - cx, y - cy) < 300; });
    r.step(1.3); // still for 1.5 s in all
    expect(r.ctrl.p.curious).toBeGreaterThan(0.5);
    const orbiting = reach.filter((i) => { const [x, y] = r.xy(i); return Math.hypot(x - cx, y - cy) < 130; });
    expect(orbiting.length).toBeGreaterThan(reach.length * 0.4);
    // moving on releases them
    for (let k = 1; k <= 6; k++) { r.ctrl.pointer(cx + 60 * k, cy - 30 * k, 1200, -600); r.step(0.05); }
    expect(r.ctrl.p.curious).toBeLessThan(0.3);
  });

  it('a touch point is present for 2 s after the last touch, a mouse cursor stays', () => {
    const r = rig(400);
    r.ctrl.pointer(700, 400, 0, 0, true);
    r.step(1.5); expect(r.ctrl.p.pointerOn).toBe(1);
    r.step(1.0); expect(r.ctrl.p.pointerOn).toBe(0);
    r.ctrl.pointer(700, 400, 0, 0);
    r.step(6); expect(r.ctrl.p.pointerOn).toBe(1);
  });
});

describe('gather and the dim frame (POLISH2 B3)', () => {
  const CARD: Rect = { x: 260, y: 150, w: 920, h: 560 }; // a centred card / locked build frame
  const AROUND: Rect = { x: 24, y: 200, w: 1100, h: 420 }; // a card drawn around the reply block
  const THROUGH: Rect = { x: 370, y: 170, w: 800, h: 520 }; // the round-2 card: its left edge crosses the words

  it('gather(ms) brings the flock to the stage within ms without crossing the reply', async () => {
    const r = rig(3000);
    r.ctrl.setStage(STAGE, [TOP]);
    r.step(1);
    // a card that encloses the reply block (its left edge is left of the words)
    r.ctrl.buildFrame(AROUND, 1); await flush();
    r.step(1.6);
    // the overlay closes: the reply's keep-out comes back, then gather
    r.ctrl.setStage(STAGE, KO);
    let done = false;
    void r.ctrl.gather(700).then(() => { done = true; });
    let worst = 0;
    r.step(0.72, () => { worst = Math.max(worst, r.inside(REPLY)); });
    await flush();
    expect(done).toBe(true);
    const st: Rect = { x: STAGE.x - 60, y: STAGE.y - 60, w: STAGE.w + 120, h: STAGE.h + 120 };
    // most of it is there at `ms` (the far side of a card has ~1300 px to fly round the words), the rest just after
    expect(r.inside(st)).toBeGreaterThan(0.65);
    r.step(0.4, () => { worst = Math.max(worst, r.inside(REPLY)); });
    expect(r.inside(st)).toBeGreaterThan(0.8);
    expect(worst).toBeLessThan(0.005);
    expect(r.meanW()).toBeLessThan(0.05); // the frame is gone
  });

  it('a card edge that runs through the words: particles leave by the nearest face, nobody crosses the words', async () => {
    const r = rig(3000);
    r.ctrl.setStage(STAGE, [TOP]);
    r.step(1);
    r.ctrl.buildFrame(THROUGH, 1); await flush();
    r.step(1.6);
    const n0 = r.inside(REPLY);
    expect(n0).toBeGreaterThan(0.01); // the left edge starts on the words
    r.ctrl.setStage(STAGE, KO);
    void r.ctrl.gather(700);
    // track how far right anyone travels while inside the words
    const x0 = new Float32Array(3000).fill(NaN);
    let maxRun = 0, late = 0;
    r.step(0.8, () => {
      for (let i = 0; i < 3000; i++) {
        const [x, y] = r.xy(i);
        const inR = x > REPLY.x && x < REPLY.x + REPLY.w && y > REPLY.y && y < REPLY.y + REPLY.h;
        if (inR) { if (Number.isNaN(x0[i]!)) x0[i] = x; maxRun = Math.max(maxRun, x - x0[i]!); } else x0[i] = NaN;
      }
      if (r.ctrl.now > 0) late = r.inside(REPLY);
    });
    expect(maxRun).toBeLessThan(120);
    expect(late).toBeLessThan(0.002);
  });

  it('a dim locked frame keeps ~25 % of the particles on a low-brightness border and frees the rest', async () => {
    const r = rig(3000);
    // as the UI passes them with a build open: top bar, caption, the frame's inside (inset 14), controls, bar
    const CAP: Rect = { x: CARD.x, y: CARD.y - 60, w: CARD.w, h: 46 };
    r.ctrl.setStage(STAGE, [TOP, CAP, { x: CARD.x + 14, y: CARD.y + 14, w: CARD.w - 28, h: CARD.h - 28 }, BAR]);
    r.ctrl.buildFrame(CARD, 1); await flush();
    r.step(1.6);
    expect(r.meanW()).toBeGreaterThan(0.95);
    r.ctrl.buildFrame(CARD, 1, { dim: true });
    r.step(2.5);
    expect(r.meanW()).toBeGreaterThan(DIM_SHARE - 0.06);
    expect(r.meanW()).toBeLessThan(DIM_SHARE + 0.06);
    expect(r.ctrl.p.heldDim).toBeLessThan(0.7);
    expect(r.ctrl.p.frameGlow).toBeLessThan(0.1);
    // the freed particles idle outside the frame (it is a keep-out) and outside the words
    const innerRect: Rect = { x: CARD.x + 40, y: CARD.y + 40, w: CARD.w - 80, h: CARD.h - 80 };
    let worst = 0, cap = 0;
    r.step(2, () => { worst = Math.max(worst, r.inside(innerRect)); cap = Math.max(cap, r.inside(CAP)); });
    expect(worst).toBeLessThan(0.03);
    expect(cap).toBeLessThan(0.005);
    // undim: the full border comes back
    r.ctrl.buildFrame(CARD, 1);
    r.step(1.5);
    expect(r.meanW()).toBeGreaterThan(0.9);
  });
});

describe('a phone after an overlay closes (POLISH2 B1/B3, Owner A note 3)', () => {
  it('the card\'s side edges do not stay pinned at the screen edges: a full-width keep-out has no side exits', async () => {
    const r = rig(2000, 390, 844);
    const stage: Rect = { x: 16, y: 60, w: 358, h: 300 };
    const ko: Rect[] = [{ x: 0, y: 0, w: 390, h: 52 }, { x: 16, y: 380, w: 358, h: 260 }, { x: 0, y: 700, w: 390, h: 40 }, { x: 16, y: 760, w: 358, h: 64 }];
    r.ctrl.setStage(stage, [ko[0]!]);
    r.step(1);
    r.ctrl.buildFrame({ x: 16, y: 120, w: 358, h: 560 }, 1); await flush(); // a card the width of the screen
    r.step(1.6);
    r.ctrl.setStage(stage, ko);
    void r.ctrl.gather(800);
    r.step(1.2);
    // no way round a full-width reply: the far side of the card flies behind the words (not drawn there) to the stage
    expect(r.share((x, y) => y < 380)).toBeGreaterThan(0.8);
    expect(r.ctrl.p.tunnel).toBe(1); // still in the post-gather easing
    r.step(1.8);
    expect(r.ctrl.p.tunnel).toBe(0);
    const edges = r.share((x, y) => (x < 40 || x > 350) && y > 380 && y < 700);
    expect(edges).toBeLessThan(0.01);
    expect(r.share((x, y) => ko.some((q) => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h))).toBeLessThan(0.01);
  });
});

describe('2D-tier shapes (POLISH2 B5)', () => {
  function disc(w: number, h: number, rad: number): Uint8ClampedArray {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(y * w + x) * 4 + 3] = (x - w / 2) ** 2 + (y - h / 2) ** 2 < rad * rad ? 255 : 0;
    return a;
  }
  it('edge-weighted sampling puts ~40 % of the points on the outline', () => {
    const m = disc(200, 200, 70);
    const plain = sampleMask(m.subarray(3), 4, 200, 200, 3000, 4);
    const edged = sampleMaskEdged(m.subarray(3), 4, 200, 200, 3000, 4);
    const onEdge = (s: { x: Float32Array; y: Float32Array }): number => { let k = 0; for (let i = 0; i < 3000; i++) if (Math.hypot(s.x[i]! - 100, s.y[i]! - 100) > 66.5) k++; return k / 3000; };
    expect(edged.x.length).toBe(3000);
    expect(onEdge(plain)).toBeLessThan(0.15);
    expect(onEdge(edged)).toBeGreaterThan(0.4);
    const e = edgeMask(m.subarray(3), 4, 200, 200);
    expect(e[100 * 200 + 100]).toBe(0); // centre is not edge
    expect(e[100 * 200 + 31]).toBe(255); // left rim is
  });
  it('the hand-extruded YOYO has front / back faces and sides through the depth', () => {
    const face = { x: new Float32Array([1, 2, 3]), y: new Float32Array([1, 2, 3]), filled: 3 };
    const edge = { x: new Float32Array([5, 6]), y: new Float32Array([5, 6]), filled: 2 };
    const e = extrudeSamples(face, edge, 1000, 30);
    let front = 0, back = 0, mid = 0;
    for (let i = 0; i < 1000; i++) { if (e.z[i] === 30) front++; else if (e.z[i] === -30) back++; else if (Math.abs(e.z[i]!) < 30) mid++; }
    expect(front / 1000).toBeCloseTo(YOYO_FACES.front, 2);
    expect(back / 1000).toBeCloseTo(YOYO_FACES.back, 2);
    expect(mid + front + back).toBe(1000);
  });
});

describe('entry beats (Owner A note 4)', () => {
  it("'hold' fires when the letters have knitted, however long the targets take; every beat reaches the caller", async () => {
    const { playEntry } = await import('../entry');
    const sched = new Scheduler();
    let knitAt = -1;
    const fake = {
      mood: () => undefined, release: () => undefined, respawn: () => undefined,
      wait: (ms: number) => new Promise<void>((res) => { sched.after(ms / 1000, res); }),
      // a slow phone: the letters take 2.3 s to sample and knit
      knit: () => new Promise<boolean>((res) => { sched.after(2.3, () => { knitAt = sched.now; res(true); }); }),
    };
    const beats: [string, number][] = [];
    const run = playEntry(fake as never, { onBeat: (b) => beats.push([b, sched.now]) });
    for (let i = 0; i < 6 * 60; i++) { sched.advance(1 / 60); await flush(); }
    await run;
    expect(beats.map((b) => b[0])).toEqual(['pour', 'form', 'hold', 'release', 'done']);
    const hold = beats.find((b) => b[0] === 'hold')![1];
    expect(hold).toBeGreaterThanOrEqual(knitAt - 1e-9);
    expect(hold - beats.find((b) => b[0] === 'form')![1]).toBeGreaterThan(2.2);
  });

  it('Controller.become resolves once the knit is in (≈ spread + ramp after the targets)', async () => {
    const r = rig(500);
    let ok: boolean | null = null;
    void r.ctrl.become({ kind: 'frame', rect: { x: 600, y: 300, w: 300, h: 200 } }).then((v) => { ok = v; });
    await flush();
    r.step(0.8); await flush();
    expect(ok).toBe(null);
    r.step(0.3); await flush();
    expect(ok).toBe(true);
    expect(r.meanW()).toBeGreaterThan(0.9);
  });
});

describe('slow devices keep time (POSTFIX4 E1)', () => {
  it('at 4 fps the clock still runs in real time: a shape knits within ~1 s and the entry ends by ~4 s', async () => {
    const { clockStep, physStep } = await import('../tiers');
    const r = rig(2000, 390, 844);
    const frame = (ms: number): void => { const c = clockStep(ms); r.sched.advance(c); r.engine.frame(r.ctrl.update(c, physStep(c)), false); };
    let knitAt = -1;
    const t0 = r.sched.now;
    const rect = { x: 60, y: 200, w: 270, h: 160 };
    void r.ctrl.become({ kind: 'frame', rect }).then((ok) => { if (ok) knitAt = r.sched.now - t0; });
    for (let i = 0; i < 12; i++) { frame(250); await flush(); }
    expect(knitAt).toBeGreaterThan(0);
    expect(knitAt).toBeLessThanOrEqual(1.25 + 1e-6); // spread 0.6 + ramp 0.35, rounded up to a 250 ms frame
    expect(r.meanW()).toBeGreaterThan(0.9);
    // the whole entry: pour 1.2 s + knit ~1 s + hold 0.9 s + release 0.95 s, all on this clock → ~4 s of wall time
    const { playEntry } = await import('../entry');
    const fake = {
      mood: () => undefined, release: () => undefined, respawn: () => undefined,
      wait: (ms: number) => new Promise<void>((res) => { r.sched.after(ms / 1000, res); }),
      knit: () => r.ctrl.become({ kind: 'frame', rect: { x: 50, y: 210, w: 280, h: 150 } }),
    };
    let done = false, frames = 0;
    void playEntry(fake as never).then(() => { done = true; });
    while (!done && frames < 200) { frame(250); frames++; await flush(); }
    expect(frames * 0.25).toBeLessThanOrEqual(4.5);
    // and a hitch is not time skipped: one 3 s frame advances the clock half a second
    expect(clockStep(3000)).toBe(0.5);
    expect(physStep(clockStep(250))).toBeCloseTo(1 / 15, 9);
  });
});

describe('reduced motion keeps its still field off the words (FIX4 E4)', () => {
  it('the still dots are placed clear of the keep-outs, and move off new ones at once', () => {
    const r = rig(3000);
    r.ctrl.setReduced(true);
    r.ctrl.setStage(STAGE, KO);
    r.step(0.1);
    const onKo = (rects: Rect[]): number => r.share((x, y) => rects.some((k) => x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h));
    expect(onKo(KO)).toBe(0);
    // a reply lands: the field moves off it in a frame (no flight in reduced motion)
    const REPLY2: Rect = { x: 40, y: 120, w: 700, h: 420 };
    r.ctrl.setStage(STAGE, [TOP, REPLY2, CHIPS, BAR]);
    r.step(1 / 60);
    expect(onKo([TOP, REPLY2, CHIPS, BAR])).toBe(0);
    // a shape and back: the release goes back to a clear field too
    void r.ctrl.become({ kind: 'frame', rect: { x: 900, y: 200, w: 300, h: 200 } });
    r.step(0.3);
    r.ctrl.release();
    r.step(1 / 60);
    expect(onKo([TOP, REPLY2, CHIPS, BAR])).toBe(0);
    // and the field still fills the free viewport (not piled up somewhere)
    expect(r.share((x) => x > 900)).toBeGreaterThan(0.2);
  });
});
