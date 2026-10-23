import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import NowSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const nowSection: SectionModule = {
  id: 'now',
  pr: 6,
  title: 'feat: live now',
  branch: 'feat/live',
  spec,
  reviewNote: reviewNotes.now,
  source,
  Component: NowSection,
  minHeight: 680,
  sourcePath: 'src/sections/now/useLive.ts',
};
