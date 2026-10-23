import type { SectionId } from '../factory/types';

// Written content, not generated: the "1 note" in each PR's review verdict.
// One dry, true line per section.
export const reviewNotes: Record<SectionId, string> = {
  hero: 'Every dot is a real commit. None were added for effect.',
  loop: 'The diagram is the real pipeline, skill names included.',
  projects: 'Two of these are paused or stopped, and say so. Approve.',
  early: 'Every repo date is its first commit. The 2024 gap is left in on purpose.',
  gitlog: 'The 2024 gap is drawn at its real length. Leave it.',
  now: 'Live data degrades silently. Approve.',
  stack: 'Python is listed as basic because it is.',
  contact: 'No phone number, by design.',
};
