// Default chips by context (SPEC §8.4) and what a chip does when pressed.
// A chip either sends its label to the agent or runs a UI command directly
// (play, next project, change/share a build) so the obvious moves never wait
// on a model.
import { isEmojiOnly, type ProjectId, type ShapeSpec } from '@yoyo/protocol';
import { EXAMPLE_RULES } from '../agent/client/pick-example';

export type ChipContext = 'entry' | 'who' | 'project' | 'build' | 'story' | 'idle';

/** WAVE3: three at the door, in the second person (the site speaks as Yoyo). */
export const ENTRY_CHIPS = ['Who are you?', 'What have you built?', 'Spell my name'];
export const WHO_CHIPS = ['What are you like?', 'What are you bad at?', 'Why should we hire you?', 'How do I reach you?'];
/** The build's row (WAVE4 U7): no "Change it" (changes aren't on here yet), no "How was this made?". */
export const BUILD_CHIPS = ['Share it', 'Build another', 'Close'];
export const STORY_CHIPS = ['Next story', 'What have you built?', 'How do I reach you?'];
/** The tour's end chips (WAVE3 V3). */
export const TOUR_END_CHIPS = ['Who are you?', 'What have you built?', 'Play the game'];

/** What the visitor would call an example build (FIX4 U9): never the app's own title ("Today"). */
export const EXAMPLE_NAMES: Readonly<Record<string, string>> = {
  todo: 'to-do list',
  pomodoro: 'pomodoro timer',
  landing: 'landing page',
  weather: 'weather card',
  habits: 'habit tracker',
  birthday: 'birthday card',
};

/**
 * A stored build's human name for "I kept your …" and "Open my …" (FIX4 U9): the example's name (from
 * the build, or a strong word in the instruction: "build me a todo app" → "to-do list"), else the
 * instruction's thing ("a calendar that guards focus" → "calendar").
 */
export function buildName(b: { example?: string | undefined; instruction: string }): string {
  const low = b.instruction.toLowerCase();
  const strong = EXAMPLE_RULES.find((r) => r.strong.some((w) => new RegExp(`(^|[^\\p{L}])${w}s?([^\\p{L}]|$)`, 'u').test(low)))?.id;
  const id = b.example ?? strong;
  if (id && EXAMPLE_NAMES[id]) return EXAMPLE_NAMES[id]!;
  const thing = low
    .replace(/[?.!]+$/, '')
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:build|make|create|generate|write|design)\s+(?:me\s+|us\s+)?/, '')
    .replace(/^(?:an?|the|my|some)\s+/, '')
    .split(/\s+(?:that|which|with|for|where|to|so)\s+/)[0]!
    .split(/\s+/)
    .slice(0, 4)
    .join(' ')
    .trim();
  return thing || 'build';
}

/** Returning visitor with a stored build (POLISH1 A6): reopen it first, then the usual moves. */
export const openBuildChip = (title: string): string => `Open my ${title}`;
export const returningChips = (buildTitle?: string): string[] =>
  buildTitle ? [openBuildChip(buildTitle), 'Who are you?', 'What have you built?'] : ENTRY_CHIPS;

/** The card chip is "Build me something" (WAVE4 C2); with a card open it builds that project's seed. */
export const CARD_BUILD_CHIP = 'Build me something';
export function projectChips(id: ProjectId): string[] {
  return id === 'prompt-racers'
    ? ['Next one', 'Play it', CARD_BUILD_CHIP]
    : ['Next one', CARD_BUILD_CHIP];
}

export function defaultChips(ctx: ChipContext, project?: ProjectId | null): string[] {
  switch (ctx) {
    case 'entry':
    case 'idle':
      return ENTRY_CHIPS;
    case 'who':
      return WHO_CHIPS;
    case 'project':
      return projectChips(project ?? 'prompt-racers');
    case 'build':
      return BUILD_CHIPS;
    case 'story':
      return STORY_CHIPS;
  }
}

/** Seed instructions for "Build me something" pressed on a card, one per project. */
export const BUILD_SEEDS: Record<ProjectId, string> = {
  'prompt-racers': 'a tiny top-down racing game with arrow-key steering, a drift boost and a lap timer',
  unfiltered: 'a product search page where a plain-language query filters and ranks a small catalogue',
  'yoyo-loop': 'a kanban board where cards move from spec to build to review to merged',
  'runi-connector': 'a weekly deadline tracker for university courses with a "due this week" view',
  'availability-monitor': 'a calendar that highlights the dates a room becomes available',
  'pnl-bot': 'a profit and loss calculator for a list of trades, with realized and unrealized totals',
  polybot: 'a chart of two price lines that highlights where they diverge',
  'yoyo-network': 'a tiny social feed where you can post, like and follow, all in the page',
  vortex: 'an application form with a members vote tally and an approve button',
  'sentiment-gauge': 'a mood gauge for a topic: a list of short posts tagged positive, negative or neutral, and a needle that shows the overall score',
};

