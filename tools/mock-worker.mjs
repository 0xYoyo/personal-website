#!/usr/bin/env node
// Mock of the agent Worker for development and QA. Node only, no dependencies.
//
//   node tools/mock-worker.mjs            → http://localhost:8787
//   PORT=9000 node tools/mock-worker.mjs
//
// Same endpoints and wire format as apps/worker (the @yoyo/protocol ChatEvent / BuildEvent framing):
//   POST /chat  → SSE data: {"type":"token","text":"..."} … data: {"type":"done"}   (canned replies from faq.md, live-like timing)
//   POST /build → SSE data: {"type":"chunk","html":"<html>"} … data: {"type":"done","bytes":N}  (6 prebuilt apps, ~15 s)
//   POST /share → {id, url}      GET /s/:id → HTML under the sandbox CSP      GET /health
//
// Failure modes for QA (the client's fallback paths):
//   prefix the path:   /__fail/<mode>/chat   e.g. VITE_AGENT_URL=http://localhost:8787/__fail/slow
//   or env:            MOCK_FAIL=<mode>
//   modes: slow (no first token for 12 s) · down (502) · offline (503) · quota (429 quota)
//          rate (429 rate) · drop (3 tokens then the connection dies) · empty (done, no text)
//
// Timing: first token 600 ms, then ~40 tokens/s (4-char tokens); builds stream for ~15 s.
// Set MOCK_FAST=1 to divide all delays by 10 (for automated tests).

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const faqFile = join(root, 'apps', 'web', 'src', 'content', 'faq.md');
const examplesDir = join(root, 'apps', 'web', 'src', 'agent', 'client', 'examples');
const PORT = Number(process.env.PORT ?? 8787);
const SPEED = process.env.MOCK_FAST ? 10 : 1;
const ENV_FAIL = process.env.MOCK_FAIL ?? '';

const CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";

// ---------------------------------------------------------------- content

