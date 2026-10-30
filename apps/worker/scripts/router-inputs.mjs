// Build-time inputs of the router prompt (WAVE4 A1), shared by scripts/gen-prompt.mjs (→ the Worker)
// and tools/live-check.mjs (→ straight to Gemini), so both send the exact same prompt.
//   facts   apps/worker/prompt/facts.md (verbatim)
//   persona the "## Voice" and "## Truth" sections of apps/worker/prompt/persona.md
//   intents the scripted intent ids (and hints) of apps/web/src/content/faq.md
//   glyphs  GLYPH_IDS of packages/protocol/src/index.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouterSystem } from '../src/router-core.mjs';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(join(REPO, ...p), 'utf8');

/** `## id` sections of faq.md that are intents (not unknown, emoji beats or easter eggs). */
export function faqIntents(md) {
  const out = [];
  for (const sec of md.split(/^## /m).slice(1)) {
    const [head, ...rest] = sec.split('\n');
    const id = (head ?? '').trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || id === 'unknown') continue;
    const hints = /^hints:\s*(.+)$/m.exec(rest.join('\n'));
    if (!hints) continue;
    out.push({ id, hints: hints[1].split(',').map((h) => h.trim()).filter(Boolean) });
  }
  return out;
}

/** The persona's voice and truth rules, without the action-tag docs the router doesn't use. */
export function personaRules(md) {
  const sections = md.split(/^## /m).slice(1);
  const pick = sections.filter((s) => /^(Voice|Truth)\b/.test(s));
  return pick.map((s) => s.replace(/^[^\n]*\n/, '').trim()).join('\n');
}

export function glyphIds(ts) {
  const m = /export const GLYPH_IDS = \[([\s\S]*?)\]/.exec(ts);
  if (!m) throw new Error('router-inputs: GLYPH_IDS not found in packages/protocol/src/index.ts');
  return [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
}

export function loadRouterInputs() {
  const facts = read('apps', 'worker', 'prompt', 'facts.md').trim();
  const persona = personaRules(read('apps', 'worker', 'prompt', 'persona.md'));
  const intents = faqIntents(read('apps', 'web', 'src', 'content', 'faq.md'));
  const glyphs = glyphIds(read('packages', 'protocol', 'src', 'index.ts'));
  const system = buildRouterSystem({ facts, persona, intents, glyphs });
  return { facts, persona, intents, intentIds: intents.map((i) => i.id), glyphs, system };
}
