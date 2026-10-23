// Screenshots the built site at three viewports, fresh (progress 0) and with
// ?skip=1 (fully merged), into shots/. Usage:
//   npm run shots            build, preview, shoot
//   npm run shots -- --no-build   reuse dist/
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
const { chromium } = await import('playwright');

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

if (!process.argv.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
mkdirSync('shots', { recursive: true });

const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: true,
});
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    await sleep(200);
  }
}

const browser = await chromium.launch();
const errors = [];
try {
  for (const vp of VIEWPORTS) {
    for (const variant of ['fresh', 'skip']) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(`${vp.name}/${variant}: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        // Sections that read live data (GitHub, mempool.space) degrade silently by design,
        // so a failed load of anything outside the preview server is not a page error.
        const url = m.location()?.url ?? '';
        if (/Failed to load resource/i.test(m.text()) && url && !url.startsWith(BASE)) return;
        errors.push(`${vp.name}/${variant}: ${m.text()}`);
      });
      await page.goto(variant === 'skip' ? `${BASE}?skip=1` : BASE, { waitUntil: 'networkidle' });
      await page.evaluate('document.fonts.ready');
      if (variant === 'fresh') {
        // #2 starts at 0.6 s and is waiting on the human by ~4 s (×0.6 on mobile).
        await sleep(4500);
        await page.screenshot({ path: `shots/${vp.name}-fresh-fold.png` });
        await page.screenshot({ path: `shots/${vp.name}-fresh-full.png`, fullPage: true });
        // First merge by hand, then let the lights and the wipe settle.
        const merge = page.locator('#loop .merge-btn.is-ready').first();
        try {
          await merge.waitFor({ state: 'visible', timeout: 20_000 });
          await merge.click();
          await sleep(1600);
          await page.locator('#loop').scrollIntoViewIfNeeded();
          await page.screenshot({ path: `shots/${vp.name}-merged-1.png` });
        } catch (e) {
          console.warn(`warning: ${vp.name}: #2 never became mergeable (${e.message.split('\n')[0]}); merged-1 shot skipped, ?skip=1 shots still taken`);
        }
      } else {
        await sleep(600);
        await page.screenshot({ path: `shots/${vp.name}-skip-fold.png` });
        await page.screenshot({ path: `shots/${vp.name}-skip-full.png`, fullPage: true });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else console.log('Screenshots saved to shots/');
