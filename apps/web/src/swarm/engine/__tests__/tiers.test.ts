import { describe, expect, it } from 'vitest';
import { AdaptiveMonitor, initialTier, nextLowerTier, tierConfig } from '../tiers';
import { hash01, knitDelay, makeSeeds } from '../hash';

const all = { webgpu: true, webgl2: true, mobile: false };

describe('tier selection', () => {
  it('picks the best available tier', () => {
    expect(initialTier(all)).toBe(3);
    expect(initialTier({ ...all, webgpu: false })).toBe(2);
    expect(initialTier({ webgpu: false, webgl2: false, mobile: false })).toBe(0);
  });
  it('maps tiers to backends and counts (SPEC §3.1)', () => {
    expect(tierConfig(3, all)).toMatchObject({ backend: 'webgpu', count: 40000, bloom: true });
    expect(tierConfig(2, all)).toMatchObject({ backend: 'webgl2', count: 20000, bloom: false });
    expect(tierConfig(3, { ...all, webgpu: false })).toMatchObject({ tier: 2, backend: 'webgl2', count: 20000 });
    expect(tierConfig(0, all)).toMatchObject({ backend: 'canvas2d', count: 3000 });
    expect(tierConfig(2, { webgpu: false, webgl2: false, mobile: false }).backend).toBe('canvas2d');
    expect(tierConfig(3, { ...all, mobile: true })).toMatchObject({ count: 12000, dprCap: 1.5 });
    expect(tierConfig(2, { ...all, webgpu: false, mobile: true })).toMatchObject({ count: 6000 });
  });
  it('keeps the WebGPU backend when dropping a tier adaptively', () => {
    expect(tierConfig(2, all, 'webgpu')).toMatchObject({ backend: 'webgpu', count: 20000, bloom: false });
    expect(tierConfig(1, all, 'webgpu')).toMatchObject({ backend: 'webgpu', count: 8000 });
  });
  it('nextLowerTier stops at 0', () => {
    expect(nextLowerTier(3)).toBe(2);
    expect(nextLowerTier(0)).toBeNull();
  });
});

describe('AdaptiveMonitor', () => {
  it('drops after 20 consecutive slow frames, not before', () => {
    const m = new AdaptiveMonitor(20, 20, 0);
    for (let i = 0; i < 19; i++) expect(m.frame(25)).toBe(false);
    expect(m.frame(25)).toBe(true);
  });
  it('a fast frame resets the streak', () => {
    const m = new AdaptiveMonitor(20, 20, 0);
    for (let i = 0; i < 19; i++) m.frame(25);
    m.frame(10);
    for (let i = 0; i < 19; i++) expect(m.frame(25)).toBe(false);
  });
  it('ignores the warm-up window and huge hitches', () => {
    const m = new AdaptiveMonitor(20, 20, 30);
    for (let i = 0; i < 30; i++) expect(m.frame(100)).toBe(false);
    for (let i = 0; i < 40; i++) expect(m.frame(6000)).toBe(false);
  });
  it('counts very slow (but not paused) frames', () => {
    const m = new AdaptiveMonitor(20, 20, 0);
    let dropped = false;
    for (let i = 0; i < 20; i++) dropped = m.frame(400);
    expect(dropped).toBe(true);
  });
});

describe('hash delays', () => {
  it('are deterministic and in range', () => {
    for (let i = 0; i < 1000; i++) {
      expect(hash01(i, 3)).toBe(hash01(i, 3));
      const h = hash01(i, 3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1);
      const d = knitDelay(i, i / 1000); expect(d).toBe(knitDelay(i, i / 1000));
      expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(1);
    }
    expect(Array.from(makeSeeds(64))).toEqual(Array.from(makeSeeds(64)));
  });
  it('are well spread (not a linear ramp)', () => {
    const n = 10000, bins = new Array(10).fill(0);
    let corr = 0;
    for (let i = 0; i < n; i++) { const h = hash01(i, 11); bins[Math.floor(h * 10)]++; corr += (h - 0.5) * (i / n - 0.5); }
    for (const b of bins) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 * 0.1);
    expect(Math.abs(corr / n)).toBeLessThan(0.01);
  });
  it('knit sweeps roughly left → right', () => {
    let l = 0, r = 0;
    for (let i = 0; i < 2000; i++) { l += knitDelay(i, 0); r += knitDelay(i, 1); }
    expect(r / 2000 - l / 2000).toBeCloseTo(0.4, 5);
  });
});
