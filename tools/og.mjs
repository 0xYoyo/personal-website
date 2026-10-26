/* global document, window, FontFace, requestAnimationFrame */
// Renders the social cards from the real swarm (the swarm-demo page, canvas2d
// tier so it is deterministic and fast in headless Chromium): the swarm knitted
// into the YOYO letters on the dark scene, and the mono line bottom-left.
//   npm run og                       (starts a Vite dev server on :5178)
//   OG_URL=http://127.0.0.1:5173 npm run og
// Output: apps/web/public/og.png (1200×630) and og-square.png (1200×1200).
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'apps', 'web', 'public');
const exe = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function server() {
  if (process.env.OG_URL) return { url: process.env.OG_URL, stop() {} };
  const port = 5178;
  const child = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: join(root, 'apps', 'web'), stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* not yet */
    }
    await wait(150);
  }
  return { url, stop: () => child.kill() };
}

/** the page's description (WAVE3 S4), with the name line under it, fainter */
const LINE = 'Ask me anything. Or type a word and I’ll become it.';
const NAME = 'Yoav Zrihan · 0xYoyo';

async function render(browser, base, { width, height, out, count }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/swarm-demo.html?panel=0&tier=0&adaptive=0&count=${count}&spawn=scatter`);
  await page.waitForFunction(() => !!window.swarm, null, { timeout: 60000 });
  // the mono line, in the site's type
  await page.evaluate(
    async ({ line, name, mobile }) => {
      const ff = new FontFace('Commit Mono', 'url(/src/assets/fonts/CommitMono-VF.woff2)');
      document.fonts.add(await ff.load());
      const left = mobile ? '64px' : '56px';
      const size = mobile ? 30 : 26;
      const add = (text, bottom, px, color) => {
        const p = document.createElement('p');
        p.textContent = text;
        Object.assign(p.style, {
          position: 'fixed', left, bottom: `${bottom}px`, margin: '0',
          font: `400 ${px}px "Commit Mono", ui-monospace, monospace`, color, letterSpacing: '0',
        });
        document.body.append(p);
      };
      const base = mobile ? 64 : 48;
      add(name, base, size - 6, '#6B655C');
      add(line, base + size + 8, size, '#C9C2B6');
    },
    { line: LINE, name: NAME, mobile: width === height },
  );
  // deterministic: manual clock, knit the letters, settle, then stop where the sway faces front
  await page.evaluate(async () => {
    const s = window.swarm;
    s.setManualClock(true);
    s.pointer(-9999, -9999, 0, 0);
    s.become({ kind: 'yoyo3d' });
    for (let i = 0; i < 60 * 3; i++) {
      s.step(1 / 60, false);
      if (i % 30 === 29) await new Promise((r) => setTimeout(r, 0));
    }
    // the letters sway as sin(0.7 t); step until they face the camera
    for (let i = 0; i < 600 && Math.abs(Math.sin(s._time * 0.7)) > 0.03; i++) s.step(1 / 60, false);
    s.step(1 / 60, true);
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: out });
  await page.close();
  console.log('wrote', out);
}

const srv = await server();
const browser = await chromium.launch({ executablePath: exe, args: ['--ignore-gpu-blocklist'] });
try {
  await render(browser, srv.url, { width: 1200, height: 630, out: join(pub, 'og.png'), count: 16000 });
  await render(browser, srv.url, { width: 1200, height: 1200, out: join(pub, 'og-square.png'), count: 22000 });
} finally {
  await browser.close();
  srv.stop();
}
