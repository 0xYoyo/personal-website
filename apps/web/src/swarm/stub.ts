// A cheap 2D-canvas swarm (≈1.5k dots) that implements the full SwarmApi so the
// whole UI is testable before the real engine lands. The real engine replaces
// this module during integration through the same `createSwarm(canvas)` export.
//
// Behaviour kept deliberately close to SPEC §3.1 in spirit: idle drift around a
// flow field, a soft repulsion sphere around the pointer with velocity drag,
// shapes knitting in with a per-particle delay, moods, rect frames for UI, a
// brightness pulse per streamed word, light/dark scene, pause on hidden tab.

import type { GlyphId, Mood, Rect, ShapeSpec, SwarmHandle } from '@yoyo/protocol';

const DISPLAY = "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

/** Stand-in silhouettes for glyph ids until the glyph library lands (drawn as single characters). */
const GLYPH_STANDIN: Record<GlyphId, { ch: string; emoji?: boolean }> = {
  kart: { ch: '🏎️', emoji: true },
  magnifier: { ch: '🔍', emoji: true },
  loop: { ch: '🔁', emoji: true },
  cap: { ch: '🎓', emoji: true },
  tent: { ch: '⛺', emoji: true },
  chart: { ch: '📊', emoji: true },
  diverge: { ch: '📈', emoji: true },
  envelope: { ch: '✉️', emoji: true },
  'envelope-open': { ch: '📨', emoji: true },
  keyboard: { ch: '⌨️', emoji: true },
  cursor: { ch: '🖱️', emoji: true },
  wave: { ch: '👋', emoji: true },
  frame: { ch: '🪟', emoji: true },
  question: { ch: '?' },
  shield: { ch: '🛡️', emoji: true },
  route: { ch: '🗺️', emoji: true },
  btc: { ch: '₿', emoji: true },
  piano: { ch: '🎹', emoji: true },
  ramp: { ch: '📐', emoji: true },
  curls: { ch: '➰', emoji: true },
  heart: { ch: '❤️', emoji: true },
  star: { ch: '⭐', emoji: true },
  check: { ch: '✔️', emoji: true },
  yoyo: { ch: 'YOYO' },
};

type Scene = 'dark' | 'light';
const PALETTE: Record<Scene, { bg: string; p: [number, number, number]; fast: [number, number, number] }> = {
  dark: { bg: '#0B0A09', p: [244, 239, 230], fast: [157, 180, 255] },
  light: { bg: '#EDEAE3', p: [23, 20, 17], fast: [43, 75, 255] },
};

const TAU = Math.PI * 2;
const hash = (i: number): number => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Sampled {
  pts: Float32Array; // x,y pairs in CSS px
  rgb: Uint8ClampedArray | null; // per-target colors (emoji)
}

