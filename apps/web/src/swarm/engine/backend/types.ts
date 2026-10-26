import type { Backend } from '../tiers';
import type { SimParams } from './params';
import type { Targets } from '../shapes';

export type Scene = 'dark' | 'light';

export interface EngineInit {
  canvas: HTMLCanvasElement;
  count: number;
  bloom: boolean;
  dprCap: number;
  scene: Scene;
}

/** One backend (webgpu / webgl2 via three, or canvas2d). Behaviour lives in the shared controller. */
export interface Engine {
  readonly backend: Backend;
  readonly count: number;
  init(): Promise<void>;
  resize(cssW: number, cssH: number): void;
  /** A = previous targets, B = new targets (staggered hand-off between them happens per particle). */
  setTargets(a: Targets, b: Targets): void;
  /** Overwrite positions/velocities (entry pour-in, reduced-motion scatter). */
  setState(pos: Float32Array, vel: Float32Array): void;
  setScene(scene: Scene): void;
  /** A performed scene's per-particle group info (n × [group, trail u, reveal, 0]); null = no groups. */
  setGroups?(info: Float32Array | null): void;
  /** The performed groups' poses / looks / trail history (engine/perform.ts layout), every frame. */
  setGroupData?(data: Float32Array): void;
  /** Simulate one step; draw unless `draw` is false (fast-forward under the manual clock). */
  frame(p: SimParams, draw?: boolean): void;
  screenshot(): Promise<Blob>;
  destroy(): void;
}

export const COLORS = {
  dark: { bg: '#0B0A09', base: '#F4EFE6', fast: '#9DB4FF' },
  light: { bg: '#EDEAE3', base: '#171411', fast: '#2B3A8F' },
} as const;

export function hexToRgb01(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