export type ChipCommand =
  | { kind: 'say'; text: string }
  | { kind: 'play' }
  | { kind: 'next-project' }
  | { kind: 'build'; instruction: string }
  | { kind: 'change-build' }
  | { kind: 'share-build' }
  | { kind: 'story-next' }
  | { kind: 'sound-on' }
  | { kind: 'open-build' }
  | { kind: 'ask-name' }
  | { kind: 'become'; shape: ShapeSpec; text: string };

export interface ChipState {
  project: ProjectId | null;
  name?: string | undefined;
  hasBuild: boolean;
  /** a build from an earlier visit is in memory */
  hasStoredBuild?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[?.!]+$/, '');

export function resolveChip(label: string, st: ChipState): ChipCommand {
  const l = norm(label);
  if (isEmojiOnly(label)) return { kind: 'say', text: label };
  if (l.startsWith('open my ')) return st.hasStoredBuild ? { kind: 'open-build' } : { kind: 'say', text: 'Build me something' };
  switch (l) {
    case 'play the game':
    case 'play his game':
    case 'play it':
      return { kind: 'play' };
    case 'next one':
      return st.project ? { kind: 'next-project' } : { kind: 'say', text: 'What have you built?' };
    // on a card: that project's seed; anywhere else the brain answers (faq.md `build`)
    case 'build me something':
    case 'build me something like this':
      return st.project ? { kind: 'build', instruction: BUILD_SEEDS[st.project] } : { kind: 'say', text: 'Build me something' };
    case 'change it':
      return st.hasBuild ? { kind: 'change-build' } : { kind: 'say', text: 'Build me something' };
    case 'share it':
      return st.hasBuild ? { kind: 'share-build' } : { kind: 'say', text: 'Build me something' };
    case 'build another':
    case 'another example':
      return { kind: 'say', text: 'Build me something' };
    case 'next story':
    case 'tell me a story':
      return { kind: 'story-next' };
    case 'sound on':
      return { kind: 'sound-on' };
    case 'spell my name':
      return st.name ? { kind: 'become', shape: { kind: 'text', text: st.name }, text: label } : { kind: 'ask-name' };
    default:
      return { kind: 'say', text: label };
  }
}

/**
 * A typed message while a build is open (FIX4 U1): one that starts like an edit is a change to the
 * build, never a new build and never the unknown reply. A bare "change it" opens change mode (as the
 * Change it button does); one that already says what to change ("make it dark") is applied.
 */
export type ChangeIntent = 'begin' | 'apply' | null;
const CHANGE_START = /^(change|make it|turn it|add|remove|use|switch|colou?r|dark|light)\b/i;
const CHANGE_BARE = /^(change|change it|change this|change that|make changes|make a change)$/i;
export function changeIntent(text: string, buildOpen: boolean): ChangeIntent {
  if (!buildOpen) return null;
  const t = text.trim().replace(/[.!?…]+$/, '').trim();
  if (CHANGE_BARE.test(t)) return 'begin';
  return CHANGE_START.test(t) ? 'apply' : null;
}

/** The rocket chip (persona.md's "spell dana" example). */
export const ROCKET_CHIP = 'Now a rocket';
/**
 * FIX4 U6: "Now a rocket" only right after a spelled name, only once a visit, and never once the
 * rocket has been made.
 */
export function rocketChips(chips: string[], ctx: { spelled: boolean; offered: boolean; rocket: boolean }): string[] {
  const ok = ctx.spelled && !ctx.offered && !ctx.rocket;
  return ok ? chips : chips.filter((c) => c.trim().toLowerCase() !== ROCKET_CHIP.toLowerCase());
}

/** Keep 3–5 chips (SPEC §3.3); dedupe, trim. */
export function clampChips(chips: string[]): string[] {
  if (!chips.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chips) {
    const t = c.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  if (out.length < 3) {
    for (const c of ENTRY_CHIPS) {
      if (out.length >= 3) break;
      if (!seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        out.push(c);
      }
    }
  }
  return out.slice(0, 5);
}
