// Yoyo's agent — the mind. The fetch router (index.ts only re-exports it as the default handler,
// because workerd treats every named export of the entry module as an entrypoint).
//
//   POST /chat   → JSON {type:'route', intent, turns, shape, chips} (Gemini: the router, ./router)
//                  SSE  data: {"type":"token","text":"..."} … data: {"type":"done"} (PROVIDER=anthropic)
//   POST /build  → 503 offline unless LIVE_BUILDS=on (WAVE4 A4: builds never call the model); then SSE  data: {"type":"chunk","html":"<html chunk>"} … data: {"type":"done","bytes":N}
//   (the @yoyo/protocol ChatEvent / BuildEvent framing; requests are ChatRequest / BuildRequest)
//   POST /share  → {id, url}
//   GET  /s/:id  → the shared HTML, under a sandbox CSP
//   GET  /health → {ok, live, model}
//
// Errors are JSON: 400/413 {reason:'bad_request'|'too_long'}, 403 {reason:'origin'},
// 429 {reason:'rate'|'quota', retryAfter?}, 502 {reason:'upstream'}, 503 {reason:'offline'}.

import { corsHeaders, isAllowedOrigin, parseAllowlist } from './cors';
import { createFenceStripper } from './fence';
import { createPacer } from './pace';
import type { GeminiContent } from './gemini';
import { apiKey, modelName, provider, streamModel as callModel } from './provider';
import { BUCKETS, DailyCounter, MemoryKV, clientIp, ipKey, takeDaily, takeToken, type LimitKind } from './limits';
import { routeGemini } from './router';
import {
  BUILD_SYSTEM_PROMPT,
  CAPS,
  buildContents,
  byteLength,
  chatContents,
  chatSystemPrompt,
  parseBuildBody,
  parseChatBody,
} from './prompt';
import { SSE_HEADERS, sseStream } from './sse';

export interface Env {
  SHARES: KVNamespace;
  /** optional in local dev: an in-memory stand-in is used without it */
  LIMITS?: KVNamespace;
  /** `gemini` (default) or `anthropic` */
  PROVIDER?: string;
  /** model id for the selected provider; default gemini-2.5-flash / claude-sonnet-4-5 */
  MODEL?: string;
  GEMINI_API_KEY?: string;
  /** legacy alias of MODEL for Gemini */
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_THINKING_BUDGET?: string;
  ALLOWED_ORIGINS?: string;
  /** live replies for the whole site per UTC day (default 300) */
  DAILY_CHAT_CAP?: string;
  /** live replies per visitor IP per UTC day (default 20) */
  CHAT_PER_IP_DAY?: string;
  /** "on" lets /build call the model; anything else answers 503 offline (the site builds from examples) */
  LIVE_BUILDS?: string;
  DAILY_BUILD_CAP?: string;
  DAILY_SHARE_CAP?: string;
  IP_SALT?: string;
}

export interface Deps {
  fetch: typeof fetch;
  now: () => number;
  counter?: DailyCounter;
}

export const SHARE_CSP =
  "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";
export const SHARE_TTL_SECONDS = 30 * 86_400;
const MAX_BODY_BYTES = 80_000;
const BUILD_MAX_OUTPUT_BYTES = 60_000;

type Ctx = Pick<ExecutionContext, 'waitUntil'>;

/** KV stand-in for `wrangler dev` without a LIMITS binding (per isolate). */
const devLimits = new MemoryKV() as unknown as KVNamespace;

