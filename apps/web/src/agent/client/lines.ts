// The builder's own lines (POLISH1 C1). The brain picks the right one and hands it
// to the UI with the build result, so an example never claims a time it didn't take.

/** Done line for a prebuilt example (scripted mode). Never claims seconds for the example itself. */
export const EXAMPLE_DONE_LINE = 'made earlier. the live builder does this in about 15 seconds.';

/** "Change it" while the live builder is unavailable: said when the substitute example starts. */
export const CHANGE_RESTING_LINE = "the live builder is resting, so I can't change this one — here's the closest I have.";

/** Done line for a live build: the real elapsed time (SPEC §2.6 `14 seconds. Want changes?`). */
export const liveDoneLine = (ms: number): string => `${Math.max(1, Math.round(ms / 1000))} seconds. Want changes?`;
