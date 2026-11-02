// The builder's own lines (POLISH1 C1). The brain picks the right one and hands it
// to the UI with the build result, so an example never claims a time it didn't take.

/** Done line for a replayed example (WAVE5 C6). Never claims seconds, never says it was made earlier. */
export const EXAMPLE_DONE_LINE = 'There. Try it.';

/** "Change it" on a replayed example: said when the substitute example starts (changes aren't on here yet). */
export const CHANGE_RESTING_LINE = "changes aren't on here yet. here's the closest I have.";

/** "Change it" on a replayed example, when the closest example is the one on screen: nothing re-streams. */
export const CHANGE_SAME_LINE = "changes aren't on here yet, so this one stays as it is.";

/** Done line for a live build: the real elapsed time (SPEC §2.6; no "Want changes?": changes aren't on here yet, WAVE4 U7). */
export const liveDoneLine = (ms: number): string => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${s} second${s === 1 ? '' : 's'}.`;
};
