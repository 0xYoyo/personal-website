// node --test tools/mock-worker.test.mjs — smoke test of the mock's endpoints and failure modes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MOCK_FAST = '1';
const { createMockServer, mockReply } = await import('./mock-worker.mjs');

const server = createMockServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify(body) });

async function sse(res) {
  const text = await res.text();
  return text.split('\n\n').filter((b) => b.startsWith('data: ')).map((b) => JSON.parse(b.slice(6)));
}

test('health', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('/chat streams 4-char tokens of a faq reply, then done', async () => {
  const r = await post('/chat', { messages: [{ role: 'visitor', text: 'who is yoyo?' }], visitor: {} });
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const ev = await sse(r);
  assert.deepEqual(ev.at(-1), { type: 'done' });
  const toks = ev.filter((e) => e.type === 'token');
  const text = toks.map((e) => e.text).join('');
  assert.ok(text.startsWith('[[become:curls]] Yoav Zrihan.'));
  assert.ok(toks.every((e) => e.text.length <= 4));
});

test('replies like the live model for builds, names, emoji', () => {
  assert.equal(mockReply('make me a pomodoro timer'), '[[build:pomodoro timer]] on it.');
  assert.match(mockReply("I'm Dana"), /^\[\[become:Dana\]\] nice to meet you, Dana\./);
  assert.match(mockReply('🚀'), /^\[\[become:🚀\]\] \[\[mood:excited\]\]/);
  assert.match(mockReply('what has he built?'), /\[\[show:prompt-racers\]\]/);
  assert.equal(mockReply('do you play fortnite'), '[[become:ramp]] he could build a ramp before you could aim.');
  assert.equal(mockReply('cs2?'), "[[become:rush B]] rush B. don't stop.");
  assert.equal(mockReply('curls'), "[[become:curls]] yes, they're real.");
  assert.match(mockReply('what does he look like'), /^\[\[become:curls\]\] Long curly hair/);
});

test('"How do I reach him?" is the contact reply, not "who" (POLISH1 C2)', () => {
  assert.equal(mockReply('How do I reach him?'), '[[become:envelope-open]] yoavyoav310@gmail.com. He reads everything. Say you met the agent. [[contact]]');
});

test('"Next one" walks on from the last card in the conversation', () => {
  const history = [{ role: 'visitor', text: 'what has he built?' }, { role: 'agent', text: '[[become:kart]] Seven things. [[show:prompt-racers]]' }];
  assert.equal(mockReply('Next one', {}, history), '[[show:unfiltered]]');
});

test('every chip the site can show resolves to the right intent through the mock', async () => {
  const { evalChips } = await import('./eval-brain.mjs');
  const rows = evalChips((t) => mockReply(t, {}, []), 'mock');
  assert.ok(rows.length >= 20);
  assert.deepEqual(rows.filter((r) => !r.ok), []);
});

test('/build streams a prebuilt app picked by keyword', async () => {
  const ev = await sse(await post('/build', { instruction: 'a weather card' }));
  const html = ev.filter((e) => e.type === 'chunk').map((e) => e.html).join('');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Sample data for a demo/);
  assert.equal(ev.at(-1).type, 'done');
  assert.equal(ev.at(-1).bytes, Buffer.byteLength(html));
});

test('/share + /s/:id with the sandbox CSP', async () => {
  const r = await post('/share', { html: '<p>hi</p>' });
  const { id, url } = await r.json();
  assert.match(id, /^[A-Za-z0-9]{10}$/);
  const g = await fetch(url);
  assert.equal(await g.text(), '<p>hi</p>');
  assert.match(g.headers.get('content-security-policy'), /^sandbox allow-scripts; default-src 'none'/);
});

test('failure modes via /__fail/<mode>/', async () => {
  const body = { messages: [{ role: 'visitor', text: 'hi' }] };
  assert.equal((await post('/__fail/down/chat', body)).status, 502);
  assert.equal((await post('/__fail/offline/chat', body)).status, 503);
  const q = await post('/__fail/quota/chat', body);
  assert.equal(q.status, 429);
  assert.deepEqual(await q.json(), { reason: 'quota' });
  const rt = await post('/__fail/rate/chat', body);
  assert.equal((await rt.json()).reason, 'rate');
  assert.deepEqual(await sse(await post('/__fail/empty/chat', body)), [{ type: 'done' }]);
  await assert.rejects(async () => (await post('/__fail/drop/chat', { messages: [{ role: 'visitor', text: 'who is yoyo' }] })).text());
});

test('input caps', async () => {
  assert.equal((await post('/chat', { messages: [{ role: 'visitor', text: 'x'.repeat(601) }] })).status, 400);
  assert.equal((await post('/build', { instruction: 'x'.repeat(401) })).status, 400);
});

test('"Change it" really changes the page (POLISH2 C3)', async () => {
  const { changeHtml, planChange } = await import('./lib/change-html.mjs');
  const first = await sse(await post('/build', { instruction: 'a todo app' }));
  const todo = first.filter((e) => e.type === 'chunk').map((e) => e.html).join('');
  assert.match(todo, /<title>Today<\/title>/);

  const changed = async (instruction, previousHtml = todo) =>
    (await sse(await post('/build', { instruction, previousHtml }))).filter((e) => e.type === 'chunk').map((e) => e.html).join('');

  // dark: the page's own dark palette, forced on
  const dark = await changed('make it dark');
  assert.notEqual(dark, todo);
  assert.match(dark, /<style data-mock-change>:root \{ --bg: #121110;[^<]*color-scheme: dark;/);
  assert.ok(dark.indexOf('data-mock-change') < dark.indexOf('</head>'));
  // and back
  const light = changeHtml(dark, 'now light mode');
  assert.match(light.split('data-mock-change').at(-1), /--bg: #f6f4ef;[^<]*color-scheme: light;/);
  // an accent
  assert.match(changeHtml(todo, 'make it green'), /--accent: #1f8a5b;/);
  assert.equal(planChange('make it blue').kind, 'accent');
  assert.notEqual(planChange('make it blue').value, '#2b4bff');
  // anything else: a visible note, escaped
  const note = await changed('add <b>confetti</b>');
  assert.match(note, /<div data-mock-note role="status">changed: add &lt;b&gt;confetti&lt;\/b&gt;<\/div>\n<\/body>/);
  // a change naming another app gets that app
  assert.match(await changed('turn it into a weather card'), /<title>Weather<\/title>/);
  // still the same app when it names itself
  const { buildFor } = await import('./mock-worker.mjs');
  assert.equal(buildFor('make the todo list dark', todo).id, 'change');
  // changes stack, and the html always differs
  assert.notEqual(changeHtml(dark, 'make it dark'), dark);
});
