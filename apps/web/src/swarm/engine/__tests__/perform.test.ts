import { describe, expect, it } from 'vitest';
import type { Scene } from '@yoyo/protocol';
import {
  GROUP_FLOATS, GROUP_TEXELS, LITE_GROUPS, MAX_GROUPS, PoseHistory, T_LOOK, T_POSE, applyPose, evalKeys, evalPath, groupCounts, matchSlots,
  partition, poseToWorld, reassign, sceneFor, writeGroup,
} from '../perform';
import { Controller } from '../backend/controller';
import { CpuEngine } from '../backend/cpu';
import { Scheduler } from '../backend/scheduler';

const rect = (w: number, h: number) => ({ kind: 'rect' as const, w, h });

describe('groups: partition', () => {
  it('is stable: the same shares give the same partition, every time', () => {
    const a = partition(5000, [0.5, 0.3, 0.2]);
    const b = partition(5000, [0.5, 0.3, 0.2]);
    expect([...a]).toEqual([...b]);
  });
  it('follows the shares exactly and every group gets particles', () => {
    const g = partition(3000, [2, 1, 1, 1]);
    const c = [0, 0, 0, 0];
    for (const k of g) c[k]!++;
    expect(c).toEqual(groupCounts(3000, [2, 1, 1, 1]));
    expect(c.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(c[0]).toBe(1200);
  });
  it('a share change only moves the particles it has to (hash order is kept)', () => {
    const a = partition(4000, [0.5, 0.5]), b = partition(4000, [0.6, 0.4]);
    let moved = 0;
    for (let i = 0; i < 4000; i++) if (a[i] !== b[i]) moved++;
    expect(moved).toBe(400);
  });
});

describe('paths', () => {
  const path = [{ t: 0, x: -1, y: 0, scale: 1 }, { t: 1000, x: 1, y: 0.5, scale: 2, rot: 1, ease: 'linear' as const }];
  it('interpolates between keys with the segment ease and holds outside them', () => {
    expect(evalPath(path, -50)).toEqual({ x: -1, y: 0, rot: 0, scale: 1, sx: 1 });
    const mid = evalPath(path, 500);
    expect(mid.x).toBeCloseTo(0); expect(mid.y).toBeCloseTo(0.25); expect(mid.scale).toBeCloseTo(1.5); expect(mid.rot).toBeCloseTo(0.5);
    expect(evalPath(path, 5000).x).toBe(1);
    // inOut is slow at the ends and symmetric
    const io = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 1, y: 0 }];
    expect(evalPath(io, 10).x).toBeLessThan(0.1);
    expect(evalPath(io, 50).x).toBeCloseTo(0.5);
  });
  it('is continuous: no jump anywhere along a dense path', () => {
    const dense = Array.from({ length: 50 }, (_, k) => ({ t: k * 60, x: Math.sin(k * 0.2), y: Math.cos(k * 0.2), ease: 'linear' as const }));
    let prev = evalPath(dense, 0);
    for (let t = 1; t < 3000; t += 7) {
      const p = evalPath(dense, t);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(0.05);
      prev = p;
    }
  });
  it('keys: linear, held outside; a number is constant', () => {
    expect(evalKeys([{ t: 0, v: 0 }, { t: 100, v: 1 }], 25, 9)).toBeCloseTo(0.25);
    expect(evalKeys([{ t: 0, v: 0 }, { t: 100, v: 1 }], 400, 9)).toBe(1);
    expect(evalKeys(0.5, 1e6, 9)).toBe(0.5);
    expect(evalKeys(undefined, 0, 9)).toBe(9);
  });
  it('stage units → world: +y down the screen, rotation clockwise; a pose moves sampled points, it does not re-sample', () => {
    const w = poseToWorld({ x: 1, y: 1, rot: 0.3, scale: 2, sx: -1 }, 100, 50, 200, 100);
    expect(w).toEqual({ x: 300, y: -50, rot: -0.3, scale: 2, sx: -1 });
    const out = [0, 0, 0];
    applyPose(10, 0, 4, { x: 5, y: 6, rot: 0, scale: 2, sx: -1 }, out);
    expect(out).toEqual([-15, 6, 8]);
  });
  it('trail history: the pose a moment ago, interpolated', () => {
    const h = new PoseHistory();
    for (let k = 0; k <= 10; k++) h.push(k * 0.1, { x: k * 10, y: 0, rot: 0, scale: 1, sx: 1 });
    expect(h.at(0.55).x).toBeCloseTo(55);
    expect(h.at(-5).x).toBe(0);
    expect(h.at(9).x).toBe(100);
  });
});

