// Default chips by context (SPEC §8.4) and what a chip does when pressed.
// A chip either sends its label to the agent or runs a UI command directly
// (play, next project, change/share a build) so the obvious moves never wait
// on a model.
import { isEmojiOnly, type ProjectId, type ShapeSpec } from '@yoyo/protocol';

export type ChipContext = 'entry' | 'who' | 'project' | 'build' | 'story' | 'idle';

export const ENTRY_CHIPS = ['Who is Yoyo?', 'What has he built?', 'Spell my name', 'Build me something', 'Play his game'];
export const WHO_CHIPS = ['Tell me a story', "What's he bad at?", 'Why should we hire him?', 'How do I reach him?'];
export const BUILD_CHIPS = ['Change it', 'Share it', 'Build another', 'Who made this agent?'];
export const STORY_CHIPS = ['Next story', 'Who is Yoyo?', 'What has he built?', 'How do I reach him?'];

/** Returning visitor with a stored build (POLISH1 A6): reopen it first, then the usual moves. */
export const openBuildChip = (title: string): string => `Open my ${title}`;
export const returningChips = (buildTitle?: string): string[] =>
  buildTitle ? [openBuildChip(buildTitle), 'Who is Yoyo?', 'What has he built?', 'Build me something', 'Play his game'] : ENTRY_CHIPS;

export function projectChips(id: ProjectId): string[] {
  return id === 'prompt-racers'
    ? ['Next one', 'Play it', 'Build me something like this']
    : ['Next one', 'Build me something like this'];
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

/** Seed instructions for "Build me something like this", one per project. */
export const BUILD_SEEDS: Record<ProjectId, string> = {
  'prompt-racers': 'a tiny top-down racing game with arrow-key steering, a drift boost and a lap timer',
  unfiltered: 'a product search page where a plain-language query filters and ranks a small catalogue',
  'yoyo-loop': 'a kanban board where cards move from spec to build to review to merged',
  'runi-connector': 'a weekly deadline tracker for university courses with a "due this week" view',
  'availability-monitor': 'a calendar that highlights the dates a room becomes available',
  'pnl-bot': 'a profit and loss calculator for a list of trades, with realized and unrealized totals',
  polybot: 'a chart of two price lines that highlights where they diverge',
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
    case 'play his game':
    case 'play it':
      return { kind: 'play' };
    case 'next one':
      return st.project ? { kind: 'next-project' } : { kind: 'say', text: 'What has he built?' };
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
      return st.name ? { kind: 'become', shape: { kind: 'text', text: st.name }, text: label } : { kind: 'say', text: label };
    default:
      return { kind: 'say', text: label };
  }
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
