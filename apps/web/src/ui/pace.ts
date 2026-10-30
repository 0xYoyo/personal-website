// One pacing clock (WAVE4 U1). Every read time on the site comes from here: a reply's turns
// (ui/turns.ts), the hold before a reply's overlay opens (controller), the swarm's shape after a
// reply, the show's and the stories' captions (ui/runner/engine.ts) and the line the scripted
// brain says before a build (agent/client/timing.ts). A read time is counted from the moment the
// words are fully on screen.

/** The one knob: 1 = the WAVE4 pace. Every read time below scales with it. */
export const PACE = 1;
/** A line rests at least this long once it is fully on screen. */
export const READ_FLOOR_MS = Math.round(3600 * PACE);
/** …and this long per word. */
export const READ_PER_WORD_MS = Math.round(440 * PACE);

/** Visible words in a line (turn marks and spaces excluded). */
export const wordCount = (text: string): number => text.split(/\s+/).filter((w) => w && w !== '||').length;

/** How long a line of `words` words needs, from when it is fully on screen. */
export const readFor = (words: number): number => Math.max(READ_FLOOR_MS, words * READ_PER_WORD_MS);

/** How long `text` needs, from when it is fully on screen. */
export const readMs = (text: string): number => readFor(wordCount(text));