describe('split / merge', () => {
  it('reassigns by nearness with exact capacities: a left and a right cluster go to the left and the right group', () => {
    const n = 400, prev = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { prev[i * 4] = i < 200 ? -300 + (i % 20) : 300 + (i % 20); prev[i * 4 + 1] = (i % 7) * 3; }
    const grp = (cx: number, m: number) => { const t = new Float32Array(m * 4); for (let j = 0; j < m; j++) { t[j * 4] = cx + (j % 10); t[j * 4 + 1] = j % 5; } return t; };
    const out = reassign(prev, n, [grp(320, 200), grp(-320, 200)], [200, 200]);
    for (let i = 0; i < n; i++) expect(out[i]).toBe(i < 200 ? 1 : 0);
  });
  it('a 1 → 4 split fills every group to its count, nearest first', () => {
    const n = 1000, prev = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { prev[i * 4] = ((i % 40) - 20) * 10; prev[i * 4 + 1] = (Math.floor(i / 40) - 12) * 10; }
    const q = (x: number, y: number) => { const t = new Float32Array(250 * 4); for (let j = 0; j < 250; j++) { t[j * 4] = x + (j % 16) * 4; t[j * 4 + 1] = y + Math.floor(j / 16) * 4; } return t; };
    const out = reassign(prev, n, [q(-150, 100), q(150, 100), q(-150, -100), q(150, -100)], [250, 250, 250, 250]);
    const c = [0, 0, 0, 0];
    let right = 0, rightTotal = 0;
    for (let i = 0; i < n; i++) { c[out[i]!]!++; if (prev[i * 4]! > 60) { rightTotal++; if (out[i] === 1 || out[i] === 3) right++; } }
    expect(c).toEqual([250, 250, 250, 250]);
    expect(right / rightTotal).toBeGreaterThan(0.95);
  });
  it('slots pair neighbours with neighbours (order along x is kept)', () => {
    const m = 100, prev = new Float32Array(m * 4), tg = new Float32Array(m * 4);
    for (let j = 0; j < m; j++) { prev[j * 4] = j; tg[j * 4] = 1000 - j * 2; }
    const who = Array.from({ length: m }, (_, j) => j);
    const s = matchSlots(who, prev, tg);
    expect(new Set(s).size).toBe(m);
    // the leftmost particles take the leftmost targets (the largest indices here), the rightmost the rightmost
    for (let j = 0; j < 10; j++) { expect(s[j]).toBeGreaterThanOrEqual(m - 10); expect(s[m - 1 - j]).toBeLessThan(10); }
  });
});

describe('tiers', () => {
  const big: Scene = { duration: 1000, groups: Array.from({ length: 8 }, () => ({ shape: rect(0.1, 0.1), share: 1, trail: 0.3 })) };
  it('canvas2d keeps at most 3 groups and no trails; the GPU tiers up to 6', () => {
    const lite = sceneFor(big, true);
    expect(lite.groups.length).toBe(LITE_GROUPS);
    expect(lite.groups.every((g) => !g.trail)).toBe(true);
    expect(sceneFor(big, false).groups.length).toBe(MAX_GROUPS);
  });
  it('canvas2d takes the scene\'s own lite version when it has one', () => {
    const s = sceneFor({ ...big, lite: { duration: 1000, groups: [{ shape: rect(0.5, 0.5), share: 1 }] } }, true);
    expect(s.groups.length).toBe(1);
  });
  it('the group data row layout', () => {
    const d = new Float32Array(GROUP_FLOATS);
    writeGroup(d, 2, { x: 1, y: 2, rot: 3, scale: 4, sx: -1 }, { x: 0, y: 0, rot: 0, scale: 1, sx: 1 }, 0.5, 0.25, 1, []);
    const r = 2 * GROUP_TEXELS * 4;
    expect([...d.subarray(r + T_POSE * 4, r + T_POSE * 4 + 4)]).toEqual([1, 2, 3, 4]);
    expect([...d.subarray(r + T_LOOK * 4, r + T_LOOK * 4 + 4)]).toEqual([-1, 0.5, 0.25, 1]);
  });
});

