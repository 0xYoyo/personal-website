// The show (wave 3 SHOW, FIX4 W4–W7): ~39 s, seven scenes, one line of mine each, the swarm acting each one out. It replaces
// the passive tour as the main path: it starts on its own 2.5 s after the greeting (once a visit); typing does not stop it,
// sending a message or a chip does (the scene freezes and the reply morphs from it).
// Scenes are laid out in the free stage (stage units: ±1 = its half width / height, +y down) and fitted to its
// shape, so a phone's wide top stage and the desktop's tall right column both get a scene that reads.
import type { Keys, Path, PathKey, Scene, SceneGroup, SceneShape } from '@yoyo/protocol';
import { beat, seq, type BeatSpec, type Step } from '../ui/runner/engine';
import { ENTRY_CHIPS } from './chips';

export const SHOW_LINES = [
  "I'm Yoyo.",
  "I don't write most of my code anymore. I direct the things that do.",
  "Unfiltered. Type what you want the way you'd say it. It finds the product.",
  'Prompt Racers. A kart racer that teaches kids how to talk to AI.',
  'yoyo-loop. I write the spec. Agents build. Another agent reviews. I merge.',
  'Crypto since 2021. Self-taught since 2022. Reichman since 2025.',
  'Ask me anything.',
] as const;

/**
 * Scene lengths (ms), in order: 3.5 + 6 + 6.5 + 6 + 7 + 6.5 + 4 = 39.5 s. Scenes 2, 3 and 5 hold a second longer
 * than their read time (the eye is on the scene too, FIX4 W7); scene 6 is three shapes of ~2 s each (FIX4 W6).
 */
export const SCENE_MS = [3500, 6000, 6500, 6000, 7000, 6500, 4000] as const;
/** Scene 6's three short captions, one a shape (btc, the yoyo wordmark, the cap), in sync (FIX4 W6). */
export const SCENE6_LINES = ['Crypto since 2021.', 'Self-taught since 2022.', 'Reichman since 2025.'] as const;
const SCENE6_GLYPHS = ['btc', 'yoyo', 'cap'] as const;
/** How long each of scene 6's shapes stays (sum = SCENE_MS[5]). */
export const SCENE6_MS = [2150, 2150, 2200] as const;
/** Every caption the show types, in order. */
export const SHOW_CAPTIONS: readonly string[] = [...SHOW_LINES.slice(0, 5), ...SCENE6_LINES, SHOW_LINES[6]];
/** The show starts this long after the greeting has landed (unless anything is touched first). */
export const SHOW_AFTER_GREETING_MS = 2500;
export const WATCH_AGAIN = 'watch again';

/** The free stage a scene is laid out in (CSS px). */
export interface StageBox { w: number; h: number }

// ---------------------------------------------------------------- layout helpers (px ↔ stage units)

/** Silhouette aspect (w / h) of the glyphs the show uses (their drawn bounding box). */
const AR = { frame: 860 / 700, kart: 1.44, cursor: 0.56, magnifier: 1, loop: 1.18, check: 1.32 } as const;

/** Size (px) of a glyph with aspect `ar` at scale 1: fitted into the stage like any shape (shapes.ts fitFor). */
function fit(box: StageBox, ar: number): { w: number; h: number } {
  const m = Math.min(box.w, box.h) * 0.07 + 8;
  const W = (box.w - 2 * m) * 0.9, H = (box.h - 2 * m) * 0.8;
  return W / H > ar ? { w: H * ar, h: H } : { w: W, h: W / ar };
}
/** The scale at which a glyph is `px` wide. */
const scaleForW = (box: StageBox, ar: number, px: number): number => px / fit(box, ar).w;
const ux = (box: StageBox, px: number): number => px / (box.w / 2);
const uy = (box: StageBox, px: number): number => px / (box.h / 2);

const glyph = (id: 'frame' | 'kart' | 'cursor' | 'magnifier' | 'loop' | 'check' | 'keyboard' | 'question' | 'btc' | 'cap' | 'yoyo'): SceneShape => ({ kind: 'glyph', id });
const at = (t: number, x: number, y: number, o: Partial<PathKey> = {}): PathKey => ({ t, x, y, ...o });
const keys = (...kv: [number, number][]): Keys => kv.map(([t, v]) => ({ t, v }));

