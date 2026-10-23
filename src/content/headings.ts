import type { SectionId } from '../factory/types';

/**
 * The visible h2 of each section. SectionFrame renders it (sections must not),
 * and the same characters appear in the PR card so they can fly into place on
 * merge. Keep each at 32 characters or fewer.
 */
export interface Heading {
  text: string;
  /** Typeset in the mono face (for terminal-style titles). */
  mono?: boolean;
}

export const headings: Record<SectionId, Heading | null> = {
  hero: null, // the hero's h1 is the name; no section heading
  loop: { text: 'How I work' },
  projects: { text: "Things I've built" },
  early: { text: 'Early' },
  gitlog: { text: 'git log --graph --all', mono: true },
  now: { text: 'Now' },
  stack: { text: 'Stack' },
  contact: { text: 'Open a PR' },
};
