import type { TierConfig } from '../tiers';
import type { Engine, Scene } from './types';
import { CpuEngine } from './cpu';

/**
 * Build the engine for a tier. The GPU engine (and with it the three.js WebGPU chunk) is imported only when a
 * GPU tier is chosen: tier 0 (canvas2d) never fetches it (POLISH2 B4; see __tests__/lazy-gpu.test.ts).
 */
export async function makeEngine(cfg: TierConfig, canvas: HTMLCanvasElement, scene: Scene): Promise<Engine> {
  const init = { canvas, count: cfg.count, bloom: cfg.bloom, dprCap: cfg.dprCap, scene };
  if (cfg.backend === 'canvas2d') { const e = new CpuEngine(init); await e.init(); return e; }
  const { GpuEngine } = await import('./gpu');
  const e = new GpuEngine(init, cfg.backend);
  await e.init();
  return e;
}
