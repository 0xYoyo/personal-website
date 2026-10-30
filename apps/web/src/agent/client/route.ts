// The router's answer (WAVE4 A1/A3): the Worker's /chat on Gemini returns
//   { type: 'route', intent: <scripted id> | 'unknown' | null, turns: string[], shape: string | null, chips: string[] }
// A known intent plays the scripted reply (the exact copy); otherwise the model's turns play with its
// shape. The Worker already clamps all of it; this side re-checks the shape of the data and never
// lets model text carry tags.

import { EXTRA_INTENTS } from './extras';
import { FAQ_INTENTS, FAQ_UNKNOWN } from './faq';
import { classify } from './intents';
import { replyFor, scriptedReply, type ScriptedContext } from './scripted';

export interface Route {
  intent: string | null;
  turns: string[];
  shape: string | null;
  chips: string[];
}

/** How long the router may take before the scripted best match plays instead (A3). */
export const ROUTE_TIMEOUT_MS = 2_500;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const strs = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : []).map(str).filter((s): s is string => s !== null).slice(0, max);

/** A JSON body → Route, or null when it isn't one. */
export function parseRoute(v: unknown): Route | null {
  if (!v || typeof v !== 'object' || (v as { type?: unknown }).type !== 'route') return null;
  const o = v as Record<string, unknown>;
  return { intent: str(o.intent), turns: strs(o.turns, 2), shape: str(o.shape), chips: strs(o.chips, 3) };
}

/** Model text can't open, close or add tags, or mark turns. */
const plain = (s: string) => s.replace(/\[\[[^\]]*\]\]/g, ' ').replace(/[[\]|]/g, ' ').replace(/[—―]/g, ',').replace(/\s+/g, ' ').trim();

const isScripted = (id: string) => id === 'unknown' || FAQ_INTENTS.some((i) => i.id === id);

/** The raw reply (tags included, `||` turns) a route plays. */
export function routedReply(route: Route, text: string, ctx: ScriptedContext): string {
  const id = route.intent;
  if (id && isScripted(id)) {
    if (id === 'unknown') return FAQ_UNKNOWN;
    // the local classifier agrees: its reply carries the specifics (the visitor's own build ask, the story)
    const local = classify(text);
    if (local.kind === 'intent' && local.id === id) return scriptedReply(text, ctx).raw;
    const raw = replyFor({ kind: 'intent', id, score: 9 }, ctx);
    if (id === 'build') {
      const ask = text.replace(/[[\]|]/g, '').trim().slice(0, 280);
      if (ask) return raw.replace('[[build:example]]', `[[build:${ask}]]`);
    }
    return raw;
  }
  if (id && EXTRA_INTENTS.some((x) => x.id === id)) return EXTRA_INTENTS.find((x) => x.id === id)!.reply;
  const turns = route.turns.map(plain).filter(Boolean);
  if (!turns.length) return FAQ_UNKNOWN;
  const shape = route.shape ? plain(route.shape) : '';
  const chips = route.chips.map(plain).filter(Boolean);
  return [shape ? `[[become:${shape}]]` : '', turns.join(' || '), chips.length ? `[[chips:${chips.join('|')}]]` : '']
    .filter(Boolean)
    .join(' ');
}
