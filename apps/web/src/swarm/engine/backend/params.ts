/** Everything a backend needs to simulate one frame. Produced by the controller, consumed by gpu.ts / cpu.ts. */
export interface SimParams {
  time: number; dt: number;
  // knit / release
  phaseStart: number; spread: number; ramp: number; goal: number; prevGoal: number; transit: number;
  selectFrac: number; // particles with seed.w < selectFrac take part in target attraction (frame density)
  shapeCx: number; shapeCy: number; targetScale: number; rotY: number; spinOn: number;
  ringLevel: number; ringOn: number;
  // free flight
  flowAmp: number; flowFreq: number; speedMin: number; speedMax: number; wild: number;
  align: number; sep: number; coh: number; cruise: number; waveAmp: number;
  leaderX: number; leaderY: number; leaderW: number;
  vortexW: number; vortexR: number; vortexCx: number; vortexCy: number; vortexSpeed: number; vortexFlat: number;
  // interaction
  pointerX: number; pointerY: number; pointerVx: number; pointerVy: number; pointerR: number; pointerOn: number;
  burst: number; burstX: number; burstY: number;
  halfW: number; halfH: number;
  freeze: number; snap: number;
  // look
  pulse: number; brightness: number; camX: number; camY: number; sizeScale: number;
}

export function defaultParams(): SimParams {
  return {
    time: 0, dt: 1 / 60,
    phaseStart: -100, spread: 0.6, ramp: 0.35, goal: 0, prevGoal: 0, transit: 0, selectFrac: 1.01,
    shapeCx: 0, shapeCy: 0, targetScale: 1, rotY: 0, spinOn: 0, ringLevel: 0, ringOn: 0,
    flowAmp: 150, flowFreq: 1 / 900, speedMin: 40, speedMax: 340, wild: 0,
    align: 0.7, sep: 80, coh: 260, cruise: 230, waveAmp: 0.25,
    leaderX: 0, leaderY: 0, leaderW: 1.2,
    vortexW: 0, vortexR: 120, vortexCx: 0, vortexCy: 0, vortexSpeed: 420, vortexFlat: 0,
    pointerX: 1e5, pointerY: 1e5, pointerVx: 0, pointerVy: 0, pointerR: 90, pointerOn: 0,
    burst: 0, burstX: 0, burstY: 0,
    halfW: 640, halfH: 360,
    freeze: 0, snap: 0,
    pulse: 0, brightness: 1, camX: 0, camY: 0, sizeScale: 1,
  };
}

/** Field (neighbourhood grid) resolution shared by both simulators. */
export const FIELD_W = 96;
export const FIELD_H = 54;
export const FIELD_MARGIN = 1.3; // field spans the viewport × this
export const FIELD_VEL_SCALE = 1 / 1000; // velocities are stored scaled to keep half floats precise
