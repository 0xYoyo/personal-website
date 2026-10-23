import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import GitLogSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const gitlogSection: SectionModule = {
  id: 'gitlog',
  pr: 5,
  title: 'feat: life as a git log',
  branch: 'feat/git-log',
  spec,
  reviewNote: reviewNotes.gitlog,
  source,
  Component: GitLogSection,
  minHeight: 1200,
  sourcePath: 'src/sections/gitlog/layout.ts',
};
