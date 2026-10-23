import type { Backend, Caps } from './tiers';

export interface Detected extends Caps { backend: Backend; weak: boolean }

let cached: Promise<Detected> | null = null;

/** Feature-detect the best backend. WebGPU needs a real adapter, not just `navigator.gpu`. */
export function detectBackend(): Promise<Detected> {
  if (cached) return cached;
  cached = (async () => {
    let webgpu = false;
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (gpu) webgpu = !!(await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 1500))]));
    } catch { webgpu = false; }
    let webgl2: boolean;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      webgl2 = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webgl2 = false; }
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const mobile = coarse && Math.min(screen.width, screen.height) < 820;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weak = (nav.hardwareConcurrency ?? 4) <= 2 && (nav.deviceMemory ?? 4) <= 2;
    const backend: Backend = webgpu ? 'webgpu' : webgl2 ? 'webgl2' : 'canvas2d';
    return { webgpu, webgl2, mobile, weak, backend };
  })();
  return cached;
}
