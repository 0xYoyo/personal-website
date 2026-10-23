import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import StackSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const stackSection: SectionModule = {
  id: 'stack',
  pr: 7,
  title: 'feat: stack',
  branch: 'feat/stack',
  spec,
  reviewNote: reviewNotes.stack,
  source,
  Component: StackSection,
  minHeight: 540,
  sourcePath: 'src/sections/stack/Component.tsx',
};
