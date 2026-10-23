/**
 * Generic glyph loader: any `glyphs/<id>.svg` present at build time is picked up (lazy, one chunk each).
 * Glyphs are read as silhouettes (alpha channel), so fill colour does not matter.
 * `registerGlyph` lets the app add or override glyphs at runtime.
 */
const files = import.meta.glob('./glyphs/*.svg', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const runtime = new Map<string, string>();

export function registerGlyph(id: string, svg: string): void { runtime.set(id, svg); }

export function availableGlyphs(): string[] {
  const ids = new Set<string>(runtime.keys());
  for (const k of Object.keys(files)) ids.add(k.replace(/^.*\/(.+)\.svg$/, '$1'));
  ids.add('yoyo');
  return [...ids].sort();
}

export async function loadGlyphSvg(id: string): Promise<string | null> {
  const r = runtime.get(id);
  if (r) return r;
  const f = files[`./glyphs/${id}.svg`]!;
  if (!f) return null;
  let svg = await f();
  // Ensure a rasterisable size: SVGs without width/height decode at 0×0 or 300×150 in some browsers.
  if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="512" height="512"');
  return svg;
}
