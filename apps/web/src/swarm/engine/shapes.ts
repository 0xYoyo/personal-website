import type { GlyphId, ShapeSpec } from '@yoyo/protocol';
import { hashString, knitDelay, rng } from './hash';
import { loadGlyphSvg } from './glyphs';

/** Exactly n targets. pos = [x, y, z, knitDelay] per particle (world px, origin = viewport centre, y up). */
export interface Targets {
  n: number;
  pos: Float32Array;
  /** [r, g, b, colorful] per particle, sRGB 0..1; colorful = 0 → use the scene's particle colour. */
  col: Float32Array;
  colored: boolean;
  /** shape centre (world px) */
  cx: number; cy: number;
  /** 3D shape that sways around Y while held */
  spin: boolean;
}

export interface Viewport {
  w: number; h: number;
  /**
   * Optional stage (CSS px, viewport coords): shapes are fitted into this box (minus a margin) instead of the
   * whole viewport, so they never sit under the agent's words. Frames ignore it (they have their own rect).
   */
  stage?: { x: number; y: number; w: number; h: number } | null;
  /**
   * The 2D tier (POLISH2 B5): shapes are sampled edge-weighted (EDGE_SHARE on a thin outline) so complex glyphs
   * read at 3k dots, and YOYO is extruded from the 2D font mask instead of three.js (no GPU chunk on tier 0).
   */
  lite?: boolean;
}

/** Share of a lite shape's targets on its outline (60 / 40 fill / edge). */
export const EDGE_SHARE = 0.4;

/** World-space centre (origin = viewport centre, y up) of the stage, or of the viewport when there is none. */
export function stageCentre(vp: Viewport): { x: number; y: number } {
  const s = vp.stage;
  return s ? { x: s.x + s.w / 2 - vp.w / 2, y: vp.h / 2 - (s.y + s.h / 2) } : { x: 0, y: 0 };
}

export const DISPLAY_FONT = 'Bricolage Grotesque Swarm';
const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla",sans-serif';

export function emptyTargets(n: number): Targets {
  return { n, pos: new Float32Array(n * 4), col: new Float32Array(n * 4), colored: false, cx: 0, cy: 0, spin: false };
}

// ---------------------------------------------------------------- pure sampling (unit-tested)

export interface MaskSample { x: Float32Array; y: Float32Array; filled: number }

/**
 * Sample exactly n points inside a mask (alpha ≥ threshold) with jittered-grid blue-noise:
 * the grid pitch is chosen so the expected hit count is n, then the result is thinned or topped up.
 */
export function sampleMask(alpha: Uint8ClampedArray | Uint8Array, stride: number, w: number, h: number, n: number, seed = 1, threshold = 128): MaskSample {
  const r = rng(seed);
  let filled = 0;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[(y * w + x) * stride]! >= threshold) { filled++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const xs = new Float32Array(n), ys = new Float32Array(n);
  if (filled === 0 || n === 0) {
    for (let i = 0; i < n; i++) { xs[i] = w / 2 + (r() - 0.5) * 4; ys[i] = h / 2 + (r() - 0.5) * 4; }
    return { x: xs, y: ys, filled };
  }
  const inside = (x: number, y: number): boolean => {
    const ix = x | 0, iy = y | 0;
    return ix >= 0 && iy >= 0 && ix < w && iy < h && alpha[(iy * w + ix) * stride]! >= threshold;
  };
  const pitch = Math.sqrt(filled / n);
  const hx: number[] = [], hy: number[] = [];
  for (let gy = y0; gy <= y1 + 1; gy += pitch) for (let gx = x0; gx <= x1 + 1; gx += pitch) {
    const px = gx + r() * pitch, py = gy + r() * pitch;
    if (inside(px, py)) { hx.push(px); hy.push(py); }
  }
  let m = hx.length;
  if (m === 0) { // pitch larger than the shape: fall back to rejection sampling
    while (hx.length < n) { const px = x0 + r() * (x1 - x0 + 1), py = y0 + r() * (y1 - y0 + 1); if (inside(px, py)) { hx.push(px); hy.push(py); } }
    m = hx.length;
  }
  // shuffle (also randomises particle → target assignment)
  for (let i = m - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [hx[i], hx[j]] = [hx[j]!, hx[i]!]; [hy[i], hy[j]] = [hy[j]!, hy[i]!]; }
  for (let i = 0; i < n; i++) {
    if (i < m) { xs[i] = hx[i]!; ys[i] = hy[i]!; continue; }
    // top up: duplicate a hit with sub-pitch jitter, staying inside the mask
    const k = Math.floor(r() * m);
    let px = hx[k]!, py = hy[k]!;
    for (let t = 0; t < 6; t++) { const qx = hx[k]! + (r() - 0.5) * pitch, qy = hy[k]! + (r() - 0.5) * pitch; if (inside(qx, qy)) { px = qx; py = qy; break; } }
    xs[i] = px; ys[i] = py;
  }
  return { x: xs, y: ys, filled };
}

