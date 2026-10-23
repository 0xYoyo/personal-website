import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'Projects render as full-width editorial rows separated by hairlines, in the order from the spec, ending with one Odin era cluster.',
    'Each status is a plain word in parentheses after the name, with the honest reason where one is given.',
    'Commit counts and dates per repo are computed from the baked commit data; every other number comes from the spec.',
    'yoyo-loop lists its eight skills, Unfiltered shows an example request typed into a search line, and Prompt Racers shows its Hebrew title.',
    "The Prompt Racers Play button opens the real game in the app's full-screen modal.",
    'At 390px the name and period stack and nothing scrolls sideways.',
  ],
  nonGoals: ['No card grid, logos, screenshots or star counts.', 'No status softened to sound better.'],
};
