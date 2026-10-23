// Renders the social cards from scripts/og.html with the real commit data:
//   public/og.png         1200x630  (og:image, twitter:image)
//   public/og-square.png  1080x1080 (platforms that crop to a square)
//   public/apple-touch-icon.png  180x180 (favicon.svg's mark, full bleed)
// Usage: npm run og   (commit the PNGs; the build does not regenerate them)
/* global window, document */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1';
const { chromium } = await import('playwright');

const root = fileURLToPath(new URL('..', import.meta.url));
const commits = JSON.parse(readFileSync(`${root}src/data/commits.json`, 'utf8'));
const data = {
  dates: commits.map((c) => c.d),
  repos: new Set(commits.map((c) => c.r)).size,
};
const page = pathToFileURL(`${root}scripts/og.html`).href;

const CARDS = [
  { file: 'public/og.png', width: 1200, height: 630, square: false },
  { file: 'public/og-square.png', width: 1080, height: 1080, square: true },
];

const browser = await chromium.launch();
try {
  for (const card of CARDS) {
    const ctx = await browser.newContext({ viewport: { width: card.width, height: card.height } });
    await ctx.addInitScript((og) => {
      window.OG = og;
    }, { ...data, square: card.square });
    const tab = await ctx.newPage();
    await tab.goto(page);
    await tab.evaluate(() => document.fonts.ready);
    const loaded = await tab.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
    if (loaded < 2) throw new Error(`fonts did not load (${loaded}/2)`);
    await tab.screenshot({ path: `${root}${card.file}` });
    await ctx.close();
    console.log(`wrote ${card.file} (${card.width}x${card.height}, ${data.dates.length} dots)`);
  }

  // Same mark as public/favicon.svg, without the rounded corners (iOS rounds them).
  const ctx = await browser.newContext({ viewport: { width: 180, height: 180 } });
  const tab = await ctx.newPage();
  await tab.setContent(
    '<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="180" height="180">' +
      '<rect width="32" height="32" fill="#15120E"/><circle cx="16" cy="16" r="5" fill="#F1ECE2"/></svg></body>',
  );
  await tab.screenshot({ path: `${root}public/apple-touch-icon.png` });
  await ctx.close();
  console.log('wrote public/apple-touch-icon.png (180x180)');
} finally {
  await browser.close();
}