/** Outline of a mask: filled pixels with an unfilled pixel within `r` (4 directions). One byte per pixel. */
export function edgeMask(alpha: Uint8ClampedArray | Uint8Array, stride: number, w: number, h: number, threshold = 128, r = 2): Uint8Array {
  const out = new Uint8Array(w * h);
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * stride]! >= threshold;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    let e = false;
    for (let d = 1; d <= r && !e; d++) e = !on(x + d, y) || !on(x - d, y) || !on(x, y + d) || !on(x, y - d);
    if (e) out[y * w + x] = 255;
  }
  return out;
}

/** sampleMask with `edgeShare` of the n points on the mask's outline (the rest fill it), shuffled together. */
export function sampleMaskEdged(alpha: Uint8ClampedArray | Uint8Array, stride: number, w: number, h: number, n: number, seed = 1, threshold = 128, edgeShare = EDGE_SHARE): MaskSample {
  const edge = edgeMask(alpha, stride, w, h, threshold);
  const ne = Math.round(n * edgeShare);
  const a = sampleMask(alpha, stride, w, h, n - ne, seed, threshold);
  if (a.filled === 0) return sampleMask(alpha, stride, w, h, n, seed, threshold);
  const b = sampleMask(edge, 1, w, h, ne, seed ^ 0x2545f491, 128);
  const xs = new Float32Array(n), ys = new Float32Array(n);
  xs.set(a.x); ys.set(a.y); xs.set(b.x, n - ne); ys.set(b.y, n - ne);
  const r = rng(seed * 7 + 3);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tx = xs[i]!, ty = ys[i]!; xs[i] = xs[j]!; ys[i] = ys[j]!; xs[j] = tx; ys[j] = ty; }
  return { x: xs, y: ys, filled: a.filled };
}

const sampleFor = (vp: Viewport): typeof sampleMask => (vp.lite ? sampleMaskEdged : sampleMask);

export interface Fit { maxW: number; maxH: number; cx: number; cy: number; depth: number }

/** Map mask-pixel samples into world targets fitted into a box. Optionally samples RGBA colours. */
export function samplesToTargets(s: MaskSample, maskW: number, maskH: number, fit: Fit, seed: number, rgba?: Uint8ClampedArray): Targets {
  const n = s.x.length;
  const t = emptyTargets(n);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { x0 = Math.min(x0, s.x[i]!); x1 = Math.max(x1, s.x[i]!); y0 = Math.min(y0, s.y[i]!); y1 = Math.max(y1, s.y[i]!); }
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const scale = Math.min(fit.maxW / bw, fit.maxH / bh);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const r = rng(seed ^ 0x5bd1e995);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    t.pos[o] = fit.cx + (s.x[i]! - mx) * scale;
    t.pos[o + 1] = fit.cy - (s.y[i]! - my) * scale;
    t.pos[o + 2] = (r() + r() - 1) * fit.depth;
    t.pos[o + 3] = knitDelay(i, (s.x[i]! - x0) / bw);
  }
  if (rgba) {
    t.colored = true;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const ix = Math.min(maskW - 1, Math.max(0, s.x[i]! | 0)), iy = Math.min(maskH - 1, Math.max(0, s.y[i]! | 0));
      const p = (iy * maskW + ix) * 4;
      t.col[o] = rgba[p]! / 255;
      t.col[o + 1] = rgba[p + 1]! / 255;
      t.col[o + 2] = rgba[p + 2]! / 255;
      t.col[o + 3] = 1;
    }
  }
  t.cx = fit.cx; t.cy = fit.cy;
  return t;
}

