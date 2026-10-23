import type { MergeCounts } from './types';

export interface EndCardInput {
  counts: MergeCounts;
  /** PRs the visitor could merge (7: #1 merged at init). */
  total: number;
  /** "M:SS" */
  time: string;
  url: string;
}

export interface EndCardCopy {
  summary: string;
  checks: string;
  share: string;
}

/**
 * What the end card says, from what actually happened (POLISH_WAVE G): never
 * "you merged" for a merge the visitor did not make, and "I approved it" only
 * when they merged every PR by hand.
 */
export function endCardCopy({ counts, total, time, url }: EndCardInput): EndCardCopy {
  const hand = counts.hand + counts.keyboard;
  const command = counts.command;
  const prs = (n: number) => `${n} PR${n === 1 ? '' : 's'}`;

  let summary: string;
  if (hand === total) summary = `You merged ${prs(total)} by hand in ${time}.`;
  else if (command > 0 && hand + command === total)
    summary =
      hand === 0
        ? `You merged all ${total} at once with /yoyo-merge-all in ${time}.`
        : `You merged ${hand} by hand, then merged the remaining ${command} with /yoyo-merge-all.`;
  else if (hand > 0) summary = `You merged ${hand} of ${total} by hand in ${time}; the loop merged the rest.`;
  else summary = `The loop merged all ${total} in ${time}. You watched.`;

  const share =
    hand === total
      ? `I merged ${total} of ${total} PRs on 0xYoyo's portfolio in ${time}. His agents built it; I approved it. ${url}`
      : hand > 0
        ? `I merged ${hand} of ${total} PRs on 0xYoyo's portfolio in ${time}. His agents built it. ${url}`
        : `I watched 0xYoyo's agents build his portfolio in ${time}. ${url}`;

  return { summary, checks: `CI green on all ${total}.`, share };
}
