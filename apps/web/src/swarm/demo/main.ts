import { createSwarm, playEntry, availableGlyphs, isEmoji, detectBackend } from '../engine';
import type { Mood, Tier, GlyphId } from '../engine';

const q = new URLSearchParams(location.search);
const canvasEl = document.getElementById('swarm-canvas') as HTMLCanvasElement;
const panel = document.getElementById('swarm-panel') as HTMLElement;
const frameEl = document.getElementById('swarm-frame') as HTMLElement;
if (q.get('panel') === '0') panel.dataset.hidden = 'true';

const tierParam = q.get('tier');
const scene = (q.get('scene') as 'dark' | 'light') ?? 'dark';
document.body.dataset.scene = scene;

const swarm = await createSwarm(canvasEl, {
  scene,
  tier: tierParam !== null ? (Number(tierParam) as Tier) : undefined,
  adaptive: q.get('adaptive') !== '0',
  spawn: (q.get('spawn') as 'edges' | 'scatter') ?? 'scatter',
  reducedMotion: q.get('reduced') === '1' ? true : undefined,
  count: q.get('count') ? Number(q.get('count')) : undefined,
  backend: (q.get('backend') as 'webgpu' | 'webgl2' | null) ?? undefined,
});
const detected = await detectBackend();
Object.assign(window, { swarm, playEntry, detected });

// pointer → swarm (CSS px, velocity in px/s)
let lx = 0, ly = 0, lt = performance.now();
window.addEventListener('pointermove', (e) => {
  const now = performance.now(), dt = Math.max((now - lt) / 1000, 1 / 240);
  const vx = (e.clientX - lx) / dt, vy = (e.clientY - ly) / dt;
  lx = e.clientX; ly = e.clientY; lt = now;
  swarm.pointer(e.clientX, e.clientY, vx, vy);
});

// ---------------------------------------------------------------- panel
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  kids.forEach((k) => n.append(k));
  return n;
};
const row = (...kids: (Node | string)[]): HTMLDivElement => el('div', { className: 'swarm-demo-row' }, kids);
const btn = (label: string, fn: () => void): HTMLButtonElement => el('button', { type: 'button', textContent: label, onclick: fn });
const label = (t: string): HTMLSpanElement => el('span', { className: 'swarm-demo-label', textContent: t });

const stats = el('div', { className: 'swarm-demo-stats' });
panel.append(stats);

const moods: Mood[] = ['idle', 'listening', 'thinking', 'speaking', 'excited', 'building', 'celebrate', 'asleep'];
panel.append(label('mood'), row(...moods.map((m) => btn(m, () => swarm.mood(m)))));

const textIn = el('input', { type: 'text', value: 'Dana', ariaLabel: 'Text or emoji to become' });
const becomeText = (): void => {
  const v = textIn.value.trim();
  if (!v) return;
  swarm.become(isEmoji(v) ? { kind: 'emoji', emoji: v } : { kind: 'text', text: v });
};
textIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') becomeText(); });
panel.append(label('become'), row(textIn, btn('go', becomeText)));
panel.append(row(...['🚀', '❤️', '🌊', '🔥', '🍕'].map((e) => btn(e, () => swarm.become({ kind: 'emoji', emoji: e })))));

const glyphSel = el('select', { ariaLabel: 'Glyph' });
for (const g of availableGlyphs()) glyphSel.append(el('option', { value: g, textContent: g }));
panel.append(row(glyphSel, btn('glyph', () => swarm.become({ kind: 'glyph', id: glyphSel.value as GlyphId })), btn('yoyo3d', () => swarm.become({ kind: 'yoyo3d' })), btn('release', () => swarm.release())));

const frameRect = (): { x: number; y: number; w: number; h: number } => {
  const W = innerWidth, H = innerHeight;
  const w = Math.min(860, W - 32), h = Math.min(540, H * 0.7);
  return { x: (W - w) / 2, y: (H - h) / 2 - H * 0.03, w, h };
};
const slider = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', ariaLabel: 'Frame progress' });
slider.addEventListener('input', () => {
  const r = frameRect();
  Object.assign(frameEl.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  frameEl.hidden = false;
  swarm.buildFrame(r, Number(slider.value));
});
panel.append(label('buildFrame progress'), row(slider, btn('×', () => { frameEl.hidden = true; slider.value = '0'; swarm.release(); })));

const level = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0', ariaLabel: 'Listening level' });
level.addEventListener('input', () => swarm.setListeningLevel(Number(level.value)));
panel.append(label('listening level'), row(level, btn('pulse', () => swarm.pulse(1))));

let sceneNow = scene;
const tierSel = el('select', { ariaLabel: 'Quality tier' });
for (const t of [3, 2, 1, 0]) tierSel.append(el('option', { value: String(t), textContent: `tier ${t}` }));
tierSel.value = String(swarm.stats().tier);
tierSel.addEventListener('change', () => swarm.setQuality(Number(tierSel.value) as Tier));
panel.append(row(
  btn('scene', () => { sceneNow = sceneNow === 'dark' ? 'light' : 'dark'; document.body.dataset.scene = sceneNow; swarm.setScene(sceneNow); }),
  tierSel,
  btn('entry', () => { void playEntry(swarm); }),
  btn('png', async () => { const b = await swarm.screenshot(); window.open(URL.createObjectURL(b)); }),
));

setInterval(() => {
  const s = swarm.stats(), p = swarm.perf();
  stats.textContent = `${s.backend} · tier ${s.tier} · ${s.count.toLocaleString()} particles\n${s.fps.toFixed(0)} fps · frame p50 ${p.p50.toFixed(1)} / p95 ${p.p95.toFixed(1)} ms\nengine cpu p50 ${p.cpuP50.toFixed(2)} ms · webgpu ${detected.webgpu ? 'yes' : 'no'}`;
  if (document.activeElement !== tierSel) tierSel.value = String(s.tier);
}, 400);

if (q.get('entry') === '1') void playEntry(swarm);
