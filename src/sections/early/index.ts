import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import EarlySection from './Component';
import { source } from './source';
import { spec } from './spec';

export const earlySection: SectionModule = {
  id: 'early',
  pr: 4,
  title: 'feat: early',
  branch: 'feat/early',
  spec,
  reviewNote: reviewNotes.early,
  source,
  Component: EarlySection,
  minHeight: 1900,
  sourcePath: 'src/sections/early/Timeline.tsx',
};
