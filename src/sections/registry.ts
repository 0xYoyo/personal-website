// The ordered list of sections. Order here is PR order and page order.
import type { SectionMeta, SectionModule } from '../factory/types';
import { heroSection } from './hero';
import { loopSection } from './loop';
import { projectsSection } from './projects';
import { earlySection } from './early';
import { gitlogSection } from './gitlog';
import { nowSection } from './now';
import { stackSection } from './stack';
import { contactSection } from './contact';

export const registry: SectionModule[] = [
  heroSection,
  loopSection,
  projectsSection,
  earlySection,
  gitlogSection,
  nowSection,
  stackSection,
  contactSection,
];

/** What the factory store and scheduler need from each section. */
export const registryMeta: SectionMeta[] = registry.map((m) => ({
  id: m.id,
  pr: m.pr,
  title: m.title,
  branch: m.branch,
  reviewNote: m.reviewNote,
  sourceLines: m.source.split('\n').length,
  sourceChars: m.source.length,
  sourcePath: m.sourcePath,
  source: m.source,
}));
