// The two stories (WAVE3 V2), verbatim, in his first person. Two lines each; a
// line may carry two shapes (the first, then a shape-only step while the caption
// stays). Timed by `beat()`: shape first, caption 900 ms later, then read time +
// 600 ms. Reachable by "tell me a story" and the tour's end chips (not the nav).
import type { StoryId } from '@yoyo/protocol';
import { beat, CAPTION_DELAY, CAPTION_TAIL, READ_MIN, readMs, seq, type Step } from '../ui/runner/engine';
import { STORY_CHIPS } from './chips';

export interface Story {
  id: StoryId;
  title: string;
  steps: Step[];
}

const STORY_AFTER = STORY_CHIPS;

/** A line whose shape changes halfway: `first` while it lands, then `then` for the rest of its read time. */
function twoShapes(say: string, first: Step['become'], then: Step['become'], mood?: Step['mood']): Omit<Step, 'at'>[] {
  const total = CAPTION_DELAY + readMs(say) + CAPTION_TAIL;
  const split = CAPTION_DELAY + READ_MIN + CAPTION_TAIL;
  return [
    beat({ say, become: first, captionHold: split - CAPTION_DELAY, ...(mood ? { mood } : {}) }),
    beat({ become: then, hold: Math.max(READ_MIN, total - split) }),
  ];
}

const FACTORY_1 = 'The day the code it wrote was better than mine, and took a hundredth of the time, I stopped typing.';
const FACTORY_2 = 'Now I write the spec, agents build, another agent reviews, and I merge. 44 pull requests in four days, once.';

export const stories: Story[] = [
  {
    id: 'factory',
    title: 'When I stopped typing',
    steps: seq([
      ...twoShapes(FACTORY_1, { kind: 'glyph', id: 'keyboard' }, { kind: 'glyph', id: 'cursor' }, 'speaking'),
      beat({ say: FACTORY_2, become: { kind: 'glyph', id: 'loop' }, chips: STORY_AFTER }),
    ]),
  },
  {
    id: 'road',
    title: 'The road',
    steps: seq([
      beat({ say: '2024: most of the year alone in Southeast Asia. Twenty-one commits all year.', become: { kind: 'glyph', id: 'route' }, mood: 'speaking' }),
      beat({
        say: "Best decision I've made. I came back and built more in a year than in the three before it.",
        become: { kind: 'text', text: '917' },
        chips: STORY_AFTER,
      }),
    ]),
  },
];

export const storyById = (id: StoryId): Story => stories.find((s) => s.id === id) ?? stories[0]!;

/** The next unseen story (in order), or the first after all are seen. */
export function nextStory(seen: readonly string[]): Story {
  return stories.find((s) => !seen.includes(s.id)) ?? stories[0]!;
}