/** A window (the frame glyph) with three lines of work inside it that type in left → right as `fill` grows. */
function windowShape(box: StageBox): SceneShape {
  const f = fit(box, AR.frame);
  const W = f.w, H = f.h; // at group scale 1; the group's scale shrinks the lot together
  const line = (y: number, w: number, share: number) => ({
    shape: { kind: 'rect', w: (w * W) / box.w, h: (0.075 * H) / box.h } as SceneShape,
    share, x: ux(box, -0.34 * W + (w * W) / 2), y: uy(box, y * H), reveal: 'x' as const,
  });
  return {
    kind: 'parts',
    parts: [
      { shape: glyph('frame'), share: 0.6 },
      line(-0.04, 0.56, 0.15),
      line(0.13, 0.42, 0.12),
      line(0.3, 0.5, 0.13),
    ],
  };
}
/** fill at which a window's outline is in and its lines are not yet */
const WINDOW_EMPTY = 0.6;

// ---------------------------------------------------------------- the scenes

/**
 * 1: the cursor (FIX4 W4). The letters already dissolved at the entry, so the show opens on the cursor straight
 * from the idle wave: it chases the visitor's pointer, and with no pointer it idles in a slow figure-eight.
 */
function cursorScene(box: StageBox, ms: number): Scene {
  const s = scaleForW(box, AR.cursor, Math.min(box.w, box.h) * 0.3);
  const PERIOD = 5200; // one figure-eight, ms: slow
  const ax = 0.26, ay = 0.16;
  const path: Path = [];
  for (let t = 0; t <= ms; t += 100) {
    const w = (t / PERIOD) * Math.PI * 2;
    path.push(at(t, ax * Math.sin(w), -0.04 + ay * Math.sin(2 * w), { scale: s, rot: 0.06 * Math.cos(w), ease: 'linear' }));
  }
  return { duration: ms, tableau: 0, groups: [{ shape: glyph('cursor'), share: 1, follow: 'pointer', path }] };
}

/** 2b: the keys scatter into four small windows, a swarm of agents; one by one they fill with work. */
function agentsScene(box: StageBox, ms: number): Scene {
  const wide = box.w / box.h > 1;
  const winW = box.w * (wide ? 0.4 : 0.44);
  const s = scaleForW(box, AR.frame, winW);
  const f = fit(box, AR.frame);
  const gx = ux(box, winW / 2 + box.w * (wide ? 0.035 : 0.03));
  const gy = uy(box, (f.h * s) / 2 + box.h * (wide ? 0.04 : 0.06));
  const cells: [number, number][] = [[-gx, -gy], [gx, -gy], [-gx, gy], [gx, gy]];
  const mk = (k: number): SceneGroup => {
    const [x, y] = cells[k]!;
    const t0 = 700 + k * 520;
    // alive: each window bobs a little, out of step with the others
    const bob: Path = [0, 1, 2, 3, 4].map((j) => at(j * (ms / 4), x, y + (j % 2 ? 1 : -1) * 0.018 * (k % 2 ? 1 : -1), { scale: s, ease: 'inOut' }));
    return {
      shape: windowShape(box), share: 1, path: bob,
      fill: keys([0, WINDOW_EMPTY], [t0, WINDOW_EMPTY], [t0 + 1100, 1]),
      brightness: keys([0, 0.85], [t0, 0.85], [t0 + 1100, 1.15], [t0 + 1500, 1]),
    };
  };
  const groups = [0, 1, 2, 3].map((k) => mk(k));
  // canvas2d: three windows (one row on a phone, a triangle on desktop)
  const liteW = wide ? box.w * 0.29 : winW;
  const liteCells: [number, number][] = wide ? [[-ux(box, liteW * 1.12), 0], [0, 0], [ux(box, liteW * 1.12), 0]] : [[-gx, -gy], [gx, -gy], [0, gy]];
  const ls = scaleForW(box, AR.frame, liteW);
  const lite: Scene = {
    duration: ms,
    groups: liteCells.map(([x, y], k) => ({ ...mk(k), shape: windowShape(box), path: [at(0, x, y, { scale: ls })] })),
  };
  return { duration: ms, groups, lite };
}

