// SPEC §2.8 easter eggs: the lines are faq.md's last section (a test keeps them equal). Kept apart from the
// generated FAQ (and mirrored as examples in apps/worker/prompt/persona.md and
// in tools/mock-worker.mjs) so the planner can replace them in one place.
// `match` runs on the normalised message (lowercase tokens joined by spaces).

export interface ExtraIntent {
  id: string;
  match: RegExp;
  reply: string;
}

export const EXTRA_INTENTS: readonly ExtraIntent[] = [
  { id: 'fortnite', match: /\bfortnite\b/, reply: '[[become:ramp]] I could build a ramp before you could aim.' },
  // trading CS:GO skins is the crypto story (WAVE4 C2): a message about skins goes to faq.md's `crypto`
  { id: 'cs2', match: /^(?!.*\bskins?\b).*\b(cs2|csgo|cs go|counter strike|counter-strike)\b/, reply: "[[become:rush B]] rush B. don't stop." },
  // POLISH1 A7: "curls" on its own gets the short line; "what do you look like" keeps faq.md's `looks`.
  { id: 'curls', match: /\bcurls\b/, reply: "[[become:curls]] yes, they're real." },
  { id: 'piano', match: /\bpiano\b/, reply: "[[become:piano]] I want to learn. haven't yet. ask me in a year." },
];
