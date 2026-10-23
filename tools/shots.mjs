/* global document, window */
// Playwright QA for the integrated site: screenshots of every journey on
// desktop (1440×900) and mobile (390×844), CDP screencasts of the entry and of
// "spell dana", and contact sheets of both.
//
//   npm run shots                                  starts Vite (:5179) + the mock worker (:8797)
//   SHOTS_ONLY=entry,cards npm run shots           subset (scenario names below, or "screencast")
//   SHOTS_VP=desktop npm run shots                 one viewport
//   SHOTS_TIER=2 npm run shots                     swarm tier (default 0 = canvas2d: real time in
//                                                  headless Chromium; the GPU tiers run at ~1 fps in
//                                                  SwiftShader, so their shots are about layout only)
//   SHOTS_URL=http://127.0.0.1:4173 npm run shots  use a running site (its own agent URL)
//
// Output: tools/out/<viewport>-<name>.png, tools/out/cast/<name>/*.jpg, tools/out/sheets/*.png
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tools', 'out');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => existsSync(p));
const only = process.env.SHOTS_ONLY?.split(',').filter(Boolean);
const vpOnly = process.env.SHOTS_VP;
const tier = process.env.SHOTS_TIER ?? '0';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (name) => !only || only.includes(name);

async function until(url, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await wait(150);
  }
  throw new Error(`no answer from ${url}`);
}

async function startServers() {
  if (process.env.SHOTS_URL) return { url: process.env.SHOTS_URL, stop() {} };
  const mockPort = 8797;
  const mock = spawn(process.execPath, [join(root, 'tools', 'mock-worker.mjs')], { env: { ...process.env, PORT: String(mockPort) }, stdio: 'ignore' });
  const port = 5179;
  const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: join(root, 'apps', 'web'),
    env: { ...process.env, VITE_AGENT_URL: `http://127.0.0.1:${mockPort}` },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  await until(`http://127.0.0.1:${mockPort}/health`);
  await until(url);
  return { url, stop: () => (vite.kill(), mock.kill()) };
}

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const PROJECTS = ['prompt-racers', 'unfiltered', 'yoyo-loop', 'runi-connector', 'availability-monitor', 'pnl-bot', 'polybot'];
const q = (extra = '') => `${base}/?tier=${tier}${extra}`;
const ctl = (page, fn, arg) => page.evaluate(([f, a]) => window.__yoyo.ctl[f](a), [fn, arg]);

async function ready(page, extra = '') {
  await page.goto(q(`&skipEntry=1${extra}`));
  await page.waitForFunction(() => window.__yoyo?.store.getState().phase === 'ready', null, { timeout: 30000 });
  // let the greeting land so the idle tour does not start mid-scenario
  await wait(1200);
  await page.evaluate(() => window.__yoyo.store.getState().spendIdle());
}

async function say(page, text) {
  await page.locator('#y-input').fill(text);
  await page.keyboard.press('Enter');
}

/** Each scenario gets a fresh context (empty localStorage). */
const scenarios = {
  async entry(page, shot) {
    const t0 = Date.now();
    await page.goto(q());
    for (const t of [0.5, 1.5, 2.5, 4, 6]) {
      const ms = t * 1000 - (Date.now() - t0);
      if (ms > 0) await wait(ms);
      await shot(`entry-${t}s`);
    }
  },
  async who(page, shot) {
    await ready(page);
    await say(page, 'who is yoyo');
    await wait(1700);
    await shot('who-mid');
  },
  async rocket(page, shot) {
    await ready(page);
    await say(page, '🚀');
    await wait(2600);
    await shot('rocket');
  },
  async spell(page, shot) {
    await ready(page);
    await say(page, 'spell dana');
    await wait(2600);
    await shot('spell-dana');
  },
  async cards(page, shot) {
    await ready(page);
    for (const id of PROJECTS) {
      await ctl(page, 'openProject', id);
      await wait(2600);
      await shot(`card-${id}`);
    }
  },
  async build(page, shot) {
    await ready(page);
    await page.getByRole('button', { name: 'Build me something' }).click();
    await wait(7000);
    await shot('build-mid');
    await page.waitForFunction(() => window.__yoyo.store.getState().build.status === 'locked', null, { timeout: 40000 });
    await wait(2500);
    await shot('build-done');
  },
  async contact(page, shot) {
    await ready(page);
    await ctl(page, 'contact');
    await wait(2000);
    await shot('contact');
  },
  async stories(page, shot) {
    await ready(page);
    for (const [id, label] of [['2021', 'story-2'], ['road', 'story-4']]) {
      await ctl(page, 'startStory', id);
      await wait(3200);
      await shot(`${label}-mid`);
    }
  },
  async tour(page, shot) {
    await ready(page);
    await ctl(page, 'startTour');
    await page.waitForFunction(() => window.__yoyo.store.getState().runner?.sub === 'Unfiltered', null, { timeout: 60000 });
    await wait(900);
    await shot('tour-beat-3');
  },
  async light(page, shot) {
    await ready(page);
    await say(page, 'lights');
    await wait(2600);
    await shot('light');
  },
  async returning(page, shot) {
    // a visitor who told us their name and built something last time
    await page.goto(q('&skipEntry=1'));
    await page.evaluate(() => {
      localStorage.setItem('yoyo.v3.name', 'Dana');
      localStorage.setItem('yoyo.v3.visits', '2');
      localStorage.setItem('yoyo.v3.builds', JSON.stringify([{ instruction: 'a pomodoro timer', at: Date.now() - 86400000, ms: 15000, bytes: 8000, mode: 'scripted', example: 'pomodoro' }]));
      sessionStorage.clear();
    });
    await page.goto(q());
    await page.waitForFunction(() => window.__yoyo?.store.getState().phase === 'ready', null, { timeout: 30000 });
    await wait(4500);
    await shot('returning');
  },
};

