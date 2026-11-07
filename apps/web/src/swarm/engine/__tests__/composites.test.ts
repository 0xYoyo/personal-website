import { describe, expect, it, vi } from 'vitest';
import { GLYPH_IDS } from '@yoyo/protocol';
import { COMPOSITES, MEMBER_AR, compositeScene, isComposite } from '../composites';
import { evalPath } from '../perform';
import { Controller } from '../backend/controller';
import { Scheduler } from '../backend/scheduler';

// WAVE6 C4: the hobbies reply's monochrome compositions, performed as small multi-group scenes.
const SVGS = import.meta.glob('../glyphs/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** A group's rest pose in px (stage centre origin, y down) and its drawn width / height at that pose. */
function placed(box: { w: number; h: number }, id: string) {
  const sc = compositeScene(id, box)!;
  return sc.groups.map((g) => {
    const p = evalPath(g.path, sc.duration);
    const gid = (g.shape as { id: string }).id;
    const ar = MEMBER_AR[gid]!;
    const m = Math.min(box.w, box.h) * 0.07 + 8;
    const W = (box.w - 2 * m) * 0.9, H = (box.h - 2 * m) * 0.8;
    const f = W / H > ar ? { w: H * ar, h: H } : { w: W, h: W / ar };
    return { id: gid, x: (p.x * box.w) / 2, y: (p.y * box.h) / 2, w: f.w * p.scale, h: f.h * p.scale };
  });
}

describe('composite glyphs (WAVE6 C4)', () => {
  it('weekend is a ticket, a plane and a game controller; workout a dumbbell and a runner — all monochrome SVG glyphs', () => {
    expect(COMPOSITES.weekend).toEqual(['ticket', 'plane', 'gamepad']);
    expect(COMPOSITES.workout).toEqual(['dumbbell', 'runner']);
    for (const id of [...COMPOSITES.weekend!, ...COMPOSITES.workout!]) {
      expect(GLYPH_IDS).toContain(id);
      const svg = SVGS[`../glyphs/${id}.svg`];
      expect(svg).toBeTypeOf('string');
      if (!svg) continue;
      // a silhouette: black fill only, no colour, no text, no emoji
      expect(svg).not.toMatch(/<text|<image|\p{Extended_Pictographic}/u);
      expect([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]+)"/gi)].every((m) => /^#(000|000000|fff|ffffff)$/i.test(m[1]!))).toBe(true);
    }
    expect(GLYPH_IDS).toContain('weekend');
    expect(GLYPH_IDS).toContain('workout');
    expect(isComposite('weekend')).toBe(true);
    expect(isComposite('keyboard')).toBe(false);
    expect(compositeScene('keyboard', { w: 800, h: 600 })).toBeNull();
  });

  it('lays the members out side by side, inside the stage, never overlapping (desktop, phone, and a tall column)', () => {
    for (const box of [{ w: 760, h: 560 }, { w: 358, h: 287 }, { w: 420, h: 640 }]) {
      for (const id of ['weekend', 'workout']) {
        const ps = placed(box, id);
        expect(ps.map((p) => p.id)).toEqual(COMPOSITES[id]);
        for (const p of ps) {
          expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(box.w / 2 + 0.5);
          expect(Math.abs(p.y) + p.h / 2).toBeLessThanOrEqual(box.h / 2 + 0.5);
          // big enough to read: at least a fifth of the stage's short side tall
          expect(p.h).toBeGreaterThan(Math.min(box.w, box.h) * 0.2);
        }
        for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) {
          const A = ps[a]!, B = ps[b]!;
          const apart = Math.abs(A.x - B.x) >= (A.w + B.w) / 2 || Math.abs(A.y - B.y) >= (A.h + B.h) / 2;
          expect(apart).toBe(true);
        }
      }
    }
    // a wide stage puts them in one row
    const row = placed({ w: 760, h: 420 }, 'weekend');
    expect(new Set(row.map((p) => Math.round(p.y))).size).toBe(1);
    expect(row[0]!.x).toBeLessThan(row[1]!.x);
    expect(row[1]!.x).toBeLessThan(row[2]!.x);
  });

  it('fits the canvas2d tier as is (at most three groups); the slim members still get a fair share of the dots', () => {
    for (const id of ['weekend', 'workout']) {
      const sc = compositeScene(id, { w: 760, h: 560 })!;
      expect(sc.groups.length).toBeLessThanOrEqual(3);
      expect(sc.groups.reduce((a, g) => a + g.share, 0)).toBeCloseTo(1, 6);
      for (const g of sc.groups) expect(g.share).toBeGreaterThan(0.2);
    }
  });

  it('the swarm performs a composite become as a scene, and becomes any other glyph as before', () => {
    const sched = new Scheduler();
    const ctrl = new Controller(3000, { upload: () => undefined, groups: () => undefined, groupData: () => undefined }, sched);
    ctrl.setViewport(1280, 720);
    const perform = vi.spyOn(ctrl, 'perform').mockResolvedValue(true);
    void ctrl.become({ kind: 'glyph', id: 'weekend' });
    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform.mock.calls[0]![0].groups.map((g) => (g.shape as { id: string }).id)).toEqual(['ticket', 'plane', 'gamepad']);
    void ctrl.become({ kind: 'glyph', id: 'workout' });
    expect(perform.mock.calls[1]![0].groups.map((g) => (g.shape as { id: string }).id)).toEqual(['dumbbell', 'runner']);
    void ctrl.become({ kind: 'glyph', id: 'keyboard' });
    expect(perform).toHaveBeenCalledTimes(2);
  });
});