/** 3: the windows merge into a search bar; a magnifier sweeps it left → right as a query types in; three results pop up, the middle one brightens. */
function searchScene(box: StageBox, ms: number): Scene {
  const wide = box.w / box.h > 1;
  const barW = box.w * 0.86;
  const barH = Math.max(36, Math.min(64, Math.min(box.w, box.h) * 0.15));
  const barY = wide ? -0.52 : -0.46;
  const query: SceneShape = { kind: 'rect', w: 0.5, h: (barH * 0.2) / box.h };
  const bar: SceneGroup = {
    shape: {
      kind: 'parts',
      parts: [
        { shape: { kind: 'bar', w: 0.86, h: barH / box.h, thickness: 8 }, share: 0.7 },
        { shape: query, share: 0.3, x: ux(box, -barW / 2 + box.w * 0.06 + box.w * 0.25), reveal: 'x' },
      ],
    },
    share: 0.34,
    path: [at(0, 0, barY)],
    fill: keys([0, 0.7], [900, 0.7], [2600, 1]),
  };
  // the magnifier rides the bar: left end → right end with the query, then rests at the right like a search button
  const mW = barH * 1.55;
  const ms_ = scaleForW(box, AR.magnifier, mW);
  const xl = ux(box, -barW / 2 + mW * 0.35), xr = ux(box, barW / 2 - mW * 0.5);
  const yMag = barY - uy(box, barH * 0.08);
  const magnifier: SceneGroup = {
    shape: glyph('magnifier'), share: 0.16,
    path: [at(0, xl, yMag, { scale: ms_ }), at(900, xl, yMag, { scale: ms_ }), at(2600, xr, yMag, { scale: ms_, rot: 0.12 }), at(2900, xr, yMag, { scale: ms_ * 1.12, rot: 0 , ease: 'out' }), at(3150, xr, yMag, { scale: ms_, ease: 'inOut' })],
    brightness: 1.1,
  };
  // results: three product tiles (an outline with an image block inside), popping in under the bar
  const tileW = box.w * (wide ? 0.25 : 0.27);
  const tileH = Math.min(tileW * 1.18, box.h * (wide ? 0.46 : 0.36));
  const tile: SceneShape = {
    kind: 'parts',
    parts: [
      { shape: { kind: 'bar', w: tileW / box.w, h: tileH / box.h, thickness: 7 }, share: 0.62 },
      { shape: { kind: 'rect', w: (tileW * 0.62) / box.w, h: (tileH * 0.42) / box.h }, share: 0.26, y: uy(box, -tileH * 0.12) },
      { shape: { kind: 'rect', w: (tileW * 0.5) / box.w, h: (tileH * 0.07) / box.h }, share: 0.12, y: uy(box, tileH * 0.26) },
    ],
  };
  const tileY = barY + uy(box, barH / 2 + box.h * (wide ? 0.1 : 0.08) + tileH / 2);
  const tx = ux(box, tileW + box.w * 0.05);
  const result = (k: number): SceneGroup => {
    const t0 = 2700 + k * 200, mid = k === 1;
    return {
      shape: tile, share: 0.5 / 3,
      path: [at(0, (k - 1) * tx, tileY, { scale: 0.55 }), at(t0, (k - 1) * tx, tileY, { scale: 0.55 }), at(t0 + 380, (k - 1) * tx, tileY, { scale: 1, ease: 'back' }),
        at(3700, (k - 1) * tx, tileY, { scale: 1 }), at(4200, (k - 1) * tx, tileY - (mid ? 0.03 : 0), { scale: mid ? 1.12 : 0.94 })],
      fill: keys([0, 0], [t0, 0], [t0 + 160, 1]),
      brightness: keys([0, 0.8], [3700, 0.8], [4200, mid ? 1.35 : 0.42]),
    };
  };
  const lite: Scene = {
    duration: ms,
    groups: [
      bar,
      magnifier,
      {
        shape: { kind: 'parts', parts: [0, 2, 1].map((k) => ({ shape: tile, share: 1, x: (k - 1) * tx, ...(k === 1 ? { scale: 1.12, y: -0.03 } : { scale: 0.94 }) })) },
        share: 0.5, path: [at(0, 0, tileY)],
        fill: keys([0, 0], [2700, 0], [3400, 1]),
      },
    ],
  };
  return { duration: ms, groups: [bar, magnifier, result(0), result(1), result(2)], lite, tableau: 4600 };
}

