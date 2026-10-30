import { describe, expect, it } from 'vitest';
import { BUILD_SEEDS, ROCKET_CHIP, buildName, clampChips, defaultChips, projectChips, resolveChip, rocketChips } from '../content/chips';

const st = { project: null, hasBuild: false } as const;

describe('chips', () => {
  it('defaults by context (SPEC §8.4)', () => {
    expect(defaultChips('entry')).toEqual(['Who are you?', 'What have you built?', 'Spell my name']);
    expect(defaultChips('who')).toEqual(['What are you like?', 'What are you bad at?', 'Why should we hire you?', 'How do I reach you?']);
    expect(projectChips('prompt-racers')).toContain('Play it');
    expect(projectChips('polybot')).not.toContain('Play it');
    expect(defaultChips('build')).toEqual(['Share it', 'Build another', 'How was this made?']);
  });

  it('runs UI commands directly', () => {
    expect(resolveChip('Play the game', st)).toEqual({ kind: 'play' });
    expect(resolveChip('Next one', { ...st, project: 'unfiltered' })).toEqual({ kind: 'next-project' });
    expect(resolveChip('Next one', st)).toEqual({ kind: 'say', text: 'What have you built?' });
    expect(resolveChip('Build me something', { ...st, project: 'polybot' })).toEqual({ kind: 'build', instruction: BUILD_SEEDS.polybot });
    expect(resolveChip('Build me something', st)).toEqual({ kind: 'say', text: 'Build me something' });
    expect(projectChips('polybot')).toEqual(['Next one', 'Build me something']);
    expect(resolveChip('Change it', { ...st, hasBuild: true })).toEqual({ kind: 'change-build' });
    expect(resolveChip('Share it', { ...st, hasBuild: true })).toEqual({ kind: 'share-build' });
    expect(resolveChip('Tell me a story', st)).toEqual({ kind: 'story-next' });
    expect(resolveChip('sound on', st)).toEqual({ kind: 'sound-on' });
  });

  it('spells a known name, otherwise asks the agent', () => {
    expect(resolveChip('Spell my name', { ...st, name: 'Dana' })).toMatchObject({ kind: 'become', shape: { kind: 'text', text: 'Dana' } });
    expect(resolveChip('Spell my name', st)).toEqual({ kind: 'ask-name' });
    expect(resolveChip('🚀', st)).toEqual({ kind: 'say', text: '🚀' });
    expect(resolveChip('Who are you?', st)).toEqual({ kind: 'say', text: 'Who are you?' });
  });

  it('clamps to 3–5, dedupes, and keeps empty empty', () => {
    expect(clampChips([])).toEqual([]);
    expect(clampChips(['a', 'A ', 'b'])).toHaveLength(3);
    expect(clampChips(['1', '2', '3', '4', '5', '6'])).toHaveLength(5);
  });

  it('"Now a rocket" only after a spelled name, only once, never after the rocket (FIX4 U6)', () => {
    const row = [ROCKET_CHIP, 'Build me something', 'Who are you?'];
    expect(rocketChips(row, { spelled: true, offered: false, rocket: false })).toEqual(row);
    expect(rocketChips(row, { spelled: false, offered: false, rocket: false })).toEqual(['Build me something', 'Who are you?']);
    expect(rocketChips(row, { spelled: true, offered: true, rocket: false })).not.toContain(ROCKET_CHIP);
    expect(rocketChips(row, { spelled: true, offered: false, rocket: true })).not.toContain(ROCKET_CHIP);
  });

  it('a stored build goes by its human name, never its app title (FIX4 U9)', () => {
    expect(buildName({ example: 'todo', instruction: 'make me something' })).toBe('to-do list');
    expect(buildName({ example: 'pomodoro', instruction: 'x' })).toBe('pomodoro timer');
    expect(buildName({ instruction: 'build me a todo app' })).toBe('to-do list');
    expect(buildName({ instruction: 'Make me a pomodoro timer with big digits' })).toBe('pomodoro timer');
    expect(buildName({ instruction: 'build me a calendar that guards my focus' })).toBe('calendar');
    expect(buildName({ instruction: 'a tiny social feed where you can post' })).toBe('tiny social feed');
    expect(buildName({ instruction: '' })).toBe('build');
  });
});
