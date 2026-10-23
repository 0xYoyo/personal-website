import { describe, expect, it } from 'vitest';
import type { FactoryState } from '../../factory/store';
import { firstMergeDone, freshVisit, lightsOn, mergedAfterInit } from './heroState';

const IDS = ['hero', 'loop', 'projects', 'early', 'gitlog', 'now', 'stack', 'contact'] as const;

/** A store snapshot with the first `merged` PRs merged (the hero counts as one). */
function state(merged: number, extra: Record<string, unknown> = {}): FactoryState {
  return {
    meta: IDS.map((id, i) => ({ id, pr: i + 1 })),
    sections: Object.fromEntries(IDS.map((id, i) => [id, { id, state: i < merged ? 'merged' : 'queued' }])),
    skipped: false,
    seen: false,
    lightsOverride: null,
    ...extra,
  } as unknown as FactoryState;
}

describe('hero store selectors', () => {
  it('does not count the hero, which is merged at init', () => {
    expect(mergedAfterInit(state(1))).toBe(0);
    expect(mergedAfterInit(state(3))).toBe(2);
  });

  it('turns the lights on at the fourth merge after #1', () => {
    expect(lightsOn(state(4))).toBe(false); // 3 merged after #1
    expect(lightsOn(state(5))).toBe(true);
  });

  it('prefers the store flags when they exist', () => {
    expect(lightsOn(state(1, { lightsOn: true }))).toBe(true);
    expect(lightsOn(state(8, { lightsOn: false }))).toBe(false);
    expect(firstMergeDone(state(1, { firstMergeDone: true }))).toBe(true);
  });

  it('follows the Lights command and a skipped show', () => {
    expect(lightsOn(state(1, { lightsOverride: 1 }))).toBe(true);
    expect(lightsOn(state(8, { lightsOverride: 0 }))).toBe(false);
    expect(lightsOn(state(1, { skipped: true }))).toBe(true);
  });

  it('treats only an unskipped first run as fresh', () => {
    expect(freshVisit(state(1))).toBe(true);
    expect(freshVisit(state(8, { skipped: true, seen: true }))).toBe(false);
    expect(freshVisit(state(1, { seen: true }))).toBe(false);
    expect(firstMergeDone(state(1))).toBe(false);
    expect(firstMergeDone(state(2))).toBe(true);
  });
});