/** Most a kart pitches into a turn (FIX4 W5): 18°. */
export const KART_PITCH_MAX = (18 * Math.PI) / 180;
/** A kart turning round flips facing inside this window (ms): two keys, ±1 either side (the engine crossfades). */
export const KART_FLIP_MS = 120;
const KART_START = 450, KART_LAP = 4300;

/**
 * A kart's lap of a perspective oval (stage units: half axes rx, ry × lane): right along the near side (big), left
 * along the far side (smaller). Its heading follows the oval, pitched at most 18°; it faces the way it drives, and
 * where it turns round its facing flips between two keys KART_FLIP_MS apart (sx is always ±1 at a key, never a
 * squash through 0: the engine crossfades a left- and a right-facing sampling there).
 */
export function kartLap(box: StageBox, ms: number, o: { lag: number; scale: number; lane: number; rx: number; ry: number }): Path {
  const w = (Math.PI * 2) / KART_LAP;
  const th = (t: number): number => -0.75 + Math.max(0, t - KART_START) * w - o.lag;
  const pose = (t: number, face: number): PathKey => {
    const a = th(t);
    const x = o.rx * o.lane * Math.sin(a), y = o.ry * o.lane * Math.cos(a);
    // the heading on screen (px), as a pitch of the side-on glyph: nose down when it drives down the screen
    const dx = o.rx * Math.cos(a) * (box.w / 2), dy = -o.ry * Math.sin(a) * (box.h / 2);
    const pitch = Math.max(-KART_PITCH_MAX, Math.min(KART_PITCH_MAX, Math.atan2(dy, Math.abs(dx))));
    return at(t, x, y, { scale: o.scale * (0.82 + 0.18 * Math.cos(a)), sx: face, rot: pitch * face, ease: 'linear' });
  };
  const faceAt = (t: number): number => (Math.cos(th(t)) >= 0 ? 1 : -1);
  // where it turns round: cos(th) crosses 0
  const flips: number[] = [];
  for (let k = -4; k <= 8; k++) {
    const tc = KART_START + (Math.PI / 2 + k * Math.PI + 0.75 + o.lag) / w;
    if (tc > KART_START + KART_FLIP_MS / 2 && tc < ms - KART_FLIP_MS / 2) flips.push(tc);
  }
  const half = KART_FLIP_MS / 2;
  const out: Path = [];
  for (let t = 0; t <= ms; t += 60) if (!flips.some((tc) => Math.abs(t - tc) <= half)) out.push(pose(t, faceAt(t)));
  for (const tc of flips) out.push(pose(tc - half, faceAt(tc - half)), pose(tc + half, faceAt(tc + half)));
  return out.sort((p, q) => p.t - q.t);
}

/** A thin dotted oval (the track) for the canvas2d kart: an ellipse outline through (±rx, 0) and (0, ±ry), in dashes. */
const ringShape = (rx: number, ry: number): SceneShape => ({ kind: 'bar', oval: true, dashes: 36, thickness: 4, w: rx, h: ry });

/**
 * 4: the kart drives (FIX4 W5). Three karts a third of a lap apart (so they never overlap) on a perspective oval;
 * each turns round by flipping its facing, never by mirroring through 0. canvas2d (a few thousand big dots):
 * one big kart on a visible track, a thin dotted ring with a tenth of the particles, so "a kart on a track" reads.
 */
