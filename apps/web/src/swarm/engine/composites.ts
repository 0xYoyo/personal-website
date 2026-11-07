// Composite glyphs (WAVE6 C4): a `[[become:<id>]]` that names a small composition of glyphs is performed as a
// multi-group scene (one group a glyph, side by side), the show's mechanism, instead of one sampled silhouette.
// Every member is a monochrome glyph in glyphs/*.svg; nothing here draws an emoji.
import type { Path, PathKey, Scene, SceneGroup } from '@yoyo/protocol';

/** Composite id → its member glyphs, left → right. */
export const COMPOSITES: Readonly<Record<string, readonly string[]>> = {
  /** festivals, travel, video games */
  weekend: ['ticket', 'plane', 'gamepad'],
  /** lifting, running */
  workout: ['dumbbell', 'runner'],
};

/** Silhouette aspect (w / h) of each member's drawn bounding box (measured from the SVGs). */
export const MEMBER_AR: Readonly<Record<string, number>> = { ticket: 1.9, plane: 1.21, gamepad: 1.76, dumbbell: 2.07, runner: 0.8 };
/** Share of a member's bounding box its silhouette covers (measured): with its aspect, the ink it draws at one height. */
export const MEMBER_FILL: Readonly<Record<string, number>> = { ticket: 0.91, plane: 0.34, gamepad: 0.72, dumbbell: 0.47, runner: 0.32 };
/** A member's resting tilt (rad, ccw): the ticket sits a little askew, like one held up. */
const TILT: Readonly<Record<string, number>> = { ticket: 0.1 };

export const isComposite = (id: string): boolean => Object.prototype.hasOwnProperty.call(COMPOSITES, id);

interface Box { w: number; h: number }

/** Size (px) of a glyph with aspect `ar` at scale 1: fitted into the stage like any glyph (shapes.ts fitFor). */
function fit(box: Box, ar: number): { w: number; h: number } {
  const m = Math.min(box.w, box.h) * 0.07 + 8;
  const W = (box.w - 2 * m) * 0.9, H = (box.h - 2 * m) * 0.8;
  return W / H > ar ? { w: H * ar, h: H } : { w: W, h: W / ar };
}

const at = (t: number, x: number, y: number, o: Partial<PathKey> = {}): PathKey => ({ t, x, y, ...o });

/** How long a composite moves (its pop-in and a slow bob); the last pose holds after it. */
export const COMPOSITE_MS = 9000;

/**
 * The scene for composite `id` in a free stage `box` (CSS px), or null for any other id. The members share one
 * height and sit in a row; a stage too narrow for the row stacks them in a column instead (whichever draws them
 * bigger). Each pops in a beat after the previous one, then bobs a little, out of step with the others.
 */
export function compositeScene(id: string, box: Box): Scene | null {
  const ids = COMPOSITES[id];
  if (!ids || box.w <= 0 || box.h <= 0) return null;
  const ars = ids.map((g) => MEMBER_AR[g] ?? 1);
  const N = ids.length;
  // particles by the square root of the ink each member draws: the solid ticket gets more than the slim plane, but
  // the slim ones keep enough dots to read at 2k (an even density would starve them)
  const ink = ids.map((g, k) => Math.sqrt(ars[k]! * (MEMBER_FILL[g] ?? 0.5)));
  const inkSum = ink.reduce((a, b) => a + b, 0);
  const m = Math.min(box.w, box.h) * 0.07 + 8;
  const aw = box.w - 2 * m, ah = box.h - 2 * m;
  const gap = Math.min(box.w, box.h) * 0.06;
  // one shared height h: the row is sum(ar) · h + gaps wide; the column N · h + gaps tall (each member ≤ aw wide)
  const rowH = Math.min((aw - gap * (N - 1)) / ars.reduce((a, b) => a + b, 0), ah * 0.62);
  const colH = Math.min((ah - gap * (N - 1)) / N, aw * 0.8 / Math.max(...ars));
  const row = rowH >= colH * 0.9;
  const h = Math.max(8, row ? rowH : colH);
  const ws = ars.map((a) => a * h);
  const ux = (px: number): number => px / (box.w / 2), uy = (px: number): number => px / (box.h / 2);
  let cursor = row ? -(ws.reduce((a, b) => a + b, 0) + gap * (N - 1)) / 2 : -(N * h + gap * (N - 1)) / 2;
  const groups: SceneGroup[] = ids.map((g, k) => {
    let x = 0, y = 0;
    if (row) { x = ux(cursor + ws[k]! / 2); cursor += ws[k]! + gap; }
    else { y = uy(cursor + h / 2); cursor += h + gap; }
    // the glyph is fitted into the whole stage at scale 1; this scale draws it h tall (or ws[k] wide, whichever binds)
    const f = fit(box, ars[k]!);
    const s = Math.min(ws[k]! / f.w, h / f.h);
    const rot = TILT[g] ?? 0;
    const t0 = 120 + k * 200;
    const dir = k % 2 ? 1 : -1;
    const path: Path = [
      at(0, x, y, { scale: s * 0.82, rot }),
      at(t0, x, y, { scale: s * 0.82, rot }),
      at(t0 + 420, x, y, { scale: s, rot, ease: 'back' }),
      at(t0 + 2600, x, y + dir * 0.012, { scale: s, rot, ease: 'inOut' }),
      at(t0 + 5000, x, y - dir * 0.012, { scale: s, rot, ease: 'inOut' }),
      at(COMPOSITE_MS, x, y, { scale: s, rot, ease: 'inOut' }),
    ];
    return { shape: { kind: 'glyph', id: g } as SceneGroup['shape'], share: ink[k]! / inkSum, path };
  });
  return { duration: COMPOSITE_MS, tableau: 1200, groups };
}
