// The five stories (SPEC §8.3), verbatim, in his first person. Each ≈ 15 s:
// two lines, two swarm scenes. Shapes that have no glyph id yet (horizon line,
// chain of squares, sunrise arc) are expressed with the generic ShapeSpec so the
// engine can render them today; the engine may special-case them later.
import type { StoryId } from '@yoyo/protocol';
import { seq, type Step } from '../ui/runner/engine';

export interface Story {
  id: StoryId;
  title: string;
  steps: Step[];
}

const after = ['Next story', 'Who is Yoyo?', 'What has he built?'];

export const stories: Story[] = [
  {
    id: 'appeal',
    title: 'The appeal',
    steps: seq([
      { say: 'They put me in personnel assignment. I appealed my medical profile to serve in combat.', become: { kind: 'glyph', id: 'shield' }, mood: 'speaking', hold: 7200 },
      {
        say: "Unit 636, Field Intelligence. Three years. I'd do it again.",
        // a long horizon line: the lookout
        become: (vp) => ({ kind: 'frame', rect: { x: vp.w * 0.12, y: vp.h * 0.36, w: vp.w * 0.76, h: 2 } }),
        hold: 7800,
        chips: after,
      },
    ]),
  },
  {
    id: '2021',
    title: '2021',
    steps: seq([
      { say: 'I got into crypto in 2021 and never really left.', become: { kind: 'glyph', id: 'btc' }, mood: 'speaking', hold: 6800 },
      { say: 'Two years later I was advising one of the first Ordinals projects. Early is a habit.', become: { kind: 'text', text: '■-■-■-■' }, hold: 8200, chips: after },
    ]),
  },
  {
    id: 'odin',
    title: 'The year of hand-written JavaScript',
    steps: seq([
      { say: 'Before AI wrote code, I spent a year writing all of mine. The Odin Project, full time.', become: { kind: 'glyph', id: 'keyboard' }, mood: 'speaking', hold: 7600 },
      { say: 'Thirty-something small apps. The muscle memory still shows.', become: { kind: 'glyph', id: 'frame' }, hold: 7400, chips: after },
    ]),
  },
  {
    id: 'road',
    title: 'The road',
    steps: seq([
      { say: '2024: most of the year alone in Southeast Asia. Twenty-one commits all year.', become: { kind: 'glyph', id: 'route' }, mood: 'speaking', hold: 7400 },
      { say: "Best decision I've made. Also why the gap.", become: { kind: 'text', text: '◠' }, hold: 7400, chips: after },
    ]),
  },
  {
    id: 'this',
    title: 'This',
    steps: seq([
      { say: "I spec'd this site. One model planned it. A swarm of agents built it. I merged.", become: { kind: 'glyph', id: 'wave' }, mood: 'speaking', hold: 7600 },
      { say: "That's how I work now — and it's getting faster.", become: { kind: 'yoyo3d' }, hold: 7400, chips: ['Build me something', 'What has he built?', 'How do I reach him?'] },
    ]),
  },
];

export const storyById = (id: StoryId): Story => stories.find((s) => s.id === id) ?? stories[0]!;

/** The next unseen story (in order), or the first after all are seen. */
export function nextStory(seen: readonly string[]): Story {
  return stories.find((s) => !seen.includes(s.id)) ?? stories[0]!;
}
