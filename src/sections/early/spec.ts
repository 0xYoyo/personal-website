import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'The lede reads: I tend to be there when a wave starts.',
    'A vertical timeline from 2021 to 2026 on a thin spine, each entry a mono date, the wave, and one plain line.',
    "Repo dates are each repo's first public commit, computed from commits.json at build time.",
    'Spacing follows the time between entries; the 2024 gap is dashed, drawn at its real 13 months, with a one-line note.',
    'On merge the spine draws top to bottom once in about 900 ms and entries appear as it reaches them; skipped or reduced motion renders it static.',
    'Closes with public commits per year, as numbers only.',
  ],
  nonGoals: [
    'No invented launch dates: the world line appears only for Ordinals (Jan 2023) and Claude Code (Feb 2025).',
    'No icons, no chart library.',
  ],
};