// ------------------------------------------------------------- screencasts
/** CDP screencast for `ms`, then frames resampled every `step` ms (nearest earlier frame). */
async function screencast(page, name, ms, step, act) {
  const dir = join(out, 'cast', name);
  await mkdir(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
  await wait(150);
  const t0 = Date.now();
  await act();
  await wait(ms - (Date.now() - t0));
  await cdp.send('Page.stopScreencast');
  if (!frames.length) throw new Error(`${name}: no screencast frames`);
  const start = t0 - 0; // wall clock ≈ CDP timestamps (both epoch ms)
  const picked = [];
  for (let t = 0; t <= ms; t += step) {
    const at = start + t;
    let f = frames[0];
    for (const x of frames) if (x.t <= at) f = x;
    const file = join(dir, `${String(t).padStart(5, '0')}.jpg`);
    await writeFile(file, Buffer.from(f.data, 'base64'));
    picked.push({ file, label: `${(t / 1000).toFixed(1)} s` });
  }
  console.log(`cast ${name}: ${frames.length} frames captured, ${picked.length} sampled`);
  return picked;
}

/** A contact sheet: tiles in a grid with their labels, rendered by the browser. */
async function sheet(browser, name, tiles, { cols = 10, tileW = 288 } = {}) {
  await mkdir(join(out, 'sheets'), { recursive: true });
  const imgs = await Promise.all(tiles.map(async (t) => ({ label: t.label, src: `data:image/jpeg;base64,${(await readFile(t.file)).toString('base64')}` })));
  const page = await browser.newPage({ viewport: { width: cols * tileW + (cols + 1) * 6, height: 400 } });
  await page.setContent(`<body style="margin:0;background:#000;color:#aaa;font:12px monospace">
    <div style="display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:6px;padding:6px">
    ${imgs.map((i) => `<figure style="margin:0"><img src="${i.src}" style="width:100%;display:block"><figcaption style="padding:2px 0">${i.label}</figcaption></figure>`).join('')}
    </div></body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const file = join(out, 'sheets', `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  console.log(`sheet ${file}`);
}

// ---------------------------------------------------------------- run
let base = '';
const server = await startServers();
base = server.url;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server'] });
const errors = [];
const newPage = async (vpName, label) => {
  const vp = viewports[vpName];
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${vpName}/${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${vpName}/${label}: console ${m.text()}`));
  return { ctx, page };
};
try {
  for (const vpName of Object.keys(viewports)) {
    if (vpOnly && vpOnly !== vpName) continue;
    for (const [name, run] of Object.entries(scenarios)) {
      if (!want(name)) continue;
      const { ctx, page } = await newPage(vpName, name);
      const shot = (label) => page.screenshot({ path: join(out, `${vpName}-${label}.png`) });
      try {
        await run(page, shot);
        console.log(`ok ${vpName}/${name}`);
      } catch (e) {
        errors.push(`${vpName}/${name}: ${e.message.split('\n')[0]}`);
        await shot(`${name}-FAILED`).catch(() => undefined);
      }
      await ctx.close();
    }
    if (want('screencast')) {
      {
        const { ctx, page } = await newPage(vpName, 'cast-entry');
        await page.goto('about:blank');
        const tiles = await screencast(page, `${vpName}-entry`, 5000, 100, () => page.goto(q()));
        await sheet(browser, `${vpName}-entry`, tiles, vpName === 'mobile' ? { cols: 13, tileW: 150 } : {});
        await ctx.close();
      }
      {
        const { ctx, page } = await newPage(vpName, 'cast-spell');
        await ready(page);
        const tiles = await screencast(page, `${vpName}-spell-dana`, 4000, 100, () => say(page, 'spell dana'));
        await sheet(browser, `${vpName}-spell-dana`, tiles, vpName === 'mobile' ? { cols: 13, tileW: 150 } : {});
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  server.stop();
}
const benign = /No available adapters|favicon/;
const real = errors.filter((e) => !benign.test(e));
if (real.length) {
  console.log('\nerrors:\n' + real.join('\n'));
  process.exitCode = 1;
}
