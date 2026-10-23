import type { SectionModule } from '../../factory/types';
import { reviewNotes } from '../../content/reviewNotes';
import ContactSection from './Component';
import { source } from './source';
import { spec } from './spec';

export const contactSection: SectionModule = {
  id: 'contact',
  pr: 8,
  title: 'feat: open a PR',
  branch: 'feat/contact',
  spec,
  reviewNote: reviewNotes.contact,
  source,
  Component: ContactSection,
  minHeight: 800,
  sourcePath: 'src/sections/contact/Component.tsx',
};
