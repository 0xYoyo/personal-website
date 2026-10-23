/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const base = process.env.VITE_BASE ?? '/';

/**
 * With no VITE_SITE_URL (no domain yet) index.html must not carry an empty
 * canonical or og:url, and its image URLs become root-relative. Runs before
 * Vite's own %VITE_*% replacement, so it sees the raw placeholders.
 */
function siteUrl(): Plugin {
  let site = '';
  return {
    name: 'site-url',
    configResolved(config) {
      site = String(config.env.VITE_SITE_URL ?? '').trim();
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (site) return html;
        return html
          .replace(/^.*<!-- Absolute URLs below.*\n/m, '')
          .replace(/^.*<link rel="canonical" href="%VITE_SITE_URL%" \/>\n/m, '')
          .replace(/^.*<meta property="og:url" content="%VITE_SITE_URL%" \/>\n/m, '')
          .replace(/^.*"url": "%VITE_SITE_URL%",\n/m, '')
          .replaceAll('%VITE_SITE_URL%', base);
      },
    },
  };
}

// VITE_BASE lets GitHub Pages serve the site from /<repo>/; everything else uses '/'.
export default defineConfig({
  base,
  plugins: [react(), siteUrl()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Long-lived vendor chunk; the baked GitHub data changes on its own schedule.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('/src/data/') && id.endsWith('.json')) return 'data';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
