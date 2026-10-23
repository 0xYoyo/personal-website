// The showcase contract: one React component per project, rendered inside the
// card's showcase slot. It fills its parent (100% × 100%), loops on its own,
// and shows a static key frame when `reducedMotion` is true.
// Slot size: desktop ≈ 488 × 492 CSS px (card 860 × 540); mobile full width × 62vw.
import type { ComponentType } from 'react';
import type { Project, ShowcaseId } from '../content/projects';

export interface ShowcaseProps {
  project: Project;
  reducedMotion: boolean;
}

export type Showcase = ComponentType<ShowcaseProps>;
export type ShowcaseRegistry = Record<ShowcaseId, Showcase>;