function loadFaq() {
  const md = readFileSync(faqFile, 'utf8');
  const intents = [];
  let unknown = '';
  let beats = [];
  for (const sec of md.split(/^## /m).slice(1)) {
    const [head, ...rest] = sec.split('\n');
    const id = head.trim();
    const body = rest.join('\n');
    if (id.startsWith('emoji_beats')) {
      beats = [...body.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      continue;
    }
    const reply = /^→[^`]*`([^`]+)`/m.exec(body)?.[1];
    if (!reply) continue;
    if (id === 'unknown') {
      unknown = reply;
      continue;
    }
    const hints = (/^hints:\s*(.+)$/m.exec(body)?.[1] ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    intents.push({ id, hints, reply });
  }
  return { intents, unknown, beats };
}

const EXAMPLE_KEYWORDS = {
  pomodoro: ['pomodoro', 'timer', 'focus', 'countdown', 'clock'],
  landing: ['landing', 'homepage', 'marketing', 'startup', 'product page', 'website'],
  todo: ['todo', 'to-do', 'to do', 'task', 'checklist', 'list'],
  weather: ['weather', 'forecast', 'temperature', 'rain'],
  habits: ['habit', 'tracker', 'streak', 'routine'],
  birthday: ['birthday', 'card', 'greeting', 'party', 'anniversary'],
};

function loadExamples() {
  const dir = examplesDir;
  return Object.keys(EXAMPLE_KEYWORDS)
    .filter((id) => existsSync(join(dir, `${id}.html`)))
    .map((id) => ({ id, keywords: EXAMPLE_KEYWORDS[id], html: readFileSync(join(dir, `${id}.html`), 'utf8') }));
}

const FAQ = loadFaq();
const EXAMPLES = loadExamples();
let exampleCursor = 0;
const shares = new Map();

// ---------------------------------------------------------------- replies

const tokenize = (s) => (s.toLowerCase().replace(/[’']/g, '').match(/[\p{L}\p{N}&]+/gu) ?? []);

/** SPEC §2.8 easter eggs with no faq.md line (same lines as the scripted brain's EXTRA_INTENTS and persona.md). */
const EASTER_EGGS = [
  [/\bfortnite\b/, '[[become:ramp]] he could build a ramp before you could aim.'],
  [/\b(cs2|cs ?go|counter[- ]?strike)\b/, '[[become:cursor]] rush B. don\'t stop.'],
  [/\bpiano\b/, '[[become:piano]] he wants to learn. hasn\'t yet. ask him in a year.'],
];

/** What a live model might say: faq replies, plus the persona's build/name/emoji/spell behaviour. */
export function mockReply(text, visitor = {}) {
  const raw = String(text ?? '').trim();
  const lower = raw.toLowerCase();
  const emoji = /^\s*(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|️|\p{Emoji_Modifier})*)/u.exec(raw)?.[1];
  if (emoji) return `[[become:${emoji}]] ${emoji === '🚀' ? '[[mood:excited]] ' : ''}${FAQ.beats[0] ?? 'obviously.'}`;
  const name = /^(?:hi[,!\s]+)?(?:i'?m|i am|my name is|call me)\s+([\p{L}][\p{L}'-]{0,23})[.!]?$/iu.exec(raw)?.[1];
  if (name && !/^(a|an|the|looking|here|just|not|interested|curious)$/i.test(name)) {
    const n = name[0].toUpperCase() + name.slice(1);
    return `[[become:${n}]] nice to meet you, ${n}. [[chips:Spell my name|Build me something|Who is Yoyo?]]`;
  }
  if (/^spell my name$/i.test(raw)) {
    return visitor.name ? `[[become:${visitor.name}]] done. [[chips:Now a rocket|Build me something|Who is Yoyo?]]` : `[[become:question]] what's your name?`;
  }
  const spell = /^(?:spell|write)\s+(.{1,12})$/i.exec(raw)?.[1];
  if (spell) return `[[become:${spell.replace(/[[\]|]/g, '')}]] done. [[chips:Now a rocket|Build me something|Who is Yoyo?]]`;
  const build = /\b(build|make|create|generate)\b\s+(me\s+)?(an?\s+)?(.+)/i.exec(raw);
  if (build && !/\b(he|has he|did he|this site|this agent)\b/i.test(lower)) {
    const what = build[4].replace(/[[\]|]/g, '').replace(/[?.!]+$/, '').slice(0, 280);
    return `[[build:${what}]] on it.`;
  }
  const egg = EASTER_EGGS.find(([re]) => re.test(lower));
  if (egg) return egg[1];
  const tokens = tokenize(raw);
  let best = null;
  let bestScore = 0;
  for (const it of FAQ.intents) {
    let score = 0;
    for (const h of it.hints) {
      const ht = tokenize(h);
      if (!ht.length) continue;
      if (ht.length > 1 ? lower.includes(h) : tokens.includes(ht[0])) score += ht.length > 1 ? 3 : 2;
    }
    if (score > bestScore || (score === bestScore && best && score > 0 && it.hints.length < best.hints.length)) {
      best = it;
      bestScore = score;
    }
  }
  if (!best || bestScore === 0) return FAQ.unknown;
  // As the live model it can build for real, so the scripted "builder is resting" line doesn't apply.
  if (best.id === 'build') return `[[build:${raw.replace(/[[\]|]/g, '').slice(0, 280)}]] on it.`;
  if (best.id === 'story') return '[[story:next]] here it is.';
  return best.reply;
}

export function pickExample(instruction) {
  const low = String(instruction ?? '').toLowerCase();
  const hit = EXAMPLES.find((e) => e.keywords.some((k) => low.includes(k)));
  if (hit) return hit;
  const ex = EXAMPLES[exampleCursor % EXAMPLES.length];
  exampleCursor++;
  return ex;
}

/** Splits text into ~4-character "model tokens" so tags get split like real streams. */
export function modelTokens(s) {
  return s.match(/[\s\S]{1,4}/g) ?? [];
}

// ---------------------------------------------------------------- http

const sleep = (ms) => new Promise((r) => setTimeout(r, ms / SPEED));
const jitter = (ms) => ms * (0.75 + Math.random() * 0.5);

function cors(req) {
  const origin = req.headers.origin;
  return origin
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' }
    : {};
}

function sendJson(req, res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...cors(req) });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= 200_000) chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve(null);
      }
    });
  });
}

function sseHead(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', ...cors(req) });
  res.flushHeaders?.();
}
const frame = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

async function failMaybe(mode, req, res) {
  switch (mode) {
    case 'down':
      sendJson(req, res, 502, { reason: 'upstream' });
      return true;
    case 'offline':
      sendJson(req, res, 503, { reason: 'offline' });
      return true;
    case 'quota':
      sendJson(req, res, 429, { reason: 'quota' });
      return true;
    case 'rate':
      res.setHeader('retry-after', '30');
      sendJson(req, res, 429, { reason: 'rate', retryAfter: 30 });
      return true;
    case 'slow':
      sseHead(req, res);
      await sleep(12_000);
      frame(res, { type: 'token', text: 'too late.' });
      frame(res, { type: 'done' });
      res.end();
      return true;
    case 'empty':
      sseHead(req, res);
      await sleep(600);
      frame(res, { type: 'done' });
      res.end();
      return true;
    default:
      return false;
  }
}