/** Thin or repeat a point list to exactly n (used for 3D samples and baked clouds). */
export function resampleToN(src: Float32Array, stride: number, n: number, seed = 7): Float32Array {
  const m = Math.floor(src.length / stride);
  const out = new Float32Array(n * stride);
  if (m === 0) return out;
  const r = rng(seed);
  const idx = Array.from({ length: m }, (_, i) => i);
  for (let i = m - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
  for (let i = 0; i < n; i++) {
    const k = i < m ? idx[i]! : idx[Math.floor(r() * m)]!;
    for (let c = 0; c < stride; c++) out[i * stride + c] = src[k * stride + c]!;
  }
  return out;
}

/** Rounded-rect perimeter band: uniform by arc length, triangular across the thickness (soft edges). */
export function frameTargets(n: number, rect: { x: number; y: number; w: number; h: number }, vp: Viewport, thickness = 11, radius = 18, seed = 3): Targets {
  const t = emptyTargets(n);
  const r = rng(seed);
  const rad = Math.min(radius, rect.w / 2, rect.h / 2);
  const sw = rect.w - 2 * rad, sh = rect.h - 2 * rad, arc = (Math.PI / 2) * rad;
  const segs = [sw, arc, sh, arc, sw, arc, sh, arc];
  const total = segs.reduce((a, b) => a + b, 0);
  // world coords of rect (CSS px → world, y up)
  const L = rect.x - vp.w / 2, T = vp.h / 2 - rect.y, R = L + rect.w, B = T - rect.h;
  for (let i = 0; i < n; i++) {
    let s = ((i + r()) / n) * total; // stratified along the perimeter
    let k = 0;
    while (k < 7 && s > segs[k]!) { s -= segs[k]!; k++; }
    let x: number, y: number, nx: number, ny: number;
    const a = (s / Math.max(rad, 1e-3));
    switch (k) {
      case 0: x = L + rad + s; y = T; nx = 0; ny = 1; break;
      case 1: { const ang = Math.PI / 2 - a; x = R - rad + Math.cos(ang) * rad; y = T - rad + Math.sin(ang) * rad; nx = Math.cos(ang); ny = Math.sin(ang); break; }
      case 2: x = R; y = T - rad - s; nx = 1; ny = 0; break;
      case 3: { const ang = -a; x = R - rad + Math.cos(ang) * rad; y = B + rad + Math.sin(ang) * rad; nx = Math.cos(ang); ny = Math.sin(ang); break; }
      case 4: x = R - rad - s; y = B; nx = 0; ny = -1; break;
      case 5: { const ang = -Math.PI / 2 - a; x = L + rad + Math.cos(ang) * rad; y = B + rad + Math.sin(ang) * rad; nx = Math.cos(ang); ny = Math.sin(ang); break; }
      case 6: x = L; y = B + rad + s; nx = -1; ny = 0; break;
      default: { const ang = Math.PI - a; x = L + rad + Math.cos(ang) * rad; y = T - rad + Math.sin(ang) * rad; nx = Math.cos(ang); ny = Math.sin(ang); }
    }
    const off = (r() + r() - 1) * thickness * 0.5;
    // shuffle assignment: write to a random slot later
    t.pos[i * 4] = x + nx * off; t.pos[i * 4 + 1] = y + ny * off; t.pos[i * 4 + 2] = 0; t.pos[i * 4 + 3] = r() * 0.25;
  }
  shuffleTargets(t, seed);
  t.cx = (L + R) / 2; t.cy = (T + B) / 2;
  return t;
}

/** Soft ring (listening / construction). */
export function ringTargets(n: number, radius: number, thickness = 16, seed = 5, cx = 0, cy = 0): Targets {
  const t = emptyTargets(n);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = ((i + r()) / n) * Math.PI * 2;
    const rr = radius + (r() + r() - 1) * thickness * 0.5;
    t.pos[i * 4] = cx + Math.cos(a) * rr; t.pos[i * 4 + 1] = cy + Math.sin(a) * rr;
    t.pos[i * 4 + 2] = (r() - 0.5) * 16; t.pos[i * 4 + 3] = (a / (Math.PI * 2)) * 0.5 + r() * 0.3;
  }
  shuffleTargets(t, seed);
  t.cx = cx; t.cy = cy;
  return t;
}

