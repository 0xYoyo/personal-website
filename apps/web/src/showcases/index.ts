// Showcase registry: the seven live motion pieces (SPEC §3.4), one per carded
// project. Each fills its slot, loops on its own, pauses offscreen / in hidden
// tabs, and shows a static key frame when `reducedMotion` is true.
import { showcases as parts } from './parts';
import type { Showcase, ShowcaseRegistry } from './types';
import type { ShowcaseId } from '../content/projects';

export const showcases: ShowcaseRegistry = parts;

export const getShowcase = (id: ShowcaseId): Showcase => showcases[id];
export { showcaseOrder, showcaseTiming, ShowcaseFrame, configureShowcases } from './parts';
export type { ShowcaseProps, Showcase } from './types';
