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

export interface Viewport { w: number; h: number }

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
  const s = sampleMask(img.data.subarray(3), 4, W, H, n, seed);
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
  const s = sampleMask(img.data.subarray(3), 4, S, S, n, seed, 140);
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
    const s = sampleMask(data.data.subarray(3), 4, S, S, n, seed, 110);
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

let yoyoCache: { n: number; w: number; h: number; t: Targets } | null = null;

/** Extruded "YOYO" (Bricolage Grotesque 800 typeface) sampled on its surface with MeshSurfaceSampler. */
export async function yoyo3dTargets(n: number, vp: Viewport): Promise<Targets> {
  if (yoyoCache && yoyoCache.n === n && yoyoCache.w === vp.w && yoyoCache.h === vp.h) return yoyoCache.t;
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
  yoyoCache = { n, w: vp.w, h: vp.h, t };
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
