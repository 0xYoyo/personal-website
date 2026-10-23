/**
 * The lights, as data the browser chrome needs (theme-color, favicon). The
 * page itself takes its colors from tokens.css (`data-lights` on <html>); a
 * test keeps these values identical to the CSS.
 */

/** Number of states: 0..7 PRs merged after #1. */
export const LIGHT_LEVELS = 8;

/** Merged count at which the lights switch on (the git log, half the PRs). */
export const LIGHTS_ON_AT = 4;

/** Page background and text per state, for theme-color and the favicon. */
export const LIGHTS: readonly { bg: string; fg: string }[] = [
  { bg: '#15120e', fg: '#f1ece2' },
  { bg: '#1c1813', fg: '#f1ece2' },
  { bg: '#241f19', fg: '#f1ece2' },
  { bg: '#2d271f', fg: '#f1ece2' },
  { bg: '#ddd9d0', fg: '#171411' },
  { bg: '#e3dfd7', fg: '#171411' },
  { bg: '#e8e5dd', fg: '#171411' },
  { bg: '#edeae3', fg: '#171411' },
];
