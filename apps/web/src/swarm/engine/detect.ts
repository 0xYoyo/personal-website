import type { Backend, Caps, DeviceSignals } from './tiers';

export interface Detected extends Caps { backend: Backend; weak: boolean; signals: DeviceSignals }

let cached: Promise<Detected> | null = null;

interface AdapterLike { info?: { vendor?: string; architecture?: string; isFallbackAdapter?: boolean }; isFallbackAdapter?: boolean }

/** Feature-detect the best backend. WebGPU needs a real adapter, not just `navigator.gpu`. */
export function detectBackend(): Promise<Detected> {
  if (cached) return cached;
  cached = (async () => {
    let webgpu = false;
    let gpuVendor: string | null = null, gpuArch: string | null = null, gpuFallback = false;
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (gpu) {
        const a = (await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 1500))])) as AdapterLike | null;
        webgpu = !!a;
        if (a) {
          gpuVendor = a.info?.vendor || null;
          gpuArch = a.info?.architecture || null;
          gpuFallback = !!(a.info?.isFallbackAdapter ?? a.isFallbackAdapter);
        }
      }
    } catch { webgpu = false; }
    let webgl2: boolean;
    let glRenderer: string | null = null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      webgl2 = !!gl;
      if (gl) {
        // the unmasked renderer names a software rasteriser (SwiftShader, llvmpipe); Firefox / Safari give it as RENDERER
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        glRenderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '') || null;
      }
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { webgl2 = false; }
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const mobile = coarse && Math.min(screen.width, screen.height) < 820;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? null, memory = nav.deviceMemory ?? null;
    const weak = (cores ?? 4) <= 2 && (memory ?? 4) <= 2;
    const backend: Backend = webgpu ? 'webgpu' : webgl2 ? 'webgl2' : 'canvas2d';
    const signals: DeviceSignals = { cores, memory, gpuVendor, gpuArch, gpuFallback, glRenderer };
    return { webgpu, webgl2, mobile, weak, backend, signals };
  })();
  return cached;
}