export function createApp(deps: Partial<Deps> = {}) {
  const fetchImpl = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = deps.now ?? (() => Date.now());
  let counter = deps.counter ?? null;

  return async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    // Served on a route under the site's own domain (site.com/api/*, README "Share links on
    // your domain"), every path arrives with the /api prefix: route on the rest, and hand
    // share links back under the same prefix so they stay first-party.
    const prefix = /^\/api(?=\/)/.test(url.pathname) ? '/api' : '';
    const path = url.pathname.slice(prefix.length);
    const origin = req.headers.get('origin');
    const allow = parseAllowlist(env.ALLOWED_ORIGINS);
    const cors = isAllowedOrigin(origin, allow) ? corsHeaders(origin) : {};
    const limits = env.LIMITS ?? devLimits;
    counter ??= new DailyCounter(limits);

    const json = (status: number, data: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...cors, ...extra },
      });

    if (req.method === 'OPTIONS') {
      return isAllowedOrigin(origin, allow) ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }

    if (req.method === 'GET' && path === '/health') {
      return json(200, { ok: true, live: !!apiKey(env), provider: provider(env), model: modelName(env), time: new Date(now()).toISOString() });
    }

    const shareMatch = /^\/s\/([A-Za-z0-9]{6,32})$/.exec(path);
    if (req.method === 'GET' && shareMatch) {
      const html = await env.SHARES.get(`s:${shareMatch[1]}`, 'text').catch(() => null);
      if (!html) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': SHARE_CSP,
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    const route = req.method === 'POST' ? path : null;
    if (route !== '/chat' && route !== '/build' && route !== '/share') {
      return json(404, { reason: 'not_found' });
    }
    if (!isAllowedOrigin(origin, allow)) return json(403, { reason: 'origin' });

    const body = await readJson(req);
    if (body === TOO_BIG) return json(413, { reason: 'too_long' });
    if (body === BAD) return json(400, { reason: 'bad_request' });

    const ip = await ipKey(clientIp(req), env.IP_SALT ?? 'yoyo');

    // Returns a Response when the request must stop here.
    const gate = async (kind: LimitKind, dailyCap: number): Promise<Response | null> => {
      const t = now();
      // chat: a fixed allowance per IP per day (WAVE4 A4), then scripted for the day
      const bucket = kind === 'chat' ? await takeDaily(limits, `day:chat-ip:${ip}`, cap(env.CHAT_PER_IP_DAY, 20), t) : await takeToken(limits, `rl:${kind}:${ip}`, BUCKETS[kind], t);
      if (!bucket.ok && kind === 'chat') return json(429, { reason: 'quota' });
      if (!bucket.ok) return json(429, { reason: 'rate', retryAfter: bucket.retryAfter }, { 'retry-after': String(bucket.retryAfter) });
      if (bucket.write) ctx.waitUntil(bucket.write);
      const used = await counter!.count(kind, t);
      if (used >= dailyCap) return json(429, { reason: 'quota' });
      const w = counter!.add(kind, t);
      if (w) ctx.waitUntil(w);
      return null;
    };

    if (route === '/chat') {
      const parsed = parseChatBody(body);
      if (!parsed.ok) return json(parsed.status, { reason: parsed.reason });
      if (!apiKey(env)) return json(503, { reason: 'offline' });
      const stop = await gate('chat', cap(env.DAILY_CHAT_CAP, 300));
      if (stop) return stop;
      if (provider(env) === 'gemini') {
        const result = await routeGemini({ apiKey: apiKey(env), model: modelName(env), turns: parsed.turns, fetchImpl, signal: req.signal }).catch(
          (e: unknown) => ({ ok: false as const, status: 0, kind: 'upstream' as const, detail: e instanceof Error ? e.message : 'network' }),
        );
        if (result.ok) return json(200, result.route, { 'cache-control': 'no-store' });
        console.warn('gemini router failed', result.status, result.detail.slice(0, 300));
        if (result.kind === 'quota') return json(429, { reason: 'quota' });
        if (result.kind === 'rate') return json(429, { reason: 'rate', retryAfter: 30 }, { 'retry-after': '30' });
        return json(502, { reason: 'upstream' });
      }
      return streamModel({
        env,
        system: chatSystemPrompt(parsed.visitor),
        contents: chatContents(parsed.turns),
        temperature: 0.8,
        maxOutputTokens: 512,
        build: false,
      });
    }

    if (route === '/build') {
      const parsed = parseBuildBody(body);
      if (!parsed.ok) return json(parsed.status, { reason: parsed.reason });
      // WAVE4 A4: builds never call the model unless switched on; the site streams its examples
      if (env.LIVE_BUILDS?.trim().toLowerCase() !== 'on') return json(503, { reason: 'offline' });
      if (!apiKey(env)) return json(503, { reason: 'offline' });
      const stop = await gate('build', cap(env.DAILY_BUILD_CAP, 300));
      if (stop) return stop;
      return streamModel({
        env,
        system: BUILD_SYSTEM_PROMPT,
        contents: buildContents(parsed.instruction, parsed.previousHtml),
        temperature: 0.4,
        maxOutputTokens: 16_384,
        build: true,
      });
    }

    // /share
    const html = typeof (body as { html?: unknown }).html === 'string' ? (body as { html: string }).html : '';
    if (!html.trim()) return json(400, { reason: 'bad_request' });
    if (byteLength(html) > CAPS.shareHtmlBytes) return json(413, { reason: 'too_long' });
    const stop = await gate('share', cap(env.DAILY_SHARE_CAP, 1000));
    if (stop) return stop;
    const id = randomId(10);
    try {
      await env.SHARES.put(`s:${id}`, html, { expirationTtl: SHARE_TTL_SECONDS });
    } catch (e) {
      console.warn('share: kv put failed', e);
      return json(503, { reason: 'offline' });
    }
    return json(200, { id, url: `${url.origin}${prefix}/s/${id}` });

    async function streamModel(o: {
      env: Env;
      system: string;
      contents: GeminiContent[];
      temperature: number;
      maxOutputTokens: number;
      build: boolean;
    }): Promise<Response> {
      const result = await callModel(o.env, {
        system: o.system,
        contents: o.contents,
        temperature: o.temperature,
        maxOutputTokens: o.maxOutputTokens,
        fetchImpl,
        signal: req.signal,
      }).catch(() => ({ ok: false as const, status: 0, kind: 'upstream' as const, detail: 'network' }));

      if (!result.ok) {
        console.warn(`${provider(o.env)} failed`, result.status, result.detail.slice(0, 300));
        if (result.kind === 'quota') return json(429, { reason: 'quota' });
        if (result.kind === 'rate') return json(429, { reason: 'rate', retryAfter: 30 }, { 'retry-after': '30' });
        return json(502, { reason: 'upstream' });
      }
      const source = o.build ? cleanBuild(result.stream) : paceChat(result.stream);
      return new Response(sseStream(source, { kind: o.build ? 'build' : 'chat' }), { status: 200, headers: { ...SSE_HEADERS, ...cors } });
    }
  };
}

