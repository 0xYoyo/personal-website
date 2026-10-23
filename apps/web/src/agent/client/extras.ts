// SPEC §2.8 easter eggs that have no line in faq.md. Kept apart from the
// generated FAQ (and mirrored as examples in apps/worker/prompt/persona.md and
// in tools/mock-worker.mjs) so the planner can replace them in one place.
// `match` runs on the normalised message (lowercase tokens joined by spaces).

export interface ExtraIntent {
  id: string;
  match: RegExp;
  reply: string;
}

export const EXTRA_INTENTS: readonly ExtraIntent[] = [
  { id: 'fortnite', match: /\bfortnite\b/, reply: '[[become:ramp]] he could build a ramp before you could aim.' },
  { id: 'cs2', match: /\b(cs2|csgo|cs go|counter strike|counter-strike)\b/, reply: "[[become:cursor]] rush B. don't stop." },
  { id: 'piano', match: /\bpiano\b/, reply: "[[become:piano]] he wants to learn. hasn't yet. ask him in a year." },
];