describe('the controller performs a scene (canvas2d simulator)', () => {
  function rig(n = 1200) {
    const sched = new Scheduler();
    const engine = new CpuEngine({ canvas: {} as HTMLCanvasElement, count: n, bloom: false, dprCap: 1, scene: 'dark' });
    const ctrl = new Controller(n, { upload: (a, b) => engine.setTargets(a, b), groups: (g) => engine.setGroups(g), groupData: (d) => engine.setGroupData(d) }, sched);
    ctrl.setViewport(1440, 900);
    ctrl.setLite(true);
    const st = ctrl.spawn('scatter');
    engine.setState(st.pos, st.vel);
    const ab = ctrl.targets; engine.setTargets(ab[0], ab[1]);
    const pos = (engine as unknown as { pos: Float32Array }).pos;
    const step = (sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) { sched.advance(1 / 60); engine.frame(ctrl.update(1 / 60), false); } };
    return { ctrl, step, pos, n };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('a moving group carries its particles along its path (the shape moves; it does not re-knit)', async () => {
    const { ctrl, step, pos, n } = rig();
    const scene: Scene = { duration: 3000, groups: [{ shape: rect(0.1, 0.1), share: 1, path: [{ t: 0, x: -0.5, y: 0 }, { t: 3000, x: 0.5, y: 0, ease: 'linear' }] }] };
    const done = ctrl.perform(scene);
    await flush();
    step(1.2);
    expect(await done).toBe(true);
    const mean = () => { let s = 0; for (let i = 0; i < n; i++) s += pos[i * 4]!; return s / n; };
    const pose = () => ctrl.groupPoses[0]!.x;
    step(0.3);
    expect(Math.abs(mean() - pose())).toBeLessThan(30);
    const x0 = mean();
    step(1);
    // no stage: ±1 = ±720 px, so the path runs 720 px in 3 s → 240 px in 1 s, tracked within a few px
    expect(mean() - x0).toBeGreaterThan(220);
    expect(mean() - x0).toBeLessThan(260);
    expect(Math.abs(mean() - pose())).toBeLessThan(30);
  });

  it('splits 1 → 3 and merges back, every particle in a group, sizes by share; leaving bakes the pose', async () => {
    const { ctrl, step } = rig();
    const three: Scene = { duration: 2000, groups: [-0.6, 0, 0.6].map((x) => ({ shape: rect(0.08, 0.08), share: 1, path: [{ t: 0, x, y: 0 }] })) };
    void ctrl.perform({ duration: 1000, groups: [{ shape: rect(0.3, 0.3), share: 1 }] });
    await flush(); step(1.2);
    void ctrl.perform(three);
    await flush(); step(1.2);
    const g = ctrl.groupOf!;
    const c = [0, 0, 0];
    for (const k of g) c[k]!++;
    expect(c).toEqual(groupCounts(1200, [1, 1, 1]));
    void ctrl.perform({ duration: 1000, groups: [{ shape: rect(0.3, 0.3), share: 1 }] });
    await flush(); step(0.1);
    expect(new Set(ctrl.groupOf!)).toEqual(new Set([0]));
    ctrl.release();
    expect(ctrl.groupOf).toBeNull();
  });

  it('a cursor that comes to rest over a held scene leaves no lasting hole (the shape closes again)', async () => {
    const { ctrl, step, pos, n } = rig(3000);
    void ctrl.perform({ duration: 9000, groups: [{ shape: rect(0.3, 0.3), share: 1 }] });
    await flush(); step(2);
    ctrl.pointer(720, 450, 0, 0); step(0.1); ctrl.pointer(730, 455, 200, 100); step(0.1);
    step(2.5);
    const B = ctrl.targets[1].pos, g = ctrl.groupPoses[0]!;
    let far = 0;
    for (let i = 0; i < n; i++) if (Math.hypot(pos[i * 4]! - (g.x + B[i * 4]! * g.scale), pos[i * 4 + 1]! - (g.y + B[i * 4 + 1]! * g.scale)) > 25) far++;
    expect(far).toBe(0);
  });
});

