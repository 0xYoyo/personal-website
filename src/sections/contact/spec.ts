import type { SectionModule } from '../../factory/types';

// The issue this section's PR was built against, shown in the PR card's Spec tab.
export const spec: SectionModule['spec'] = {
  acceptance: [
    "Four large underlined links: the email (a mailto with the subject PR: let's work together), GitHub, LinkedIn and Download CV (PDF).",
    'The email address is also printed as plain text, with a Copy email button whose label changes to Copied.',
    'The footer states the version, who wrote the spec, and how many agents built it and review rounds it took, leaving out any count that is still 0.',
    'The footer links v0.1 at 0xyoyo.github.io/personal-portfolio-0xYoyo.',
    'The last link stays clear of the control room pill on a 390px phone.',
  ],
  nonGoals: ['No contact form, and no phone number anywhere.'],
};
