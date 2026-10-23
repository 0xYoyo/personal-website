import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import ProjectsSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const projectsSection: SectionModule = {
  id: 'projects',
  pr: 3,
  title: 'feat: projects',
  branch: 'feat/projects',
  spec,
  reviewNote: reviewNotes.projects,
  source,
  Component: ProjectsSection,
  minHeight: 3400,
  sourcePath: 'src/sections/projects/ProjectRow.tsx',
};