describe('FIX4 E2 / E5: phones and turning karts', () => {
  const kart = { kind: 'glyph' as const, id: 'kart' as const };
  it('at 2k a scene sheds its followers (same shape, smaller share); distinct groups stay', () => {
    const sc: Scene = { duration: 1000, groups: [{ shape: kart, share: 0.5 }, { shape: kart, share: 0.25 }, { shape: { kind: 'bar', w: 0.8, h: 0.5, oval: true, dashes: 24 }, share: 0.1 }] };
    expect(sceneFor(sc, true, 2000).groups.map((g) => g.share)).toEqual([0.5, 0.1]);
    expect(sceneFor(sc, true, 3000).groups.length).toBe(3);
    expect(sceneFor(sc, false, 12000).groups.length).toBe(3);
    // equal shares are a set (three windows), not followers
    const win: Scene = { duration: 1000, groups: [0, 1, 2].map(() => ({ shape: rect(0.2, 0.2), share: 1 })) };
    expect(sceneFor(win, true, 2000).groups.length).toBe(3);
  });

  it('an oval bar samples an ellipse outline, dashed when asked', async () => {
    const { ringPoints } = await import('../sceneShapes');
    const a = 150, b = 60, n = 600;
    const p = ringPoints(n, a, b, 6, 0, 3);
    for (let i = 0; i < n; i++) {
      const e = Math.hypot(p[i * 4]! / a, p[i * 4 + 1]! / b);
      expect(Math.abs(e - 1)).toBeLessThan(4 / b + 1e-6);
    }
    // dashed: 20 dashes → the angle histogram has empty gaps; solid: none
    const gaps = (q: Float32Array): number => {
      const bins = new Array(200).fill(0);
      for (let i = 0; i < n; i++) bins[Math.floor(((Math.atan2(q[i * 4 + 1]! / b, q[i * 4]! / a) / (2 * Math.PI)) + 1) % 1 * 200)]++;
      return bins.filter((c) => c === 0).length;
    };
    expect(gaps(p)).toBeLessThan(10);
    expect(gaps(ringPoints(n, a, b, 6, 20, 3))).toBeGreaterThan(60);
  });

  it('a group whose path turns it round never squashes through sx = 0: it swaps to the mirrored sampling under a ~120 ms dip', async () => {
    const n = 1200;
    const sched = new Scheduler();
    const engine = new CpuEngine({ canvas: {} as HTMLCanvasElement, count: n, bloom: false, dprCap: 1, scene: 'dark' });
    let data = new Float32Array(GROUP_FLOATS);
    const ctrl = new Controller(n, { upload: (a, b) => engine.setTargets(a, b), groups: (g) => engine.setGroups(g), groupData: (d) => { data = d; engine.setGroupData(d); } }, sched);
    ctrl.setViewport(1440, 900); ctrl.setLite(true);
    const st = ctrl.spawn('scatter'); engine.setState(st.pos, st.vel);
    // an "L": a tall bar on the left and a foot to the right — asymmetric, so a mirror is visible
    const L = { kind: 'parts' as const, parts: [{ shape: rect(0.04, 0.3), share: 0.6, x: -0.08 }, { shape: rect(0.16, 0.04), share: 0.4, y: 0.13 }] };
    const path = [{ t: 0, x: 0, y: 0, sx: 1 }, { t: 1000, x: 0, y: 0, sx: 1 }, { t: 1100, x: 0, y: 0, sx: -1, ease: 'linear' as const }, { t: 3000, x: 0, y: 0, sx: -1 }];
    void ctrl.perform({ duration: 3000, groups: [{ shape: L, share: 1, path }] });
    await new Promise((r) => setTimeout(r, 0));
    const world = (): Float32Array => {
      const B = ctrl.targets[1].pos, g = ctrl.groupPoses[0]!, out = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) applyPose(B[i * 4]!, B[i * 4 + 1]!, 0, g, out, i * 4);
      return out;
    };
    const sxs: number[] = [], bright: [number, number][] = [];
    let before: Float32Array | null = null, after: Float32Array | null = null;
    for (let f = 0; f < 120; f++) {
      sched.advance(1 / 60); engine.frame(ctrl.update(1 / 60), false);
      const t = f / 60 + 1 / 60;
      sxs.push(ctrl.groupPoses[0]!.sx);
      bright.push([t, data[T_LOOK * 4 + 1]!]);
      if (Math.abs(t - 0.95) < 1e-3) before = world();
      if (Math.abs(t - 1.25) < 1e-3) after = world();
    }
    expect(new Set(sxs.map((v) => Math.round(v)))).toEqual(new Set([1, -1]));
    for (const v of sxs) expect(Math.abs(v)).toBe(1);
    const at = (t: number): number => bright.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a))[1];
    expect(at(0.9)).toBe(1);
    expect(Math.min(...bright.filter(([t]) => t > 1.0 && t < 1.12).map((b) => b[1]))).toBeLessThan(0.45);
    expect(at(1.3)).toBe(1);
    // the dip is short: ≤ ~120 ms of frames under full brightness
    expect(bright.filter((b) => b[1] < 0.999).length).toBeLessThanOrEqual(9);
    // mirrored (world x about the group's centre, 0): the bar was left of centre, now right; and each particle moved
    // far less than a full mirror would have carried it
    const meanX = (w: Float32Array): number => { let s = 0; for (let i = 0; i < n; i++) s += w[i * 4]!; return s / n; };
    expect(meanX(before!)).toBeLessThan(-10);
    expect(meanX(after!)).toBeCloseTo(-meanX(before!), 0);
    let move = 0, mirror = 0;
    for (let i = 0; i < n; i++) { move += Math.abs(after![i * 4]! - before![i * 4]!); mirror += Math.abs(2 * before![i * 4]!); }
    expect(move / n).toBeLessThan(0.8 * (mirror / n)); // an L is far from symmetric; a kart (wheels, body) moves much less
  });
});

