// Showcase registry. Integration replaces each entry with the real component
// from the showcases part (same props: `{ project, reducedMotion }`).
import { PlaceholderShowcase } from './Placeholder';
import type { Showcase, ShowcaseRegistry } from './types';
import type { ShowcaseId } from '../content/projects';

export const showcases: ShowcaseRegistry = {
  'prompt-racers': PlaceholderShowcase,
  unfiltered: PlaceholderShowcase,
  'yoyo-loop': PlaceholderShowcase,
  'runi-connector': PlaceholderShowcase,
  'availability-monitor': PlaceholderShowcase,
  'pnl-bot': PlaceholderShowcase,
  polybot: PlaceholderShowcase,
};

export const getShowcase = (id: ShowcaseId): Showcase => showcases[id] ?? PlaceholderShowcase;
export type { ShowcaseProps, Showcase } from './types';
