import { describe, expect, it } from 'vitest';
import { frameTargets, ringTargets, resampleToN, sampleMask, samplesToTargets, isEmoji } from '../shapes';

function discMask(w: number, h: number, r: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < r * r;
    a[o] = x < w / 2 ? 255 : 10; a[o + 1] = 40; a[o + 2] = x < w / 2 ? 10 : 230; a[o + 3] = inside ? 255 : 0;
  }
  return a;
}

describe('sampleMask', () => {
  for (const n of [1, 37, 3000, 20000, 40000]) {
    it(`returns exactly ${n} points, all inside the mask`, () => {
      const m = discMask(200, 160, 60);
      const s = sampleMask(m.subarray(3), 4, 200, 160, n, 9);
      expect(s.x.length).toBe(n);
      expect(s.y.length).toBe(n);
      let inside = 0;
      for (let i = 0; i < n; i++) if ((s.x[i]! - 100) ** 2 + (s.y[i]! - 80) ** 2 < 61 * 61) inside++;
      expect(inside / n).toBeGreaterThan(0.99);
    });
  }
  it('handles an empty mask', () => {
    const s = sampleMask(new Uint8ClampedArray(40 * 40 * 4).subarray(3), 4, 40, 40, 100);
    expect(s.x.length).toBe(100);
    expect(s.filled).toBe(0);
  });
  it('is deterministic for a seed', () => {
    const m = discMask(100, 100, 40);
    const a = sampleMask(m.subarray(3), 4, 100, 100, 500, 3), b = sampleMask(m.subarray(3), 4, 100, 100, 500, 3);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
  });
});

describe('emoji colour sampling', () => {
  it('carries per-target colours from the RGBA source', () => {
    const w = 200, h = 160, m = discMask(w, h, 60);
    const s = sampleMask(m.subarray(3), 4, w, h, 2000, 4);
    const t = samplesToTargets(s, w, h, { maxW: 400, maxH: 400, cx: 0, cy: 0, depth: 0 }, 1, m);
    expect(t.colored).toBe(true);
    expect(t.n).toBe(2000);
    for (let i = 0; i < t.n; i++) {
      const left = s.x[i]! < w / 2;
      const r = t.col[i * 4]!, b = t.col[i * 4 + 2]!;
      if (left) { expect(r).toBeCloseTo(1, 2); expect(b).toBeLessThan(0.1); } else { expect(b).toBeGreaterThan(0.85); }
      expect(t.col[i * 4 + 3]!).toBe(1);
      // left-side pixels map to negative world x
      if (s.x[i]! < w / 2 - 2) expect(t.pos[i * 4]!).toBeLessThan(0);
    }
  });
  it('fits into the requested box', () => {
    const m = discMask(200, 160, 60);
    const s = sampleMask(m.subarray(3), 4, 200, 160, 1000, 4);
    const t = samplesToTargets(s, 200, 160, { maxW: 300, maxH: 100, cx: 10, cy: 20, depth: 5 }, 1);
    for (let i = 0; i < t.n; i++) {
      expect(Math.abs(t.pos[i * 4]! - 10)).toBeLessThanOrEqual(150.01);
      expect(Math.abs(t.pos[i * 4 + 1]! - 20)).toBeLessThanOrEqual(50.01);
      expect(Math.abs(t.pos[i * 4 + 2]!)).toBeLessThanOrEqual(5);
      expect(t.pos[i * 4 + 3]!).toBeGreaterThanOrEqual(0);
      expect(t.pos[i * 4 + 3]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('frame + ring targets', () => {
  it('frame: exactly N, all within the band around the rect', () => {
    const vp = { w: 1280, h: 720 }, rect = { x: 210, y: 90, w: 860, h: 540 };
    const t = frameTargets(20000, rect, vp, 11);
    expect(t.n).toBe(20000);
    const L = rect.x - 640, T = 360 - rect.y, R = L + rect.w, B = T - rect.h;
    for (let i = 0; i < t.n; i++) {
      const x = t.pos[i * 4]!, y = t.pos[i * 4 + 1]!;
      expect(x).toBeGreaterThanOrEqual(L - 6); expect(x).toBeLessThanOrEqual(R + 6);
      expect(y).toBeGreaterThanOrEqual(B - 6); expect(y).toBeLessThanOrEqual(T + 6);
      const dEdge = Math.min(Math.abs(x - L), Math.abs(x - R), Math.abs(y - T), Math.abs(y - B));
      expect(dEdge).toBeLessThanOrEqual(6 + 18 * (1 - Math.SQRT1_2)); // rounded corners sit inside the band
    }
  });
  it('ring: exactly N', () => { expect(ringTargets(3000, 100).pos.length).toBe(12000); });
  it('resampleToN thins and repeats', () => {
    expect(resampleToN(new Float32Array(30), 3, 4).length).toBe(12);
    expect(resampleToN(new Float32Array(30), 3, 50).length).toBe(150);
  });
});

describe('isEmoji', () => {
  it('detects emoji vs text', () => {
    expect(isEmoji('🚀')).toBe(true);
    expect(isEmoji('❤️')).toBe(true);
    expect(isEmoji('👍🏽')).toBe(true);
    expect(isEmoji('Dana')).toBe(false);
    expect(isEmoji('hi 🚀')).toBe(false);
  });
});

describe('small-stage glyph variants (FIX4 E3)', () => {
  it('a phone (small stage or 2k dots) takes the closed envelope for the open one', async () => {
    const { smallStage, SMALL_VARIANTS } = await import('../shapes');
    expect(SMALL_VARIANTS['envelope-open']).toBe('envelope');
    expect(smallStage(2000, { w: 1440, h: 900 })).toBe(true);
    expect(smallStage(12000, { w: 390, h: 844, stage: { x: 16, y: 60, w: 358, h: 287 } })).toBe(true);
    expect(smallStage(40000, { w: 1440, h: 900, stage: { x: 920, y: 72, w: 488, h: 638 } })).toBe(false);
  });
});
