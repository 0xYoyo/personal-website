import { describe, expect, it } from 'vitest';
import { BUILD_SEEDS, clampChips, defaultChips, projectChips, resolveChip } from '../content/chips';

const st = { project: null, hasBuild: false } as const;

describe('chips', () => {
  it('defaults by context (SPEC §8.4)', () => {
    expect(defaultChips('entry')).toEqual(['Who is Yoyo?', 'What has he built?', 'Spell my name', 'Build me something', 'Play his game']);
    expect(defaultChips('who')).toEqual(['Tell me a story', "What's he bad at?", 'Why should we hire him?', 'How do I reach him?']);
    expect(projectChips('prompt-racers')).toContain('Play it');
    expect(projectChips('polybot')).not.toContain('Play it');
    expect(defaultChips('build')).toEqual(['Share it', 'Build another', 'Who made this agent?']);
  });

  it('runs UI commands directly', () => {
    expect(resolveChip('Play his game', st)).toEqual({ kind: 'play' });
    expect(resolveChip('Next one', { ...st, project: 'unfiltered' })).toEqual({ kind: 'next-project' });
    expect(resolveChip('Next one', st)).toEqual({ kind: 'say', text: 'What has he built?' });
    expect(resolveChip('Build me something like this', { ...st, project: 'polybot' })).toEqual({ kind: 'build', instruction: BUILD_SEEDS.polybot });
    expect(resolveChip('Change it', { ...st, hasBuild: true })).toEqual({ kind: 'change-build' });
    expect(resolveChip('Share it', { ...st, hasBuild: true })).toEqual({ kind: 'share-build' });
    expect(resolveChip('Tell me a story', st)).toEqual({ kind: 'story-next' });
    expect(resolveChip('sound on', st)).toEqual({ kind: 'sound-on' });
  });

  it('spells a known name, otherwise asks the agent', () => {
    expect(resolveChip('Spell my name', { ...st, name: 'Dana' })).toMatchObject({ kind: 'become', shape: { kind: 'text', text: 'Dana' } });
    expect(resolveChip('Spell my name', st)).toEqual({ kind: 'say', text: 'Spell my name' });
    expect(resolveChip('🚀', st)).toEqual({ kind: 'say', text: '🚀' });
    expect(resolveChip('Who is Yoyo?', st)).toEqual({ kind: 'say', text: 'Who is Yoyo?' });
  });

  it('clamps to 3–5, dedupes, and keeps empty empty', () => {
    expect(clampChips([])).toEqual([]);
    expect(clampChips(['a', 'A ', 'b'])).toHaveLength(3);
    expect(clampChips(['1', '2', '3', '4', '5', '6'])).toHaveLength(5);
  });
});
