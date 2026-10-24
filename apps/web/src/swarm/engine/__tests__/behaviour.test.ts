import { describe, expect, it } from 'vitest';
import { Controller, freeStage, type Rect } from '../backend/controller';
import { CpuEngine, dotScale } from '../backend/cpu';
import { Scheduler } from '../backend/scheduler';
import { keepOutForce } from '../backend/params';

const W = 1440, H = 900;
// the site's desktop stage and keep-outs (top bar, conversation block, chips + command bar)
const STAGE: Rect = { x: W * 0.6, y: 72, w: W - W * 0.6 - 40, h: H - 72 - 200 };

function rig(n: number) {
  const sched = new Scheduler();
  const engine = new CpuEngine({ canvas: {} as HTMLCanvasElement, count: n, bloom: false, dprCap: 1, scene: 'dark' });
  const ctrl = new Controller(n, { upload: (a, b) => engine.setTargets(a, b) }, sched);
  ctrl.setViewport(W, H);
  const st = ctrl.spawn('scatter');
  engine.setState(st.pos, st.vel);
  const ab = ctrl.targets; engine.setTargets(ab[0], ab[1]);
  const inner = engine as unknown as { pos: Float32Array; vel: Float32Array };
  const step = (sec: number, each?: () => void): void => {
    for (let i = 0; i < Math.round(sec * 60); i++) { sched.advance(1 / 60); engine.frame(ctrl.update(1 / 60), false); each?.(); }
  };
  /** share of particles whose screen position lies inside r */
  const inside = (r: Rect): number => {
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = inner.pos[i * 4]! + W / 2, y = H / 2 - inner.pos[i * 4 + 1]!;
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) k++;
    }
    return k / n;
  };
  const meanW = (): number => { let s = 0; for (let i = 0; i < n; i++) s += inner.vel[i * 4 + 3]!; return s / n; };
  return { sched, engine, ctrl, step, inside, meanW };
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('keep-out rects (POLISH1 B3)', () => {
  it('the force pushes out of a rect and turns inward velocity around', () => {
    const f: [number, number] = [0, 0];
    keepOutForce(110, 0, -200, 0, 0, 0, 100, 50, 48, f); // just right of the box, flying into it
    expect(f[0]).toBeGreaterThan(0);
    keepOutForce(300, 0, -200, 0, 0, 0, 100, 50, 48, f); // far away: nothing
    expect(f).toEqual([0, 0]);
    keepOutForce(0, 40, 0, 0, 0, 0, 100, 50, 48, f, 0, 400); // inside, home above: leaves through the top (world y up)
    expect(f[1]).toBeGreaterThan(0);
    keepOutForce(0, 40, 0, 0, 0, 0, 100, 50, 48, f, 0, -400); // inside near the top, but home is below: leaves downward
    expect(f[1]).toBeLessThan(0);
  });

  it('the stage minus keep-outs keeps the biggest free side', () => {
    expect(freeStage({ x: 0, y: 0, w: 400, h: 600 }, [{ x: 0, y: 0, w: 400, h: 100 }], 0)).toEqual({ x: 0, y: 100, w: 400, h: 500 });
    expect(freeStage({ x: 0, y: 0, w: 400, h: 600 }, [{ x: 500, y: 0, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 400, h: 600 });
  });

  it('keeps the idle CPU flock out of a rect where it would otherwise fly', () => {
    // the reply block on the left: the free-range flock (POLISH2 B1) flies there unless it is a keep-out
    const ko: Rect = { x: 40, y: 250, w: 640, h: 260 };
    const free = rig(3000);
    free.ctrl.setStage(STAGE);
    free.step(5);
    let without = 0;
    free.step(3, () => { without += free.inside(ko); });
    const guarded = rig(3000);
    guarded.ctrl.setStage(STAGE, [ko]);
    guarded.step(5);
    let worst = 0, sum = 0, frames = 0;
    guarded.step(3, () => { const f = guarded.inside(ko); worst = Math.max(worst, f); sum += f; frames++; });
    expect(without / frames).toBeGreaterThan(0.05); // without the keep-out the flock flies there
    expect(sum / frames).toBeLessThan(0.005);
    expect(worst).toBeLessThan(0.02);
  });
});

describe('shape → shape morph (POLISH1 B4)', () => {
  const A: Rect = { x: 900, y: 150, w: 400, h: 300 };
  const B: Rect = { x: 950, y: 300, w: 300, h: 260 };

  it('retargets directly — thinking in between does not release, attraction never collapses', async () => {
    const r = rig(3000);
    r.ctrl.setStage(STAGE);
    r.step(1);
    r.ctrl.become({ kind: 'frame', rect: A }); await flush();
    r.step(1.6);
    expect(r.meanW()).toBeGreaterThan(0.95);
    // the app's turn: mood thinking while waiting for the reply, then the next shape
    r.ctrl.mood_('thinking');
    let lowest = 1;
    r.step(0.4, () => { lowest = Math.min(lowest, r.meanW()); });
    r.ctrl.become({ kind: 'frame', rect: B }); await flush();
    r.step(1.6, () => { lowest = Math.min(lowest, r.meanW()); expect(r.ctrl.p.goal).toBe(1); });
    expect(lowest).toBeGreaterThan(0.6);
    expect(r.meanW()).toBeGreaterThan(0.95);
  });

  it('release() does disperse (control)', async () => {
    const r = rig(3000);
    r.ctrl.become({ kind: 'frame', rect: A }); await flush();
    r.step(1.6);
    r.ctrl.release();
    r.step(0.6);
    expect(r.meanW()).toBeLessThan(0.1);
  });
});

describe('canvas2d dot scaling by count (POLISH1 B6)', () => {
  it('grows dots as the count drops, and is 1 at GPU-like counts', () => {
    expect(dotScale(40000)).toEqual({ size: 1, alpha: 1 });
    expect(dotScale(12000).size).toBe(1);
    const a = dotScale(8000), b = dotScale(3000), c = dotScale(2000);
    expect(a.size).toBeGreaterThan(1);
    expect(b.size).toBeGreaterThan(a.size);
    expect(b.size).toBeCloseTo(2, 5);
    expect(c.size).toBeLessThanOrEqual(2.2);
    expect(b.alpha).toBeGreaterThan(1);
  });
});
