// Palette math for the contrast check. The eight lights states are read
// straight from src/design/tokens.css, so the check tests what ships.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/design/tokens.css', import.meta.url));

/** Number of lights states: 0..7 PRs merged after #1. */
export const LEVELS = 8;
/** The state where the lights switch on. */
export const LIGHTS_ON_AT = 4;

const declarations = (block) =>
  Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/**
 * The page palette in each of the eight states: { level, bg, fg, muted, agentText, dur }.
 * Each state starts from the :root defaults and applies its :root[data-lights='N'] block.
 */
export function lightStates(css = readFileSync(TOKENS, 'utf8')) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = noComments.match(/(^|\n):root\s*\{([\s\S]*?)\n\}/);
  if (!root) throw new Error('tokens.css: no :root block');
  const base = declarations(root[2]);
  const states = [];
  let current = { ...base };
  for (let level = 0; level < LEVELS; level++) {
    const block = noComments.match(new RegExp(`:root\\[data-lights='${level}'\\]\\s*\\{([^}]*)\\}`));
    // Each state is the defaults plus its own block (not cumulative).
    current = { ...base, ...(block ? declarations(block[1]) : {}) };
    states.push({
      level,
      bg: current['--bg'],
      fg: current['--fg'],
      muted: current['--muted'],
      agentText: current['--agent-text'],
      dur: current['--dur-light'],
    });
  }
  return { states, base };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLin);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(fromLin(c), 0, 1));
}
/** color-mix(in oklab, a (1-t), b t) */
export function mix(a, b, t) {
  const A = rgbToOklab(typeof a === 'string' ? hexToRgb(a) : a);
  const B = rgbToOklab(typeof b === 'string' ? hexToRgb(b) : b);
  return oklabToRgb(A.map((v, i) => v * (1 - t) + B[i] * t));
}
/** Alpha-composite rgb `top` at `alpha` over `under`. */
export function over(top, alpha, under) {
  const T = typeof top === 'string' ? hexToRgb(top) : top;
  const U = typeof under === 'string' ? hexToRgb(under) : under;
  return T.map((v, i) => v * alpha + U[i] * (1 - alpha));
}
const lum = (rgb) => {
  const [r, g, b] = rgb.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(x, y) {
  const X = typeof x === 'string' ? hexToRgb(x) : x;
  const Y = typeof y === 'string' ? hexToRgb(y) : y;
  const [a, b] = [lum(X), lum(Y)].sort((m, n) => n - m);
  return (a + 0.05) / (b + 0.05);
}
export const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
