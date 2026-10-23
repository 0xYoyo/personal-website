/**
 * Analytic divergence-free flow ("curl noise" without a noise texture): the 2D curl of a sum of
 * travelling sine waves, plus a small z wobble. Cheap, identical on GPU (TSL mirror in gpu.ts) and CPU.
 * Waves: [kx, ky, freqMul, omega, phase, weight]
 */
export const FLOW_WAVES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0.86, 0.51, 1.0, 0.11, 0.0, 1.0],
  [-0.54, 0.84, 1.9, -0.17, 1.3, 0.62],
  [0.83, -0.56, 3.1, 0.23, 2.1, 0.26],
  [0.12, 0.99, 5.3, -0.29, 4.2, 0.1],
];

export function flowAt(x: number, y: number, t: number, freq: number, out: [number, number, number]): void {
  let vx = 0, vy = 0, vz = 0;
  for (const [kx, ky, fm, om, ph, w] of FLOW_WAVES) {
    const f = freq * fm;
    const a = (kx * x + ky * y) * f + om * t + ph;
    const c = Math.cos(a);
    vx += w * c * ky;
    vy -= w * c * kx;
    vz += w * 0.35 * Math.sin(a * 0.7 + ph);
  }
  out[0] = vx; out[1] = vy; out[2] = vz;
}

/** Agitation wave: wavenumber (rad/px) and angular speed (rad/s). */
export const WAVE_K = (Math.PI * 2) / 280;
export const WAVE_W = 2.3;
