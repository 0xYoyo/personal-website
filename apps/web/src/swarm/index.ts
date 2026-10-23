// The body. The shell owns a container element; the engine draws into a canvas
// inside it and may replace that canvas when the quality tier changes context
// type (WebGPU → WebGL2 → 2D), so nothing outside this module holds the canvas.
import type { SwarmHandle } from '@yoyo/protocol';
import { createSwarm as createEngine, type Swarm, type Tier } from './engine';

export type { SwarmHandle };
export type { Swarm };

export interface CreateSwarmOptions {
  scene?: 'dark' | 'light';
  reducedMotion?: boolean;
  /** QA: force a starting tier (0 = canvas2d … 3 = WebGPU 40k). */
  tier?: Tier;
  /** QA: disable the adaptive tier drop. */
  adaptive?: boolean;
}

export async function createSwarm(container: HTMLElement, opts: CreateSwarmOptions = {}): Promise<Swarm> {
  const canvas = document.createElement('canvas');
  canvas.className = 'y-canvas-el';
  canvas.setAttribute('aria-hidden', 'true');
  container.replaceChildren(canvas);
  return createEngine(canvas, {
    scene: opts.scene ?? 'dark',
    spawn: 'edges',
    ...(opts.reducedMotion !== undefined ? { reducedMotion: opts.reducedMotion } : {}),
    ...(opts.tier !== undefined ? { tier: opts.tier } : {}),
    ...(opts.adaptive !== undefined ? { adaptive: opts.adaptive } : {}),
  });
}
