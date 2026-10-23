import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'The name renders as one large typographic object, with the 0xYoyo handle and Hebrew name beneath it in mono.',
    'Each of the 1,405 public commits is one particle, placed by date on a linear axis, so the 2024 travel gap stays empty at its real length.',
    'On load the particles coalesce from scattered noise into the ribbon in about 2 seconds, oldest commits first.',
    'Hovering, tapping or arrowing through a particle shows its repo, sha, date and message from the commit data.',
    'When a PR starts building, 3 to 5 copies of particles fly to the control room; the ribbon keeps every commit.',
    'The canvas caps DPR at 2, pauses offscreen and in hidden tabs, and is drawn settled and still under reduced motion or a skipped show.',
  ],
  nonGoals: ['No invented commits or decorative particles.', 'No WebGL: Canvas 2D stays well under 4 ms a frame.'],
};
