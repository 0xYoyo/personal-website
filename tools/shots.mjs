// Playwright QA shots for the UI shell (desktop 1440×900 and mobile 390×844).
// Usage: npm run shots              (starts a Vite dev server on :5179)
//        SHOTS_URL=http://127.0.0.1:4173 npm run shots   (use a running server)
//        SHOTS_ONLY=card,build npm run shots              (subset)
// Output: tools/out/<viewport>-<name>.png
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tools', 'out');
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => existsSync(p));
const only = process.env.SHOTS_ONLY?.split(',').filter(Boolean);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  if (process.env.SHOTS_URL) return { url: process.env.SHOTS_URL, stop() {} };
  const port = 5179;
  const child = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: join(root, 'apps', 'web'),
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) break;
    } catch {
      /* not yet */
    }
    await wait(150);
  }
  return { url, stop: () => child.kill() };
}

const viewports = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Each scenario gets a fresh context (empty localStorage). */
const scenarios = {
  async entry(page, shot) {
    await page.goto(base);
    await wait(1000);
    await shot('entry-1s');
    await wait(2000);
    await shot('entry-3s');
    await wait(3000);
    await shot('entry-6s');
  },
  async who(page, shot) {
    await ready(page);
    await page.locator('#y-input').fill('who is yoyo');
    await page.keyboard.press('Enter');
    await wait(4200);
    await shot('who');
  },
  async card(page, shot) {
    await ready(page);
    await page.getByRole('button', { name: 'What has he built?' }).click();
    await wait(5200);
    await shot('card');
  },
  async build(page, shot) {
    await ready(page);
    await page.getByRole('button', { name: 'Build me something' }).click();
    await wait(9000);
    await shot('build-mid');
    await wait(5000);
    await shot('build-done');
  },
  async contact(page, shot) {
    await ready(page);
    await page.getByRole('button', { name: 'Contact', exact: true }).click();
    await wait(1800);
    await shot('contact');
  },
  async stories(page, shot) {
    await ready(page);
    await page.getByRole('button', { name: 'Stories', exact: true }).click();
    await wait(2600);
    await shot('stories');
  },
  async tour(page, shot) {
    await page.goto(base);
    await wait(13500);
    await shot('tour');
  },
  async light(page, shot) {
    await ready(page);
    await page.locator('#y-input').fill('lights');
    await page.keyboard.press('Enter');
    await wait(2500);
    await shot('light');
  },
};

async function ready(page) {
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('.y-bar-wrap')?.getAttribute('data-ready') === 'true', null, { timeout: 15000 });
  await wait(1200);
}

let base = '';
const server = await startServer();
base = server.url;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server'] });
const errors = [];
try {
  for (const [vpName, vp] of Object.entries(viewports)) {
    for (const [name, run] of Object.entries(scenarios)) {
      if (only && !only.includes(name)) continue;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${vpName}/${name}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(`${vpName}/${name}: console ${m.text()}`));
      const shot = (label) => page.screenshot({ path: join(out, `${vpName}-${label}.png`) });
      await run(page, shot);
      await ctx.close();
      console.log(`ok ${vpName}/${name}`);
    }
  }
} finally {
  await browser.close();
  server.stop();
}
if (errors.length) {
  console.log('\nerrors:\n' + errors.join('\n'));
  process.exitCode = 1;
}
