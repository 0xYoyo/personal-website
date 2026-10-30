// The builder's own lines (POLISH1 C1). The brain picks the right one and hands it
// to the UI with the build result, so an example never claims a time it didn't take.

/** Done line for a prebuilt example (scripted mode). Never claims seconds for the example itself. */
export const EXAMPLE_DONE_LINE = 'made earlier. the live builder does this in about 15 seconds.';

/** "Change it" while the live builder is unavailable: said when the substitute example starts. */
export const CHANGE_RESTING_LINE = "the live builder is resting, so I can't change this one. here's the closest I have.";

/** "Change it" while the live builder is unavailable, when the closest example is the one on screen: nothing re-streams. */
export const CHANGE_SAME_LINE = 'the live builder is resting, so this one stays as it is.';

/** Done line for a live build: the real elapsed time (SPEC §2.6; no "Want changes?": changes aren't on here yet, WAVE4 U7). */
export const liveDoneLine = (ms: number): string => {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${s} second${s === 1 ? '' : 's'}.`;
};
