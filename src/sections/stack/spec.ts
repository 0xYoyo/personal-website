import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'Skills are grouped Languages, Web & data, AI & tooling, Infra & testing, in two columns on desktop and one on a phone.',
    'Each group is a small heading followed by one comma-separated run of plain text.',
    'Every keyword in the spec skills list appears exactly once, readable by a keyword scanner.',
    'The lead line reads: Strongest in TypeScript end to end; Java and C from the degree; Python basic.',
    'The closing line counts primary languages across public repos, computed from repos.json at build time.',
  ],
  nonGoals: ['No chips, bars, logos or skill percentages.'],
};
