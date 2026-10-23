// Runs after `vite build` (npm "postbuild"). Writes dist/robots.txt and
// dist/sitemap.xml with absolute URLs from VITE_SITE_URL, and fails the build
// if any %VITE_*% placeholder was left unreplaced in dist/index.html.
// VITE_SITE_URL may be empty (no domain yet): robots.txt then has no Sitemap
// line, no sitemap.xml is written, and index.html (see the site-url plugin in
// vite.config.ts) has no canonical/og:url and a root-relative og:image.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = loadEnv('production', root, 'VITE_');
const site = (env.VITE_SITE_URL ?? '').trim();

if (site && !/^https?:\/\/[^/]+(\/.*)?\/$/.test(site)) {
  console.error(`VITE_SITE_URL must be an absolute URL ending in "/", got "${site}"`);
  process.exit(1);
}

let html = readFileSync(`${root}dist/index.html`, 'utf8');
if (!site) {
  // Belt and braces: strip any site prefix the plugin did not see.
  const cleaned = html
    .replace(/^.*<link rel="canonical" href="(%VITE_SITE_URL%)?" \/>\n/m, '')
    .replace(/^.*<meta property="og:url" content="(%VITE_SITE_URL%)?" \/>\n/m, '')
    .replaceAll('%VITE_SITE_URL%', '/');
  if (cleaned !== html) writeFileSync(`${root}dist/index.html`, (html = cleaned));
}
const left = html.match(/%VITE_[A-Z_]+%/g);
if (left) {
  console.error(`dist/index.html still has placeholders: ${[...new Set(left)].join(', ')}`);
  process.exit(1);
}
if (/href=""|content=""/.test(html)) {
  console.error('dist/index.html has an empty href/content (an unset URL)');
  process.exit(1);
}

if (!site) {
  writeFileSync(`${root}dist/robots.txt`, `User-agent: *\nAllow: /\n`);
  rmSync(`${root}dist/sitemap.xml`, { force: true });
  console.log('seo: VITE_SITE_URL is empty: robots.txt without a Sitemap line, no sitemap.xml, no canonical/og:url');
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(`${root}dist/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);
writeFileSync(
  `${root}dist/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site}</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
);
console.log(`seo: robots.txt and sitemap.xml for ${site}`);