function kartScene(box: StageBox, ms: number): Scene {
  const wide = box.w / box.h > 1;
  const kw = Math.min(box.w * (wide ? 0.32 : 0.4), box.h * 0.45);
  const s0 = scaleForW(box, AR.kart, kw);
  const rx = 1 - ux(box, kw / 2) - 0.08, ry = wide ? 0.56 : 0.6;
  const third = (Math.PI * 2) / 3;
  const kart = (lag: number, scale: number, share: number, trail: number, lane: number): SceneGroup => ({
    shape: glyph('kart'), share, path: kartLap(box, ms, { lag, scale, lane, rx, ry }), trail, trailMs: 520, brightness: lag ? 0.85 : 1.05,
  });
  // canvas2d: one big kart riding a dotted track (its wheels on the ring)
  // (a tall desktop column too: a flat oval, wider than it is tall, reads as a track seen from above-ish)
  const lw = wide ? Math.min(box.w * 0.4, box.h * 0.55) : Math.min(box.w * 0.42, box.h * 0.34);
  const lrx = 1 - ux(box, lw / 2) - 0.06, lry = wide ? 0.5 : 0.26;
  const wheels = uy(box, (lw / AR.kart) * 0.38);
  const lite: Scene = {
    duration: ms, tableau: 1500,
    groups: [
      { shape: ringShape(lrx, lry), share: 0.1, path: [at(0, 0, wheels)], brightness: 0.6 },
      { shape: glyph('kart'), share: 0.9, path: kartLap(box, ms, { lag: 0, scale: scaleForW(box, AR.kart, lw), lane: 1, rx: lrx, ry: lry }), brightness: 1 },
    ],
  };
  return {
    duration: ms, tableau: 1500, lite,
    groups: [kart(0, s0, 0.5, 0.3, 1), kart(third, s0 * 0.6, 0.25, 0.26, 0.92), kart(2 * third, s0 * 0.6, 0.25, 0.26, 0.92)],
  };
}

/** 5: a loop spins slowly; three PRs stack to its right, each gets a check that pops; the last one merges into the loop. */
function loopScene(box: StageBox, ms: number): Scene {
  const wide = box.w / box.h > 1;
  const loopW = Math.min(box.w * (wide ? 0.3 : 0.3), box.h * 0.42);
  const ls = scaleForW(box, AR.loop, loopW);
  const lx = wide ? -0.56 : -0.5;
  const cardW = box.w * (wide ? 0.46 : 0.5), cardH = Math.min(box.h * (wide ? 0.2 : 0.16), cardW * 0.34);
  const cx = lx + ux(box, loopW / 2 + box.w * 0.05 + cardW / 2);
  const gap = uy(box, cardH + box.h * (wide ? 0.08 : 0.06));
  const checkW = cardH * 0.62;
  const card: SceneShape = {
    kind: 'parts',
    parts: [
      { shape: { kind: 'bar', w: cardW / box.w, h: cardH / box.h, thickness: 7 }, share: 0.5 },
      { shape: { kind: 'rect', w: (cardW * 0.46) / box.w, h: (cardH * 0.13) / box.h }, share: 0.13, x: ux(box, -cardW * 0.39 + cardW * 0.23), y: uy(box, -cardH * 0.14), reveal: 'x' },
      { shape: { kind: 'rect', w: (cardW * 0.3) / box.w, h: (cardH * 0.13) / box.h }, share: 0.09, x: ux(box, -cardW * 0.39 + cardW * 0.15), y: uy(box, cardH * 0.17), reveal: 'x' },
      { shape: glyph('check'), share: 0.28, x: ux(box, cardW * 0.33), scale: scaleForW(box, AR.check, checkW) },
    ],
  };
  const CHECK_FROM = 0.72; // fill at which a card's outline and lines are in and its check is not
  const pr = (k: number, merges = k === 2): SceneGroup => {
    const y = (k - 1) * gap, t0 = 350 + k * 650, tc = t0 + 1000;
    const path: Path = [at(0, cx + 0.35, y, { scale: 0.9 }), at(t0, cx + 0.35, y, { scale: 0.9 }), at(t0 + 450, cx, y, { scale: 1, ease: 'out' })];
    const fill: Keys = keys([0, 0], [t0, 0], [t0 + 150, 0.5], [t0 + 800, CHECK_FROM], [tc, CHECK_FROM], [tc + 60, 1]);
    const brightness: Keys = keys([0, 1], [tc, 1], [tc + 80, 1.55], [tc + 500, 1]);
    if (merges) {
      // merges: slides into the loop and is taken in
      path.push(at(tc + 650, cx, y, { scale: 1 }), at(tc + 1500, lx, 0, { scale: 0.16, ease: 'in' }));
      fill.push({ t: tc + 1300, v: 1 }, { t: tc + 1550, v: 0 });
    }
    return { shape: card, share: 0.18, path, fill, brightness };
  };
  const spin: Path = [at(0, lx, 0, { scale: ls, rot: 0 }), at(ms, lx, 0, { scale: ls, rot: Math.PI * 1.25, ease: 'linear' })];
  // the loop flares as the merging PR is taken in
  const loopFor = (mk: number): SceneGroup => {
    const merged = 350 + mk * 650 + 1000 + 1500;
    return { shape: glyph('loop'), share: 0.46, path: spin, brightness: keys([0, 1], [merged - 100, 1], [merged + 50, 1.5], [merged + 700, 1.05]) };
  };
  const loop = loopFor(2);
  const lite: Scene = {
    duration: ms,
    groups: [loopFor(1), pr(0), pr(1, true)],
    tableau: 2500,
  };
  return { duration: ms, groups: [loop, pr(0), pr(1), pr(2)], lite, tableau: 3200 };
}

