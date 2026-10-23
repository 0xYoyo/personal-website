// Identity facts (SPEC §2). Edit copy here; components read from this file.

export const profile = {
  name: 'Yoav Zrihan',
  goesBy: 'Yoyo',
  handle: '0xYoyo',
  hebrewName: 'יואב זריהן',
  email: 'yoavyoav310@gmail.com',
  location: 'Israel (Tel Aviv area)',
  timezone: 'Asia/Jerusalem',
  links: {
    github: 'https://github.com/0xYoyo',
    linkedin: 'https://www.linkedin.com/in/yoavzrihan',
    cv: 'Yoav_Zrihan_CV.pdf', // relative to the site base (public/)
    v01: 'https://0xyoyo.github.io/personal-portfolio-0xYoyo',
  },
  oneLiner: 'I write the spec. Agents build. I merge.',
  supporting: [
    'Self-taught builder since 2022. Early to Solidity, Ordinals, AI-assisted coding and agent orchestration. Second-year CS & Entrepreneurship at Reichman University.',
    'Open to a student software role, 2–3 days a week.',
  ],
  education: {
    school: 'Reichman University (Herzliya)',
    degree: 'B.Sc. Computer Science + B.A. Entrepreneurship',
    started: '2025-10',
    expectedEnd: '2028-07',
    firstYearGpa: '89.4/100',
  },
  lookingFor: 'Currently looking for a student software role, 2–3 days a week.',
} as const;

/** mailto for every "hire me" link. */
export const HIRE_SUBJECT = "PR: let's work together";
export const HIRE_BODY = [
  'Hi Yoyo,',
  '',
  "We're hiring for: ",
  'Team / company: ',
  'Days per week: ',
  '',
  'Sent from your portfolio.',
].join('\n');

export const hireMailto = `mailto:${profile.email}?subject=${encodeURIComponent(HIRE_SUBJECT)}&body=${encodeURIComponent(HIRE_BODY)}`;

/**
 * Filled in by the planner when the build is done (footer of #8):
 * "Planned by one model, built by N agents, reviewed in M rounds."
 */
export const BUILT_BY_AGENTS = 13;
export const REVIEW_ROUNDS = 2;
export const SITE_VERSION = 'v2.0';
export const SITE_DATE = 'Oct 2026';