function shuffleTargets(t: Targets, seed: number): void {
  const r = rng(seed * 31 + 1);
  const p = t.pos, c = t.col;
  for (let i = t.n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    for (let k = 0; k < 4; k++) {
      const a = p[i * 4 + k]!; p[i * 4 + k] = p[j * 4 + k]!; p[j * 4 + k] = a;
      const b = c[i * 4 + k]!; c[i * 4 + k] = c[j * 4 + k]!; c[j * 4 + k] = b;
    }
  }
}

// ---------------------------------------------------------------- canvas rasterisation

function makeCanvas(w: number, h: number): { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) return { ctx };
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  return { ctx };
}

function wrapText(text: string): string[] {
  const t = text.trim();
  if (t.length <= 12 || !t.includes(' ')) return [t];
  const words = t.split(/\s+/);
  let best = [t], bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore) { bestScore = score; best = [a, b]; }
  }
  return best;
}

export function fitFor(kind: 'text' | 'emoji' | 'glyph' | 'yoyo3d', vp: Viewport, lines = 1): Fit {
  const portrait = vp.h > vp.w;
  const depth = 18;
  const st = vp.stage;
  if (st && st.w > 40 && st.h > 40) {
    // map the shape's bounding box into the stage, inset by a margin
    const m = Math.min(st.w, st.h) * 0.07 + 8;
    const w = st.w - 2 * m, h = st.h - 2 * m;
    const { x: cx, y: cy } = stageCentre(vp);
    switch (kind) {
      case 'text': return { maxW: w, maxH: h * (lines > 1 ? 0.8 : 0.5), cx, cy, depth };
      case 'emoji': return { maxW: w * 0.9, maxH: h * 0.8, cx, cy, depth };
      case 'glyph': return { maxW: w * 0.9, maxH: h * 0.8, cx, cy, depth };
      case 'yoyo3d': return { maxW: w, maxH: h * 0.55, cx, cy, depth };
    }
  }
  switch (kind) {
    case 'text': return { maxW: vp.w * (portrait ? 0.86 : 0.74), maxH: vp.h * (lines > 1 ? 0.46 : 0.3), cx: 0, cy: vp.h * 0.06, depth };
    case 'emoji': return { maxW: vp.w * 0.6, maxH: vp.h * 0.46, cx: 0, cy: vp.h * 0.05, depth };
    case 'glyph': return { maxW: vp.w * 0.6, maxH: vp.h * 0.5, cx: 0, cy: vp.h * 0.05, depth };
    case 'yoyo3d': return { maxW: vp.w * (portrait ? 0.86 : 0.62), maxH: vp.h * 0.34, cx: 0, cy: vp.h * 0.08, depth };
  }
}

export function textTargets(text: string, n: number, vp: Viewport, depthMul = 1): Targets {
  const lines = wrapText(text);
  const fs = 220;
  const font = `800 ${fs}px "${DISPLAY_FONT}", "Arial Black", system-ui, sans-serif`;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = font;
  const widths = lines.map((l) => probe.measureText(l).width);
  const W = Math.ceil(Math.max(...widths) + fs * 0.4), H = Math.ceil(lines.length * fs * 1.05 + fs * 0.4);
  const { ctx } = makeCanvas(W, H);
  ctx.font = font; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, fs * 0.2 + fs * 1.05 * (i + 0.5)));
  const img = ctx.getImageData(0, 0, W, H);
  const seed = hashString('text:' + text);
  const s = sampleFor(vp)(img.data.subarray(3), 4, W, H, n, seed);
  const fit = fitFor('text', vp, lines.length); fit.depth *= depthMul;
  return samplesToTargets(s, W, H, fit, seed);
}

