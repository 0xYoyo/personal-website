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
});
