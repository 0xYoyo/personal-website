#!/usr/bin/env node
// Mock of the agent Worker for development and QA. Node only; answers with the site's own
// scripted brain (bundled on start by tools/lib/agent-bundle.mjs with esbuild, which Vite installs).
//
//   node tools/mock-worker.mjs            → http://localhost:8787
//   PORT=9000 node tools/mock-worker.mjs
//
// Same endpoints and wire format as apps/worker (the @yoyo/protocol ChatEvent / BuildEvent framing):
//   POST /chat  → SSE data: {"type":"token","text":"..."} … data: {"type":"done"}   (the scripted brain's replies, as a live model would give them; live-like timing)
//   POST /build → SSE data: {"type":"chunk","html":"<html>"} … data: {"type":"done","bytes":N}  (6 prebuilt apps, ~15 s;
//                 with previousHtml — "Change it" — the page being changed, really changed: dark/light,
//                 an accent color, else a visible note; tools/lib/change-html.mjs)
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
import { loadAgent } from './lib/agent-bundle.mjs';
import { changeHtml } from './lib/change-html.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const examplesDir = join(root, 'apps', 'web', 'src', 'agent', 'client', 'examples');
const PORT = Number(process.env.PORT ?? 8787);
const SPEED = process.env.MOCK_FAST ? 10 : 1;
const ENV_FAIL = process.env.MOCK_FAIL ?? '';

const CSP = "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";

// ---------------------------------------------------------------- content

const EXAMPLE_IDS = ['pomodoro', 'landing', 'todo', 'weather', 'habits', 'birthday'];

function loadExamples() {
  return EXAMPLE_IDS.filter((id) => existsSync(join(examplesDir, `${id}.html`))).map((id) => ({
    id,
    html: readFileSync(join(examplesDir, `${id}.html`), 'utf8'),
  }));
}

// The site's own scripted brain (classifier, faq.md replies, easter eggs, example picker),
// bundled from apps/web/src/agent/client — so the mock can't drift from it (POLISH1 C2).
const AGENT = await loadAgent();
const EXAMPLES = loadExamples();
let exampleCursor = 0;
const shares = new Map();

// ---------------------------------------------------------------- replies

const tagSafe = (s) => String(s).replace(/[[\]|]/g, '').trim();

/** The last project card the agent opened in this conversation (for "Next one"). */
function lastShownIn(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== 'agent' || typeof m.text !== 'string') continue;
    const all = [...m.text.matchAll(/\[\[show:([a-z-]+)\]\]/g)];
    if (all.length) return all.at(-1)[1];
  }
  return null;
}

/**
 * What a live model would say: the scripted brain's answer for the same intent, except that the
 * live model really builds (`[[build:<their words>]] on it.`, persona.md) instead of "the live
 * builder is resting", and greets a new name with chips.
 */
export function mockReply(text, visitor = {}, history = []) {
  const raw = String(text ?? '').trim();
  const c = AGENT.classify(raw);
  const name = typeof visitor.name === 'string' && visitor.name ? tagSafe(visitor.name) : null;
  if (c.kind === 'name') {
    const n = tagSafe(c.name);
    return `[[become:${n}]] nice to meet you, ${n}. [[chips:Spell my name|Build me something|Who is Yoyo?]]`;
  }
  if (c.kind === 'emoji') {
    return `[[become:${tagSafe(c.emoji)}]] ${c.emoji === '🚀' ? '[[mood:excited]] ' : ''}${AGENT.EMOJI_BEATS[0] ?? 'obviously.'}`;
  }
  if (c.kind === 'intent' && c.id === 'build') {
    const ask = tagSafe(raw).replace(/[?.!]+$/, '').replace(/^(?:please\s+)?(?:can you\s+)?(?:build|make|create|generate)\s+(?:me\s+|us\s+)?(?:an?\s+)?/i, '');
    return `[[build:${(ask || 'something small and useful').slice(0, 280)}]] on it.`;
  }
  if (c.kind === 'command' && c.id === 'another-build') return '[[build:another small app, different from the last one]] on it.';
  const reply = AGENT.scriptedReply(raw, { name, lastShown: lastShownIn(history), random: () => 0 }).raw;
  if (c.kind === 'spell' || (c.kind === 'spell-my-name' && name)) return `${reply} [[chips:Now a rocket|Build me something|Who is Yoyo?]]`;
  return reply;
}

const titleOf = (html) => /<title>([^<]*)<\/title>/i.exec(html ?? '')?.[1]?.trim() ?? '';

/**
 * What a build streams. A change ("Change it": previousHtml) that names a different app gets that
 * app; any other change gets the page being changed, changed (POLISH2 C3). A new build: the
 * scripted brain's keyword rules, else rotate.
 */
export function buildFor(instruction, previousHtml) {
  const id = AGENT.pickExampleId(String(instruction ?? ''));
  const named = id ? EXAMPLES.find((e) => e.id === id) : null;
  if (previousHtml) {
    if (named && titleOf(named.html) !== titleOf(previousHtml)) return { id: named.id, html: named.html };
    return { id: 'change', html: changeHtml(previousHtml, instruction) };
  }
  return pickExample(instruction);
}

/** The example a build instruction gets: the scripted brain's keyword rules, else rotate. */
export function pickExample(instruction, previousHtml) {
  const id = AGENT.pickExampleId(String(instruction ?? '')) ?? (previousHtml ? EXAMPLES.find((e) => e.html === previousHtml)?.id : null);
  const hit = id ? EXAMPLES.find((e) => e.id === id) : null;
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
  const reply = mockReply(content, body?.visitor ?? {}, messages.slice(0, -1));
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
  const ex = buildFor(instruction, typeof body?.previousHtml === 'string' && body.previousHtml.trim() ? body.previousHtml : undefined);
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
    console.log(`faq intents: ${AGENT.FAQ_INTENTS.length}, examples: ${EXAMPLES.map((e) => e.id).join(', ')}${ENV_FAIL ? `, MOCK_FAIL=${ENV_FAIL}` : ''}`);
  });
}