// ---------------------------------------------------------------- the steps

export type SceneRef = (box: StageBox) => Scene;

/** A caption beat: typed in with the scene's start, held for `ms` (the runner moves on after it). */
const cap = (say: string, ms: number, b: Omit<BeatSpec, 'say'> = {}): Omit<Step, 'at'> => ({ ...beat({ ...b, say, sync: true, captionHold: ms }) });
const line = (k: number, ms: number, b: Omit<BeatSpec, 'say'> = {}): Omit<Step, 'at'> => cap(SHOW_LINES[k]!, ms, b);
const part = (ms: number, b: Omit<BeatSpec, 'say' | 'hold'>): Omit<Step, 'at'> => beat({ ...b, hold: ms });
/** Scene 6: btc → the yoyo wordmark → the cap, each with its own short caption. */
const scene6 = (): Omit<Step, 'at'>[] => SCENE6_LINES.map((say, k) => cap(say, SCENE6_MS[k]!, { become: { kind: 'glyph', id: SCENE6_GLYPHS[k]! } }));

/** The show's steps. `reduced`: one still tableau a scene (scene 6: one a shape), stepped by click. */
export function showSteps(reduced = false): Step[] {
  const [s1, s2, s3, s4, s5, , s7] = SCENE_MS;
  if (reduced) {
    return seq([
      line(0, s1, { perform: (b) => cursorScene(b, s1), mood: 'speaking', chips: ENTRY_CHIPS }),
      line(1, s2, { perform: (b) => agentsScene(b, s2) }),
      line(2, s3, { perform: (b) => searchScene(b, s3) }),
      line(3, s4, { perform: (b) => kartScene(b, s4) }),
      line(4, s5, { perform: (b) => loopScene(b, s5) }),
      ...scene6(),
      line(6, s7, { become: { kind: 'glyph', id: 'question' }, chips: ENTRY_CHIPS }),
    ]);
  }
  return seq([
    // the letters dissolved at the entry: the show opens on the cursor, straight from the idle wave (FIX4 W4)
    line(0, s1, { perform: (b) => cursorScene(b, s1), mood: 'speaking', chips: ENTRY_CHIPS }),
    line(1, 1300, { become: { kind: 'glyph', id: 'keyboard' } }),
    part(s2 - 1300, { perform: (b) => agentsScene(b, s2 - 1300) }),
    line(2, s3, { perform: (b) => searchScene(b, s3) }),
    line(3, s4, { perform: (b) => kartScene(b, s4) }),
    line(4, s5, { perform: (b) => loopScene(b, s5) }),
    ...scene6(),
    line(6, 2900, { become: { kind: 'glyph', id: 'question' }, chips: ENTRY_CHIPS }),
    part(s7 - 2900, { release: true }),
  ]);
}

/** QA: the scenes a box gets. */
export const SCENES = { cursorScene, agentsScene, searchScene, kartScene, loopScene };