export function emojiTargets(emoji: string, n: number, vp: Viewport, depthMul = 1): Targets {
  const S = 360;
  const { ctx } = makeCanvas(S, S);
  ctx.font = `${Math.round(S * 0.78)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, S / 2, S * 0.54);
  const img = ctx.getImageData(0, 0, S, S);
  const seed = hashString('emoji:' + emoji);
  const s = sampleFor(vp)(img.data.subarray(3), 4, S, S, n, seed, 140);
  const fit = fitFor('emoji', vp); fit.depth *= depthMul;
  return samplesToTargets(s, S, S, fit, seed, img.data);
}

export async function svgTargets(svg: string, n: number, vp: Viewport, key: string, depthMul = 1): Promise<Targets> {
  const S = 420;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const { ctx } = makeCanvas(S, S);
    const iw = img.naturalWidth || S, ih = img.naturalHeight || S;
    const k = Math.min((S * 0.92) / iw, (S * 0.92) / ih);
    ctx.drawImage(img, (S - iw * k) / 2, (S - ih * k) / 2, iw * k, ih * k);
    const data = ctx.getImageData(0, 0, S, S);
    const seed = hashString('glyph:' + key);
    const s = sampleFor(vp)(data.data.subarray(3), 4, S, S, n, seed, 110);
    const fit = fitFor('glyph', vp); fit.depth *= depthMul;
    return samplesToTargets(s, S, S, fit, seed);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function glyphTargets(id: GlyphId | string, n: number, vp: Viewport, depthMul = 1): Promise<Targets> {
  if (id === 'yoyo') return yoyo3dTargets(n, vp);
  const svg = await loadGlyphSvg(id);
  if (!svg) return textTargets('?', n, vp, depthMul);
  return svgTargets(svg, n, vp, id, depthMul);
}

let typeface: Promise<unknown> | null = null;
/** The extruded-letter typeface (scripts: tools/make-typeface.mjs) is a static asset, fetched once on first use. */
function loadTypeface(): Promise<unknown> {
  typeface ??= fetch(`${import.meta.env.BASE_URL}fonts/bricolage-bold.typeface.json`).then((r) => {
    if (!r.ok) throw new Error(`typeface ${r.status}`);
    return r.json() as Promise<unknown>;
  });
  typeface.catch(() => { typeface = null; });
  return typeface;
}

let yoyoCache: { n: number; key: string; t: Targets } | null = null;
const vpKey = (vp: Viewport): string => `${vp.w}x${vp.h}:${vp.stage ? `${vp.stage.x},${vp.stage.y},${vp.stage.w},${vp.stage.h}` : '-'}:${vp.lite ? 'lite' : 'mesh'}`;

/**
 * Extruded "YOYO": on GPU tiers, the Bricolage Grotesque 800 typeface extruded and sampled on its surface with
 * MeshSurfaceSampler (three.js, lazy); on the 2D tier (vp.lite) the same letters from the 2D font mask, extruded
 * by hand (front / back faces + the outline swept through the depth), so tier 0 never fetches the three.js chunk.
 */
export async function yoyo3dTargets(n: number, vp: Viewport): Promise<Targets> {
  if (yoyoCache && yoyoCache.n === n && yoyoCache.key === vpKey(vp)) return yoyoCache.t;
  const t = vp.lite ? yoyoMaskTargets(n, vp) : await yoyoMeshTargets(n, vp);
  yoyoCache = { n, key: vpKey(vp), t };
  return t;
}

/** Share of the 2D-extruded YOYO's points on the front face, the back face and the sides. */
export const YOYO_FACES = { front: 0.42, back: 0.16, sides: 0.42 } as const;

/** Extrude a mask sample by hand: front / back faces from `face`, the sides from `edge` spread through ±depth. */
export function extrudeSamples(face: MaskSample, edge: MaskSample, n: number, halfDepth: number, seed = 0x7070): { x: Float32Array; y: Float32Array; z: Float32Array } {
  const nf = Math.round(n * YOYO_FACES.front), nb = Math.round(n * YOYO_FACES.back);
  const r = rng(seed);
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < nf + nb) { const k = i % face.x.length; x[i] = face.x[k]!; y[i] = face.y[k]!; z[i] = i < nf ? halfDepth : -halfDepth; }
    else { const k = (i - nf - nb) % Math.max(edge.x.length, 1); x[i] = edge.x[k] ?? 0; y[i] = edge.y[k] ?? 0; z[i] = (r() * 2 - 1) * halfDepth; }
  }
  return { x, y, z };
}

function yoyoMaskTargets(n: number, vp: Viewport): Targets {
  const fs = 220;
  const font = `800 ${fs}px "${DISPLAY_FONT}", "Arial Black", system-ui, sans-serif`;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = font;
  const W = Math.ceil(probe.measureText('YOYO').width + fs * 0.4), H = Math.ceil(fs * 1.4);
  const { ctx } = makeCanvas(W, H);
  ctx.font = font; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText('YOYO', W / 2, H / 2);
  const a = ctx.getImageData(0, 0, W, H).data.subarray(3);
  const nf = Math.round(n * YOYO_FACES.front);
  const face = sampleMask(a, 4, W, H, nf, 0x7071);
  const edge = sampleMask(edgeMask(a, 4, W, H), 1, W, H, n - nf - Math.round(n * YOYO_FACES.back), 0x7072);
  // the mesh YOYO is 34 deep at size 100 → ~0.34 × the font size
  const e = extrudeSamples(face, edge, n, fs * 0.17);
  const fit = fitFor('yoyo3d', vp);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < face.x.length; i++) { x0 = Math.min(x0, face.x[i]!); x1 = Math.max(x1, face.x[i]!); y0 = Math.min(y0, face.y[i]!); y1 = Math.max(y1, face.y[i]!); }
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const scale = Math.min(fit.maxW / bw, fit.maxH / bh), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const t = emptyTargets(n);
  for (let i = 0; i < n; i++) {
    t.pos[i * 4] = fit.cx + (e.x[i]! - mx) * scale;
    t.pos[i * 4 + 1] = fit.cy - (e.y[i]! - my) * scale;
    t.pos[i * 4 + 2] = e.z[i]! * scale;
    t.pos[i * 4 + 3] = knitDelay(i, (e.x[i]! - x0) / bw);
  }
  t.cx = fit.cx; t.cy = fit.cy; t.spin = true;
  return t;
}

async function yoyoMeshTargets(n: number, vp: Viewport): Promise<Targets> {
  const [THREE, { FontLoader }, { TextGeometry }, { MeshSurfaceSampler }, fontJson] = await Promise.all([
    import('three/webgpu'),
    import('three/addons/loaders/FontLoader.js'),
    import('three/addons/geometries/TextGeometry.js'),
    import('three/addons/math/MeshSurfaceSampler.js'),
    loadTypeface(),
  ]);
  const font = new FontLoader().parse(fontJson as never);
  const geo = new TextGeometry('YOYO', { font, size: 100, depth: 34, curveSegments: 10, bevelEnabled: true, bevelThickness: 3, bevelSize: 2, bevelSegments: 2 });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(mesh);
  (sampler as unknown as { setRandomGenerator(f: () => number): void }).setRandomGenerator(rng(0x7070));
  sampler.build();
  const fit = fitFor('yoyo3d', vp);
  const bw = bb.max.x - bb.min.x, bh = bb.max.y - bb.min.y;
  const scale = Math.min(fit.maxW / bw, fit.maxH / bh);
  const mx = (bb.min.x + bb.max.x) / 2, my = (bb.min.y + bb.max.y) / 2, mz = (bb.min.z + bb.max.z) / 2;
  const t = emptyTargets(n);
  const v = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    sampler.sample(v, nrm);
    t.pos[i * 4] = fit.cx + (v.x - mx) * scale;
    t.pos[i * 4 + 1] = fit.cy + (v.y - my) * scale;
    t.pos[i * 4 + 2] = (v.z - mz) * scale;
    t.pos[i * 4 + 3] = knitDelay(i, (v.x - bb.min.x) / bw);
  }
  geo.dispose();
  t.cx = fit.cx; t.cy = fit.cy; t.spin = true;
  return t;
}

/** Resolve any ShapeSpec to targets (async for glyphs and 3D). `null` for kind 'none'. */
export async function shapeTargets(spec: ShapeSpec, n: number, vp: Viewport, depthMul = 1): Promise<Targets | null> {
  switch (spec.kind) {
    case 'text': return textTargets(spec.text, n, vp, depthMul);
    case 'emoji': return emojiTargets(spec.emoji, n, vp, depthMul);
    case 'glyph': return glyphTargets(spec.id, n, vp, depthMul);
    case 'yoyo3d': return yoyo3dTargets(n, vp);
    case 'frame': return frameTargets(n, spec.rect, vp);
    case 'none': return null;
  }
}

/** Heuristic used by callers that get a bare string (e.g. "[[become:🚀]]"): emoji vs text. */
export function isEmoji(s: string): boolean {
  if (!/\p{Extended_Pictographic}/u.test(s)) return false;
  const rest = s.replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s/gu, '');
  return rest.length === 0;
}
