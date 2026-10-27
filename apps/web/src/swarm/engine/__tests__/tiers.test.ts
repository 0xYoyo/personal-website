import { describe, expect, it } from 'vitest';
import { AdaptiveMonitor, initialTier, nextLowerTier, startTier, tierConfig } from '../tiers';
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

describe('AdaptiveMonitor (time-based, POSTFIX4 E1)', () => {
  const feed = (m: AdaptiveMonitor, ms: number, total: number): { at: number; drop: string | false } => {
    let t = 0;
    while (t < total) { t += ms; const d = m.frame(ms); if (d) return { at: t, drop: d }; }
    return { at: t, drop: false };
  };
  it('drops one tier after 1.2 s of frames over 20 ms, not before (whatever the frame rate)', () => {
    for (const ms of [25, 40, 80]) {
      const m = new AdaptiveMonitor(20, 1200, 0);
      const r = feed(m, ms, 5000);
      expect(r.drop).toBe('one');
      expect(r.at).toBeGreaterThanOrEqual(1200);
      expect(r.at).toBeLessThan(1200 + ms + 1);
    }
  });
  it('ignores a warm-up of 1.5 s (by time) after a reset', () => {
    const m = new AdaptiveMonitor();
    const r = feed(m, 40, 10000);
    expect(r.at).toBeGreaterThanOrEqual(1500 + 1200);
    expect(r.at).toBeLessThan(1500 + 1200 + 81);
  });
  it('under 10 fps for 1 s it goes straight to tier 0', () => {
    const m = new AdaptiveMonitor(20, 1200, 0);
    const r = feed(m, 300, 5000);
    expect(r.drop).toBe('floor');
    expect(r.at).toBeLessThanOrEqual(1200);
    // at 1 fps: warm-up (1.5 s) + 1 s → the second frame after the warm-up
    const slow = new AdaptiveMonitor();
    const s = feed(slow, 1000, 10000);
    expect(s.drop).toBe('floor');
    expect(s.at).toBeLessThanOrEqual(3000);
  });
  it('a fast stretch takes the slow tally back; an odd fast frame does not', () => {
    const m = new AdaptiveMonitor(20, 1200, 0);
    feed(m, 25, 1100);
    for (let i = 0; i < 60; i++) m.frame(10); // 0.6 s at 100 fps
    expect(feed(m, 25, 1000).drop).toBe(false);
    const j = new AdaptiveMonitor(20, 1200, 0);
    let dropped: string | false = false;
    for (let i = 0; i < 200 && !dropped; i++) dropped = j.frame(i % 10 === 9 ? 12 : 30); // 30 ms with a 12 ms frame every tenth
    expect(dropped).toBe('one');
  });
  it('ignores huge hitches (pauses) and does not count them', () => {
    const m = new AdaptiveMonitor(20, 1200, 0);
    for (let i = 0; i < 40; i++) expect(m.frame(6000)).toBe(false);
  });
});

describe('startTier (POSTFIX4 E1)', () => {
  const sig = { cores: 8, memory: 8, gpuVendor: null, gpuArch: null, gpuFallback: false, glRenderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' } as const;
  const phone = { webgpu: false, webgl2: true, mobile: true };
  it('desktop: the best available', () => {
    expect(startTier(all, sig)).toBe(3);
    expect(startTier({ ...all, webgpu: false }, sig)).toBe(2);
    expect(startTier(all, sig, true)).toBe(0);
  });
  it('a phone gets WebGL2 only with >= 6 cores and >= 4 GB', () => {
    expect(startTier(phone, sig)).toBe(2);
    expect(startTier(phone, { ...sig, cores: 4 })).toBe(0);
    expect(startTier(phone, { ...sig, memory: 2 })).toBe(0);
    expect(startTier(phone, { ...sig, memory: null })).toBe(2); // Safari does not say
    expect(startTier(phone, { ...sig, cores: null })).toBe(0);
  });
  it('a phone gets WebGPU only on a named mobile GPU', () => {
    const gp = { ...phone, webgpu: true };
    expect(startTier(gp, { ...sig, gpuVendor: 'apple', gpuArch: 'common-3' })).toBe(3);
    expect(startTier(gp, { ...sig, gpuVendor: 'qualcomm', gpuArch: 'adreno-7xx' })).toBe(3);
    expect(startTier(gp, { ...sig, gpuVendor: null })).toBe(2); // no adapter info: the WebGL2 rule
    expect(startTier(gp, { ...sig, gpuVendor: null, cores: 4 })).toBe(0);
    expect(startTier(gp, { ...sig, gpuVendor: 'apple', gpuFallback: true, cores: 4 })).toBe(0);
  });
  it('a phone on a software renderer starts on the 2D tier', () => {
    expect(startTier({ ...phone, webgpu: true }, { ...sig, gpuVendor: 'google', gpuArch: 'swiftshader', glRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' })).toBe(0);
    expect(startTier(phone, { ...sig, glRenderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe(0);
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
