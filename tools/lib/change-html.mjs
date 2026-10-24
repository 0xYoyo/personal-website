// The mock worker's "Change it" (POLISH2 C3): a real, visible change to the page being changed, by
// plain string transforms, so the live change path (previousHtml → /build → a different page) runs
// end to end in dev and QA. Not a model; just enough to tell the change happened.
//
//   "make it dark"      → the page's own dark palette (its prefers-color-scheme block), forced on
//   "light mode"        → its light palette, forced on
//   "make it green"     → the accent color
//   anything else       → a visible note on the page saying what was asked
//
// Every change is a `<style data-mock-change>` (and for notes an element) added at the end of
// <head> / <body>, so changes stack and later ones win.

const ACCENTS = {
  // the examples' accent is already #2b4bff: a different blue, so the change shows
  blue: '#0a8cff',
  green: '#1f8a5b',
  red: '#e2553d',
  orange: '#f08a24',
  yellow: '#e8a317',
  purple: '#7a4bff',
  violet: '#7a4bff',
  pink: '#e84393',
  teal: '#14a3a3',
};

/** Generic palettes for pages without their own. */
const DARK = '--bg: #121110; --surface: #1b1a18; --fg: #f1ede6; --muted: #9c958b; --line: #2c2a27;';
const LIGHT = '--bg: #f6f4ef; --surface: #ffffff; --fg: #1a1815; --muted: #6f6a62; --line: #e4e0d8;';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The custom properties of the page's dark / light `:root` blocks (without a mock change). */
function palette(html, scheme) {
  const src = html.replace(/<style data-mock-change[\s\S]*?<\/style>/g, '');
  if (scheme === 'dark') {
    const m = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{\s*:root\s*\{([^}]*)\}/i.exec(src);
    return m ? m[1].trim() : DARK;
  }
  const m = /(?:^|[^-\w]):root\s*\{([^}]*)\}/.exec(src);
  return m ? m[1].replace(/color-scheme\s*:[^;]*;?/g, '').trim() : LIGHT;
}

function addStyle(html, css) {
  const tag = `<style data-mock-change>${css}</style>\n`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}</head>`) : tag + html;
}

function addToBody(html, el) {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${el}\n</body>`) : html + el;
}

/** What a change instruction does: `{kind, css?, note?}`. */
export function planChange(instruction) {
  const t = String(instruction ?? '').toLowerCase();
  if (/\b(dark|night|black|darker)\b/.test(t)) return { kind: 'dark' };
  if (/\b(light|lighter|white|bright)\b/.test(t)) return { kind: 'light' };
  const color = Object.keys(ACCENTS).find((c) => new RegExp(`\\b${c}\\b`).test(t));
  if (color) return { kind: 'accent', color, value: ACCENTS[color] };
  return { kind: 'note' };
}

/** Applies a change instruction to a page; always returns different HTML. */
export function changeHtml(html, instruction) {
  const plan = planChange(instruction);
  switch (plan.kind) {
    case 'dark':
      return addStyle(html, `:root { ${palette(html, 'dark')} color-scheme: dark; } body { background: var(--bg); color: var(--fg); }`);
    case 'light':
      return addStyle(html, `:root { ${palette(html, 'light')} color-scheme: light; } body { background: var(--bg); color: var(--fg); }`);
    case 'accent':
      return addStyle(html, `:root { --accent: ${plan.value}; --rain: ${plan.value}; }`);
    default: {
      const note = String(instruction ?? '').trim().slice(0, 120) || 'changed';
      const css =
        '[data-mock-note] { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647; max-width: calc(100% - 32px); ' +
        'padding: 10px 16px; border-radius: 999px; background: var(--accent, #2b4bff); color: #fff; font: 600 14px/1.3 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.18); }';
      return addToBody(addStyle(html, css), `<div data-mock-note role="status">changed: ${esc(note)}</div>`);
    }
  }
}