describe('FIX4 E2: the cursor scene on a phone', () => {
  it('a tap off the stage (a chip, "watch again") is not chased; a moving pointer is, but only within the stage', async () => {
    const n = 800, sched = new Scheduler();
    const engine = new CpuEngine({ canvas: {} as HTMLCanvasElement, count: n, bloom: false, dprCap: 1, scene: 'dark' });
    const ctrl = new Controller(n, { upload: (a, b) => engine.setTargets(a, b), groups: (g) => engine.setGroups(g), groupData: (d) => engine.setGroupData(d) }, sched);
    ctrl.setViewport(390, 844); ctrl.setLite(true);
    ctrl.setStage({ x: 16, y: 60, w: 358, h: 287 });
    const st = ctrl.spawn('scatter'); engine.setState(st.pos, st.vel);
    void ctrl.perform({ duration: 9000, groups: [{ shape: rect(0.2, 0.3), share: 1, follow: 'pointer', path: [{ t: 0, x: 0, y: 0 }] }] });
    await new Promise((r) => setTimeout(r, 0));
    const step = (sec: number, each?: () => void) => { for (let i = 0; i < Math.round(sec * 60); i++) { each?.(); sched.advance(1 / 60); engine.frame(ctrl.update(1 / 60), false); } };
    step(0.5);
    const home = { ...ctrl.groupPoses[0]! };
    // stage centre (world): x 0, y = 844/2 − (60 + 143.5) = 218.5
    expect(home.y).toBeCloseTo(218.5, 0);
    ctrl.pointer(195, 780, 0, 0); // a tap on the chip row
    step(1.5);
    expect(Math.hypot(ctrl.groupPoses[0]!.x - home.x, ctrl.groupPoses[0]!.y - home.y)).toBeLessThan(2);
    // a finger dragging across the bottom of the screen: chased, but the cursor stays inside the stage
    let x = 60;
    step(2, () => { x += 4; ctrl.pointer(x, 790, 240, 0); });
    const g = ctrl.groupPoses[0]!;
    expect(Math.abs(g.x - home.x)).toBeGreaterThan(20);
    expect(g.y).toBeGreaterThan(218.5 - 143.5 * 0.6 - 1); // never below the stage's lower part
  });
});
