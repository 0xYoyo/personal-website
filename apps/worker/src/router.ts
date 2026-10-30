// /chat on Gemini (WAVE4 A1): one non-streamed generateContent call with structured output,
// minimal thinking, a small token budget. The model routes to a scripted intent or fills a gap;
// the reply is clamped before it leaves the Worker. The Anthropic provider keeps the streamed path.

import { GLYPH_IDS } from '@yoyo/protocol';
import { classifyFailure, GEMINI_BASE } from './gemini';
import type { ModelFailure } from './provider';
import { ROUTER_INTENT_IDS, ROUTER_SYSTEM_PROMPT } from './prompt.generated';
import { geminiRouterBody, geminiText, parseRoute, routerUserText, thinkingFallback, thinkingFor, type Route } from './router-core.mjs';
import type { ChatTurn } from './prompt';

/** What /chat answers on the router path: `application/json`. */
export interface RouteReply extends Route {
  type: 'route';
}

export const ROUTER_KNOWN = { intents: [...ROUTER_INTENT_IDS], glyphs: [...GLYPH_IDS] };
/** The site gives up at 2.5 s; past this the Worker stops waiting too. */
export const ROUTER_UPSTREAM_TIMEOUT_MS = 6_000;

export interface RouteRequest {
  apiKey: string;
  model: string;
  turns: ChatTurn[];
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function routeGemini(req: RouteRequest): Promise<{ ok: true; route: RouteReply } | ModelFailure> {
  const userText = routerUserText(req.turns);
  const signal = withTimeout(req.signal, req.timeoutMs ?? ROUTER_UPSTREAM_TIMEOUT_MS);
  let thinking = thinkingFor(req.model);
  let res: Response;
  for (;;) {
    const body = geminiRouterBody({ model: req.model, system: ROUTER_SYSTEM_PROMPT, userText, intentIds: ROUTER_KNOWN.intents, thinking });
    res = await req.fetchImpl(`${GEMINI_BASE}/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status !== 400 || !thinking) break;
    // a model that rejects this thinking setting: the next lower one, then none (its default)
    const text = await res.clone().text().catch(() => '');
    if (!/thinking/i.test(text)) break;
    thinking = thinkingFallback(thinking);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 2000);
    return { ok: false, status: res.status, kind: classifyFailure(res.status, detail), detail };
  }
  const json: unknown = await res.json().catch(() => null);
  const parsed = parseRoute(geminiText(json), ROUTER_KNOWN);
  if (!parsed.ok) return { ok: false, status: 200, kind: 'upstream', detail: `unparseable route: ${parsed.error}` };
  return { ok: true, route: { type: 'route', ...parsed.route } };
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}
