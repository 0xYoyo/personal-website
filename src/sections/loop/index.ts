import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import LoopSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const loopSection: SectionModule = {
  id: 'loop',
  pr: 2,
  title: 'feat: how I work',
  branch: 'feat/how-i-work',
  spec,
  reviewNote: reviewNotes.loop,
  source,
  Component: LoopSection,
  minHeight: 1150,
  sourcePath: 'src/sections/loop/LoopDiagram.tsx',
};
