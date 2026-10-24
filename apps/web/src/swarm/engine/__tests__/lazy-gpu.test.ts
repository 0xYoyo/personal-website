import { describe, expect, it, vi } from 'vitest';

// POLISH2 B4: tier 0 (canvas2d) must never fetch the three.js WebGPU chunk.
const loaded = vi.hoisted(() => ({ gpu: false }));
vi.mock('../backend/gpu', () => {
  loaded.gpu = true;
  return { GpuEngine: class { backend: string; count = 1; constructor(_o: unknown, b: string) { this.backend = b; } async init(): Promise<void> {} } };
});

import { makeEngine } from '../backend/load';
import { tierConfig } from '../tiers';

const caps = { webgpu: true, webgl2: true, mobile: false };
const canvas = { getContext: () => ({}) } as unknown as HTMLCanvasElement;

describe('lazy GPU import boundary (POLISH2 B4)', () => {
  it('tier 0 builds the canvas2d engine without importing the GPU module; a GPU tier imports it', async () => {
    const e0 = await makeEngine(tierConfig(0, caps), canvas, 'dark');
    expect(e0.backend).toBe('canvas2d');
    expect(loaded.gpu).toBe(false);
    const e3 = await makeEngine(tierConfig(3, caps), canvas, 'dark');
    expect(e3.backend).toBe('webgpu');
    expect(loaded.gpu).toBe(true);
  });

  it('nothing statically reachable from the engine entry imports three; three is only imported lazily', () => {
    // every engine source as text, keyed by its path relative to engine/
    const raw = import.meta.glob(['../**/*.ts', '!../**/__tests__/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const src = new Map(Object.entries(raw).map(([k, v]) => [k.replace(/^\.\.\//, ''), v]));
    const norm = (from: string, rel: string): string => {
      const parts = from.split('/').slice(0, -1);
      for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
      return parts.join('/');
    };
    const seen = new Map<string, string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      const text = src.get(file);
      if (text === undefined) return;
      seen.set(file, text);
      for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
        const base = norm(file, m[1]!);
        for (const f of [`${base}.ts`, `${base}/index.ts`]) if (src.has(f)) { visit(f); break; }
      }
    };
    visit('index.ts');
    const files = [...seen.keys()].sort();
    expect(files).toContain('backend/cpu.ts');
    expect(files).toContain('backend/load.ts');
    expect(files).not.toContain('backend/gpu.ts');
    for (const [f, text] of seen) {
      expect(text, f).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+['"]three/m);
    }
    // the only dynamic three imports on that graph sit in the mesh YOYO sampler (GPU tiers only)
    const shapes = seen.get('shapes.ts')!;
    const mesh = shapes.slice(shapes.indexOf('async function yoyoMeshTargets'));
    const outside = shapes.slice(0, shapes.indexOf('async function yoyoMeshTargets'));
    expect(outside).not.toMatch(/import\(\s*['"]three/);
    expect(mesh).toMatch(/import\(\s*['"]three\/webgpu['"]\)/);
    expect(shapes).toMatch(/vp\.lite \? yoyoMaskTargets\(n, vp\) : await yoyoMeshTargets\(n, vp\)/);
    // and the GPU engine module is only reached through the dynamic import in load.ts
    expect(seen.get('backend/load.ts')).toMatch(/await import\('\.\/gpu'\)/);
  });
});