function shuffleInPlace(a: number[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
}

/** Rasterize text/emoji into `n` targets fitted inside `stage`. */
function sampleRaster(text: string, n: number, stage: Rect, opts: { emoji: boolean; extrude: boolean; keepColor: boolean }): Sampled {
  const W = Math.max(64, Math.floor(stage.w));
  const H = Math.max(64, Math.floor(stage.h));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const pts = new Float32Array(n * 2);
  if (!g) return { pts, rgb: null };
  const family = opts.emoji ? EMOJI : DISPLAY;
  let size = H * 0.8;
  g.font = `700 ${size}px ${family}`;
  const w0 = g.measureText(text).width || 1;
  size = Math.min(size, (size * W * 0.9) / w0);
  g.font = `700 ${size}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, W / 2, H / 2 + size * 0.04);
  const data = g.getImageData(0, 0, W, H).data;
  const step = Math.max(1, Math.round(Math.sqrt((W * H) / 30000)));
  const fill: number[] = [];
  const edge: number[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3]!);
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (at(x, y) <= 140) continue;
      const e = 2 * step;
      if (at(x - e, y) <= 140 || at(x + e, y) <= 140 || at(x, y - e) <= 140 || at(x, y + e) <= 140) edge.push(y * W + x);
      else fill.push(y * W + x);
    }
  }
  // outlines carry the read at low counts: ~55% of targets go to edges
  shuffleInPlace(edge);
  shuffleInPlace(fill);
  const nEdge = Math.min(edge.length, Math.round(n * 0.55));
  const cand = [...edge.slice(0, nEdge), ...fill, ...edge.slice(nEdge)];
  if (!cand.length) {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU;
      pts[i * 2] = stage.x + stage.w / 2 + Math.cos(t) * 60;
      pts[i * 2 + 1] = stage.y + stage.h / 2 + Math.sin(t) * 60;
    }
    return { pts, rgb: null };
  }
  const rgb = opts.keepColor ? new Uint8ClampedArray(n * 3) : null;
  const ext = opts.extrude ? Math.max(3, size * 0.05) : 0;
  for (let i = 0; i < n; i++) {
    const k = cand[i % cand.length]!;
    let x = (k % W) + (Math.random() - 0.5) * step;
    let y = Math.floor(k / W) + (Math.random() - 0.5) * step;
    // A quarter of the points become the extrusion of YOYO: offset and dimmer.
    if (ext && i % 4 === 3) {
      const d = Math.random() * ext;
      x += d;
      y += d * 0.8;
    }
    pts[i * 2] = stage.x + x;
    pts[i * 2 + 1] = stage.y + y;
    if (rgb) {
      rgb[i * 3] = data[k * 4]!;
      rgb[i * 3 + 1] = data[k * 4 + 1]!;
      rgb[i * 3 + 2] = data[k * 4 + 2]!;
    }
  }
  return { pts, rgb };
}

/** Targets along a rounded rect's perimeter with 8–14 px thickness. */
function samplePerimeter(rect: Rect, n: number, thickness = 10): Float32Array {
  const pts = new Float32Array(n * 2);
  const r = Math.min(14, rect.w / 2, rect.h / 2);
  const straightW = Math.max(0, rect.w - 2 * r);
  const straightH = Math.max(0, rect.h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const L = 2 * straightW + 2 * straightH + 4 * arc;
  // segments: top, TR arc, right, BR arc, bottom, BL arc, left, TL arc
  const segs: { len: number; at(s: number): [number, number, number, number] }[] = [
    { len: straightW, at: (s) => [rect.x + r + s, rect.y, 0, -1] },
    { len: arc, at: (s) => { const a = -Math.PI / 2 + s / r; return [rect.x + rect.w - r + Math.cos(a) * r, rect.y + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: straightH, at: (s) => [rect.x + rect.w, rect.y + r + s, 1, 0] },
    { len: arc, at: (s) => { const a = s / r; return [rect.x + rect.w - r + Math.cos(a) * r, rect.y + rect.h - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: straightW, at: (s) => [rect.x + rect.w - r - s, rect.y + rect.h, 0, 1] },
    { len: arc, at: (s) => { const a = Math.PI / 2 + s / r; return [rect.x + r + Math.cos(a) * r, rect.y + rect.h - r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
    { len: straightH, at: (s) => [rect.x, rect.y + rect.h - r - s, -1, 0] },
    { len: arc, at: (s) => { const a = Math.PI + s / r; return [rect.x + r + Math.cos(a) * r, rect.y + r + Math.sin(a) * r, Math.cos(a), Math.sin(a)]; } },
  ];
  for (let i = 0; i < n; i++) {
    let s = ((i + hash(i) * 0.5) / n) * L;
    let k = 0;
    while (k < segs.length - 1 && s > segs[k]!.len) {
      s -= segs[k]!.len;
      k++;
    }
    const [x, y, nx, ny] = segs[k]!.at(Math.min(s, segs[k]!.len));
    // Thickness straddles the edge, biased outward so the panel interior stays clean.
    const t = (hash(i * 7.3) - 0.12) * thickness;
    pts[i * 2] = x + nx * t;
    pts[i * 2 + 1] = y + ny * t;
  }
  return pts;
}

export function createSwarm(canvas: HTMLCanvasElement): SwarmHandle {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = innerWidth <= 720;
  let N = mobile ? 1100 : 1500;

  let dpr = Math.min(2, devicePixelRatio || 1);
  let vw = innerWidth;
  let vh = innerHeight;
  let stage: Rect = { x: 0, y: 0, w: vw, h: vh };

  let px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  let tx = new Float32Array(N), ty = new Float32Array(N), tw = new Float32Array(N), delay = new Float32Array(N);
  let col: Uint8ClampedArray | null = null;

  let scene: Scene = 'dark';
  let mood: Mood = 'idle';
  let shapeOn = false;
  let shapeT = 0; // seconds since shape set
  let frameOn = false;
  let frameRect: Rect | null = null;
  let frameProgress = 0;
  let pulseE = 0;
  let listen = 0;
  let celebrateT = 0;
  let excitedT = 0;
  let lastShape: ShapeSpec | null = null;
  let holdTimer = 0;

  let pX = -9999, pY = -9999, pVX = 0, pVY = 0, pT = 0;
  let raf = 0;
  let running = true;
  let last = performance.now();
  let fps = 60;
  let destroyed = false;

  function alloc(n: number) {
    N = n;
    px = new Float32Array(N); py = new Float32Array(N); vx = new Float32Array(N); vy = new Float32Array(N);
    tx = new Float32Array(N); ty = new Float32Array(N); tw = new Float32Array(N); delay = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Start collapsed into a single point of light at center (SPEC §2.1).
      const a = hash(i) * TAU;
      const r = hash(i + 0.5) * 2;
      px[i] = vw / 2 + Math.cos(a) * r;
      py[i] = vh / 2 + Math.sin(a) * r;
      delay[i] = hash(i * 3.7) * 0.9;
    }
  }
  alloc(N);

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    vw = innerWidth;
    vh = innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    if (lastShape && shapeOn) applyShape(lastShape, true);
  }
  resize();
  addEventListener('resize', resize);

  function onVis() {
    running = !document.hidden;
    if (running) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else cancelAnimationFrame(raf);
  }
  document.addEventListener('visibilitychange', onVis);

  function shapeStage(shape: ShapeSpec): Rect {
    if (shape.kind === 'yoyo3d') {
      const w = Math.min(vw * 0.86, 1100);
      const h = Math.min(vh * 0.34, w * 0.36);
      return { x: (vw - w) / 2, y: vh * 0.44 - h / 2, w, h };
    }
    const pad = 0.08;
    return { x: stage.x + stage.w * pad, y: stage.y + stage.h * pad, w: stage.w * (1 - 2 * pad), h: stage.h * (1 - 2 * pad) };
  }

  function applyShape(shape: ShapeSpec, keepPhase = false) {
    lastShape = shape;
    frameOn = false;
    if (shape.kind === 'none') {
      release();
      return;
    }
    let s: Sampled;
    const st = shapeStage(shape);
    switch (shape.kind) {
      case 'text': s = sampleRaster(shape.text, N, st, { emoji: false, extrude: false, keepColor: false }); break;
      case 'emoji': s = sampleRaster(shape.emoji, N, st, { emoji: true, extrude: false, keepColor: true }); break;
      case 'yoyo3d': s = sampleRaster('YOYO', N, st, { emoji: false, extrude: true, keepColor: false }); break;
      case 'glyph': {
        const sd = GLYPH_STANDIN[shape.id];
        s = sampleRaster(sd.ch, N, st, { emoji: !!sd.emoji, extrude: shape.id === 'yoyo', keepColor: false });
        break;
      }
      case 'frame': s = { pts: samplePerimeter(shape.rect, N), rgb: null }; break;
    }
    for (let i = 0; i < N; i++) {
      tx[i] = s.pts[i * 2]!;
      ty[i] = s.pts[i * 2 + 1]!;
    }
    col = s.rgb;
    shapeOn = true;
    if (!keepPhase) shapeT = 0;
    if (reduced) {
      for (let i = 0; i < N; i++) { px[i] = tx[i]!; py[i] = ty[i]!; vx[i] = 0; vy[i] = 0; tw[i] = 1; }
      draw();
    }
  }

  function become(shape: ShapeSpec, opts?: { hold?: number; depth?: number }) {
    clearTimeout(holdTimer);
    applyShape(shape);
    // Fonts may still be loading on the first call; resample once they are ready.
    if ((shape.kind === 'text' || shape.kind === 'yoyo3d') && document.fonts && !document.fonts.check(`700 40px ${DISPLAY}`)) {
      void document.fonts.ready.then(() => { if (lastShape === shape && shapeOn) applyShape(shape, true); });
    }
    if (opts?.hold && opts.hold > 0) holdTimer = window.setTimeout(release, opts.hold);
  }

  function release() {
    clearTimeout(holdTimer);
    shapeOn = false;
    frameOn = false;
    col = null;
    lastShape = null;
    if (reduced) draw();
  }

  function buildFrame(rect: Rect, progress: number) {
    frameRect = rect;
    frameProgress = Math.max(0, Math.min(1, progress));
    if (!frameOn) {
      const pts = samplePerimeter(rect, N);
      for (let i = 0; i < N; i++) { tx[i] = pts[i * 2]!; ty[i] = pts[i * 2 + 1]!; }
      frameOn = true;
      shapeOn = false;
      col = null;
      shapeT = 0;
    } else {
      const pts = samplePerimeter(rect, N);
      for (let i = 0; i < N; i++) { tx[i] = pts[i * 2]!; ty[i] = pts[i * 2 + 1]!; }
    }
    if (reduced) {
      const k = Math.floor(N * frameProgress);
      for (let i = 0; i < k; i++) { px[i] = tx[i]!; py[i] = ty[i]!; }
      draw();
    }
  }

  function tick(now: number) {
    if (!running || destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (!reduced) step(dt, now / 1000);
    draw();
    raf = requestAnimationFrame(tick);
  }

  function step(dt: number, t: number) {
    shapeT += dt;
    pulseE = Math.max(0, pulseE - dt * 5);
    if (celebrateT > 0) celebrateT -= dt;
    if (excitedT > 0) excitedT -= dt;
    // Pointer velocity decays when the pointer stops reporting.
    if (t - pT > 0.08) { pVX *= 0.85; pVY *= 0.85; }
    const cx = stage.x + stage.w / 2;
    const cy = stage.y + stage.h / 2;
    const k = frameOn ? Math.floor(N * frameProgress) : N;
    const drag = Math.pow(0.04, dt); // velocity damping per second
    for (let i = 0; i < N; i++) {
      let ax = 0;
      let ay = 0;
      const x = px[i]!;
      const y = py[i]!;
      const h = hash(i);
      const targeted = (shapeOn || (frameOn && i < k));
      // target weight ramps in with a per-particle delay, out on release
      const want = targeted && shapeT > delay[i]! * (frameOn ? 0.5 : 0.9) ? 1 : 0;
      tw[i] = tw[i]! + (want - tw[i]!) * Math.min(1, dt * (want ? 3.2 : 2));
      const w = tw[i]!;

      if (celebrateT > 0) {
        ax += (hash(i + Math.floor(t * 6)) - 0.5) * 9000;
        ay += (hash(i * 2 + Math.floor(t * 6)) - 0.5) * 9000;
      } else if (mood === 'thinking' && !targeted) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) + 1;
        const r0 = 60 + h * 50;
        ax += (-dy / d) * 900 - (dx / d) * (d - r0) * 6;
        ay += (dx / d) * 900 - (dy / d) * (d - r0) * 6;
      } else if ((mood === 'listening' || mood === 'building' || frameOn) && !targeted) {
        const rcx = frameOn && frameRect ? frameRect.x + frameRect.w / 2 : cx;
        const rcy = frameOn && frameRect ? frameRect.y + frameRect.h / 2 : cy;
        const dx = x - rcx, dy = y - rcy;
        const d = Math.hypot(dx, dy) + 1;
        const r0 = (frameOn && frameRect ? Math.min(frameRect.w, frameRect.h) * 0.22 : 90) + listen * 60 + h * 8;
        const spin = mood === 'listening' ? 160 : 520;
        ax += (-dy / d) * spin - (dx / d) * (d - r0) * 9;
        ay += (dx / d) * spin - (dy / d) * (d - r0) * 9;
      } else if (w < 0.99) {
        // idle murmuration: a slowly turning flow field plus a soft pull to the stage
        const fx = Math.sin(y * 0.0042 + t * 0.35 + h) + Math.cos(y * 0.011 - t * 0.2);
        const fy = Math.cos(x * 0.0038 - t * 0.3 + h * 2) + Math.sin(x * 0.009 + t * 0.25);
        ax += fx * 240 * (1 - w);
        ay += fy * 240 * (1 - w);
        const sx = vw * 0.5 - x;
        const sy = vh * 0.48 - y;
        ax += sx * 0.1 * (1 - w);
        ay += sy * 0.12 * (1 - w);
      }

      let gx = 0;
      let gy = 0;
      if (w > 0.001) {
        // knit toward the target: critically damped pull (position space), so shapes read fast
        const breathe = mood === 'speaking' ? Math.sin(t * 2.2 + h * 6) * 1.2 : 0;
        const k = 1 - Math.exp(-dt * 7.5 * w);
        gx = (tx[i]! + breathe - x) * k;
        gy = (ty[i]! + breathe - y) * k;
        ax *= 1 - w;
        ay *= 1 - w;
      }

      if (excitedT > 0.45) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy) + 1;
        ax += (dx / d) * 2600;
        ay += (dy / d) * 2600;
      }

      // pointer: repulsion sphere + velocity drag
      const qx = x - pX, qy = y - pY;
      const qd2 = qx * qx + qy * qy;
      const R = 110;
      if (qd2 < R * R) {
        const qd = Math.sqrt(qd2) + 0.5;
        const f = (1 - qd / R) * (shapeOn || frameOn ? 2400 : 3800);
        ax += (qx / qd) * f;
        ay += (qy / qd) * f;
        ax += pVX * 2.2 * (1 - qd / R);
        ay += pVY * 2.2 * (1 - qd / R);
      }

      vx[i] = (vx[i]! * (1 - w) + ax * dt) * drag + (gx / Math.max(dt, 1e-3)) * w * 0.12;
      vy[i] = (vy[i]! * (1 - w) + ay * dt) * drag + (gy / Math.max(dt, 1e-3)) * w * 0.12;
      px[i] = x + vx[i]! * dt * (1 - w * 0.88) + gx;
      py[i] = y + vy[i]! * dt * (1 - w * 0.88) + gy;
    }
  }

  function draw() {
    const pal = PALETTE[scene];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = pal.bg;
    g.fillRect(0, 0, vw, vh);
    const [pr, pg, pb] = pal.p;
    const [fr, fg, fb] = pal.fast;
    const boost = Math.min(1, pulseE);
    for (let i = 0; i < N; i++) {
      const h = hash(i);
      const sp = Math.min(1, Math.hypot(vx[i]!, vy[i]!) / 900);
      const size = (0.9 + h * 1.5) * (1 + boost * 0.35);
      const alpha = Math.min(1, 0.42 + h * 0.5 + boost * 0.3);
      let r = pr + (fr - pr) * sp, gg = pg + (fg - pg) * sp, b = pb + (fb - pb) * sp;
      if (col && shapeOn && tw[i]! > 0.3) { r = col[i * 3]!; gg = col[i * 3 + 1]!; b = col[i * 3 + 2]!; }
      g.globalAlpha = alpha;
      g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
      if (sp > 0.35) {
        // fast = thin streak along velocity
        g.save();
        g.translate(px[i]!, py[i]!);
        g.rotate(Math.atan2(vy[i]!, vx[i]!));
        g.fillRect(-size * 2.4, -size * 0.35, size * 4.8, size * 0.7);
        g.restore();
      } else {
        g.fillRect(px[i]! - size / 2, py[i]! - size / 2, size, size);
      }
    }
    g.globalAlpha = 1;
  }

  raf = requestAnimationFrame(tick);

  const api: SwarmHandle = {
    become,
    release,
    mood(m) {
      mood = m;
      if (m === 'celebrate') celebrateT = 3;
      if (m === 'excited') excitedT = 0.6;
    },
    buildFrame,
    pointer(x, y, dx, dy) {
      pX = x; pY = y; pVX = dx; pVY = dy; pT = performance.now() / 1000;
    },
    setScene(m) {
      scene = m;
      draw();
    },
    setQuality(tier) {
      const n = tier <= 0 ? 700 : tier === 1 ? 1100 : 1500;
      if (n !== N) { alloc(n); if (lastShape) applyShape(lastShape); }
    },
    setListeningLevel(l) {
      listen = Math.max(0, Math.min(1, l));
    },
    pulse(s = 0.6) {
      pulseE = Math.min(1.2, pulseE + s);
    },
    setStage(rect) {
      stage = rect;
      if (lastShape && shapeOn && lastShape.kind !== 'frame') applyShape(lastShape, true);
    },
    async playEntry(opts) {
      // Pour-in → YOYO (or the visitor's name) → hold → release.
      const name = opts?.name;
      await wait(reduced ? 0 : 300);
      become(name ? { kind: 'text', text: name } : { kind: 'yoyo3d' });
      await wait(reduced ? 1400 : 2100);
      release();
    },
    screenshot() {
      return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
    },
    stats() {
      return { fps: Math.round(fps), count: N, tier: 0, backend: 'canvas2d' };
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimeout(holdTimer);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    },
  };
  return api;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
