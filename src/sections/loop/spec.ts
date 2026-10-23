import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'The lede says nothing merges without a human.',
    'The loop diagram is an SVG of the real pipeline: /yoyo-spec, a Linear issue labelled agent-ready, /yoyo-build in a worktree off main, the PR, /yoyo-review and its verdict labels.',
    "The you-merge node is the diagram's only amber, the same amber as the visitor's Merge button.",
    'The burst replay draws each of the 44 merged Unfiltered PRs from 3 to 7 Oct 2026 at its real opened-to-merged span, once on merge, with a Replay button.',
    'The counter ends on 44 PRs and 18 issues, and the proof numbers are computed from the baked data.',
    'Horizontal on desktop, vertical at 390 px; reduced motion shows the final state.',
  ],
  nonGoals: [
    'No claims about speed that the data does not show.',
    'No lines-of-code totals (eval fixtures inflate them).',
  ],
};
