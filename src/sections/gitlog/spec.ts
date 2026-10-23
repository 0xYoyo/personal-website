import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    'An SVG git graph with branches main, army, crypto, code, travel/southeast-asia, university and agents, laid out by a deterministic function in three lanes or fewer.',
    'Vertical distance follows real time with a minimum row spacing, so the 13 quiet months of 2024 are drawn at their length.',
    'The army branch runs Oct 2019 to Jul 2022 and names Meitav, the medical-profile appeal and Unit 636, Field Intelligence Corps, combat.',
    'Every row is focusable, labelled, and highlights its node on hover or focus; arrow keys move between rows.',
    'HEAD -> main and tag v2.0 sit on this page; agents is the only cobalt lane.',
    'On merge the graph draws from HEAD down in 1.4 s; skipped or reduced motion renders it static.',
  ],
  nonGoals: [
    'No made-up hashes passed off as real: only commits backed by a repo show a real sha.',
    'No scroll-jacking.',
  ],
};
