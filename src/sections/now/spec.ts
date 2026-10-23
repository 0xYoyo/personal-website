import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'Local time in Israel ticks every second, with the day name.',
    "Between 04:00 and 09:00 Israel time it says I'm probably asleep, because none of the public commits were made in those hours.",
    "Shows semester N of 6 at Reichman University, computed from today's date.",
    'Shows the latest baked commits labelled last known at once, and swaps in live GitHub events if they arrive.',
    'Shows the Bitcoin block height when mempool.space answers within 2.5 s, and hides the row when it does not.',
    'When the height changes while the page is open, only the changed digits roll, once; not with reduced motion.',
  ],
  nonGoals: ['No spinners and no error messages, ever.', 'No polling of GitHub; one request per visit.'],
};