/** `||` turn pacing for /chat replies the model didn't pace (./pace, POLISH2 C4). */
export async function* paceChat(src: AsyncIterable<string>): AsyncGenerator<string> {
  const p = createPacer();
  try {
    for await (const piece of src) {
      const out = p.push(piece);
      if (out) yield out;
    }
  } catch (e) {
    // the upstream died mid-reply: what was said so far still goes out, then the error
    const rest = p.end();
    if (rest) yield rest;
    throw e;
  }
  const rest = p.end();
  if (rest) yield rest;
}

/** Fence stripping + a hard output cap for /build. */
async function* cleanBuild(src: AsyncIterable<string>): AsyncGenerator<string> {
  const f = createFenceStripper();
  let bytes = 0;
  for await (const piece of src) {
    const out = f.push(piece);
    if (out) {
      bytes += byteLength(out);
      yield out;
      if (bytes > BUILD_MAX_OUTPUT_BYTES) return;
    }
  }
  const rest = f.end();
  if (rest) yield rest;
}

const BAD = Symbol('bad');
const TOO_BIG = Symbol('too_big');

async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) return TOO_BIG;
  let text: string;
  try {
    text = await req.text();
  } catch {
    return BAD;
  }
  if (byteLength(text) > MAX_BODY_BYTES) return TOO_BIG;
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null ? v : BAD;
  } catch {
    return BAD;
  }
}


function cap(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && raw !== undefined && raw !== '' ? n : fallback;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomId(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

