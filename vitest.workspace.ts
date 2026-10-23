import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';

// One `vitest run` at the root covers every workspace.
export default defineWorkspace([
  { test: { name: 'protocol', include: ['packages/protocol/src/**/*.test.ts'], environment: 'node' } },
  {
    plugins: [react()],
    resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
    test: { name: 'web', include: ['apps/web/src/**/*.test.{ts,tsx}'], environment: 'jsdom', css: false },
  },
  { test: { name: 'worker', include: ['apps/worker/test/**/*.test.ts'], environment: 'node' } },
]);
