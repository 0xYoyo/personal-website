// The five stories (SPEC §8.3), verbatim, in his first person. Two lines, two
// swarm scenes each, timed by `beat()` (shape first, caption 900 ms later, then
// read time + 600 ms). Shapes that have no glyph id yet (horizon line,
// chain of squares, sunrise arc) are expressed with the generic ShapeSpec so the
// engine can render them today; the engine may special-case them later.
import type { StoryId } from '@yoyo/protocol';
import { beat, seq, type Step } from '../ui/runner/engine';

export interface Story {
  id: StoryId;
  title: string;
  steps: Step[];
}

const after = ['Next story', 'Who is Yoyo?', 'What has he built?', 'How do I reach him?'];

export const stories: Story[] = [
  {
    id: 'appeal',
    title: 'The appeal',
    steps: seq([
      beat({ say: 'They put me in personnel assignment. I appealed my medical profile to serve in combat.', become: { kind: 'glyph', id: 'shield' }, mood: 'speaking' }),
      beat({
        say: "Unit 636, Field Intelligence. Three years. I'd do it again.",
        // a long horizon line: the lookout
        become: (vp) => ({ kind: 'frame', rect: { x: vp.w * 0.12, y: vp.h * 0.36, w: vp.w * 0.76, h: 2 } }),
        chips: after,
      }),
    ]),
  },
  {
    id: '2021',
    title: '2021',
    steps: seq([
      beat({ say: 'I got into crypto in 2021 and never really left.', become: { kind: 'glyph', id: 'btc' }, mood: 'speaking' }),
      beat({ say: 'Two years later I was advising one of the first Ordinals projects. Early is a habit.', become: { kind: 'text', text: '■-■-■-■' }, chips: after }),
    ]),
  },
  {
    id: 'odin',
    title: 'The year of hand-written JavaScript',
    steps: seq([
      beat({ say: 'Before AI wrote code, I spent a year writing all of mine. The Odin Project, full time.', become: { kind: 'glyph', id: 'keyboard' }, mood: 'speaking' }),
      beat({ say: 'Thirty-something small apps. The muscle memory still shows.', become: { kind: 'glyph', id: 'frame' }, chips: after }),
    ]),
  },
  {
    id: 'road',
    title: 'The road',
    steps: seq([
      beat({ say: '2024: most of the year alone in Southeast Asia. Twenty-one commits all year.', become: { kind: 'glyph', id: 'route' }, mood: 'speaking' }),
      beat({ say: "Best decision I've made. Also why the gap.", become: { kind: 'text', text: '◠' }, chips: after }),
    ]),
  },
  {
    id: 'this',
    title: 'This',
    steps: seq([
      beat({ say: "I spec'd this site. One model planned it. A swarm of agents built it. I merged.", become: { kind: 'glyph', id: 'wave' }, mood: 'speaking' }),
      beat({ say: "That's how I work now — and it's getting faster.", become: { kind: 'yoyo3d' }, chips: ['Build me something', 'What has he built?', 'How do I reach him?'] }),
    ]),
  },
];

export const storyById = (id: StoryId): Story => stories.find((s) => s.id === id) ?? stories[0]!;

/** The next unseen story (in order), or the first after all are seen. */
export function nextStory(seen: readonly string[]): Story {
  return stories.find((s) => !seen.includes(s.id)) ?? stories[0]!;
}