async function handleChat(req, res, fail) {
  const body = await readBody(req);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const last = messages[messages.length - 1];
  const content = last?.role === 'visitor' && typeof last.text === 'string' ? last.text : '';
  if (!content.trim()) return sendJson(req, res, 400, { reason: 'bad_request' });
  if ([...content].length > 600) return sendJson(req, res, 400, { reason: 'too_long' });
  if (await failMaybe(fail, req, res)) return;
  const reply = mockReply(content, body?.visitor ?? {});
  sseHead(req, res);
  let closed = false;
  req.on('close', () => (closed = true));
  await sleep(jitter(600));
  const toks = modelTokens(reply);
  for (let i = 0; i < toks.length && !closed; i++) {
    if (fail === 'drop' && i === 3) {
      res.destroy();
      return;
    }
    frame(res, { type: 'token', text: toks[i] });
    await sleep(jitter(25));
  }
  if (!closed) {
    frame(res, { type: 'done' });
    res.end();
  }
}

async function handleBuild(req, res, fail) {
  const body = await readBody(req);
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) return sendJson(req, res, 400, { reason: 'bad_request' });
  if ([...instruction].length > 400) return sendJson(req, res, 400, { reason: 'too_long' });
  if (await failMaybe(fail, req, res)) return;
  const ex = pickExample(instruction);
  sseHead(req, res);
  let closed = false;
  req.on('close', () => (closed = true));
  const total = 15_000;
  const first = 1_200;
  const tick = 60;
  const ticks = Math.round((total - first) / tick);
  const size = Math.ceil(ex.html.length / ticks);
  await sleep(jitter(first));
  let sent = 0;
  while (sent < ex.html.length && !closed) {
    if (fail === 'drop' && sent > 2000) {
      res.destroy();
      return;
    }
    const n = Math.max(1, Math.round(size * (0.5 + Math.random())));
    frame(res, { type: 'chunk', html: ex.html.slice(sent, sent + n) });
    sent += n;
    await sleep(tick);
  }
  if (!closed) {
    frame(res, { type: 'done', bytes: Buffer.byteLength(ex.html) });
    res.end();
  }
}

async function handleShare(req, res, origin) {
  const body = await readBody(req);
  const html = typeof body?.html === 'string' ? body.html : '';
  if (!html.trim()) return sendJson(req, res, 400, { reason: 'bad_request' });
  if (Buffer.byteLength(html) > 60_000) return sendJson(req, res, 413, { reason: 'too_long' });
  const id = randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).padEnd(10, 'x');
  shares.set(id, html);
  sendJson(req, res, 200, { id, url: `${origin}/s/${id}` });
}

export function createMockServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      let path = url.pathname;
      let fail = ENV_FAIL;
      const m = /^\/__fail\/([a-z]+)(\/.*)$/.exec(path);
      if (m) {
        fail = m[1];
        path = m[2];
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors(req));
        return res.end();
      }
      if (req.method === 'GET' && path === '/health') return sendJson(req, res, 200, { ok: true, live: true, model: 'mock', time: new Date().toISOString(), fail: fail || null });
      if (req.method === 'POST' && path === '/chat') return await handleChat(req, res, fail);
      if (req.method === 'POST' && path === '/build') return await handleBuild(req, res, fail);
      if (req.method === 'POST' && path === '/share') return await handleShare(req, res, `${url.protocol}//${url.host}`);
      const s = /^\/s\/([A-Za-z0-9]{6,32})$/.exec(path);
      if (req.method === 'GET' && s) {
        const html = shares.get(s[1]);
        if (!html) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          return res.end('Not found');
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'x-content-type-options': 'nosniff' });
        return res.end(html);
      }
      sendJson(req, res, 404, { reason: 'not_found' });
    } catch (e) {
      console.error(e);
      if (!res.headersSent) sendJson(req, res, 500, { reason: 'upstream' });
      else res.end();
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  createMockServer().listen(PORT, () => {
    console.log(`mock agent worker on http://localhost:${PORT}`);
    console.log(`faq intents: ${FAQ.intents.length}, examples: ${EXAMPLES.map((e) => e.id).join(', ')}${ENV_FAIL ? `, MOCK_FAIL=${ENV_FAIL}` : ''}`);
  });
}

