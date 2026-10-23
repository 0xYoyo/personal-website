// Generates a three.js typeface JSON (FontLoader format) for Bricolage Grotesque at a bold instance.
// Usage (from the repo root, one-off; fontkit is not a dependency):
//   npm i --no-save fontkit && node tools/make-typeface.mjs  -> apps/web/public/fonts/bricolage-bold.typeface.json
import * as fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';
const src = 'node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2';
const base = fontkit.openSync(src);
const font = base; // default instance of the variable font is wght 800 (bold)
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .!?';
const scale = 1000 / base.unitsPerEm;
const r = (v) => Math.round(v * scale * 10) / 10;
const glyphs = {};
for (const ch of chars) {
  const g = font.glyphForCodePoint(ch.codePointAt(0));
  const parts = [];
  for (const c of g.path.commands) {
    const a = c.args;
    if (c.command === 'moveTo') parts.push('m', r(a[0]), r(a[1]));
    else if (c.command === 'lineTo') parts.push('l', r(a[0]), r(a[1]));
    else if (c.command === 'quadraticCurveTo') parts.push('q', r(a[2]), r(a[3]), r(a[0]), r(a[1]));
    else if (c.command === 'bezierCurveTo') parts.push('b', r(a[4]), r(a[5]), r(a[0]), r(a[1]), r(a[2]), r(a[3]));
  }
  const bb = g.bbox;
  // +70 units of tracking: the 3D letters sway in perspective and would otherwise overlap at this weight
  glyphs[ch] = { ha: r(g.advanceWidth) + 70, x_min: r(bb.minX), x_max: r(bb.maxX), o: parts.join(' ') };
}
const out = {
  glyphs, familyName: 'Bricolage Grotesque', ascender: r(base.ascent), descender: r(base.descent),
  underlinePosition: r(base.underlinePosition), underlineThickness: r(base.underlineThickness),
  boundingBox: { yMin: r(base.bbox.minY), xMin: r(base.bbox.minX), yMax: r(base.bbox.maxY), xMax: r(base.bbox.maxX) },
  resolution: 1000, original_font_information: { format: 0, fontFamily: 'Bricolage Grotesque', license: 'SIL Open Font License 1.1' }, cssFontWeight: 'bold', cssFontStyle: 'normal',
};
writeFileSync('apps/web/public/fonts/bricolage-bold.typeface.json', JSON.stringify(out));
console.log('ok', Object.keys(glyphs).length, 'glyphs', JSON.stringify(out).length, 'bytes');
