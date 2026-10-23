import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import HeroSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const heroSection: SectionModule = {
  id: 'hero',
  pr: 1,
  title: 'chore: init',
  branch: 'yoyo-init',
  spec,
  reviewNote: reviewNotes.hero,
  source,
  Component: HeroSection,
  minHeight: 0,
  sourcePath: 'src/sections/hero/cloud.ts',
};
