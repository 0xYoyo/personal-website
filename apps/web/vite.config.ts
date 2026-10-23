import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `three` is aliased to `three/webgpu` so the swarm engine and the three addons share one copy.
// Two pages: the site (index.html) and the swarm QA page (swarm-demo.html → /swarm-demo.html).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'swarm-demo': resolve(__dirname, 'swarm-demo.html'),
      },
    },
  },
});
