import { describe, expect, it } from 'vitest';
import { openBuildChip, resolveChip, returningChips } from '../content/chips';
import { VISIT_GAP_MS, readVisit, settleVisits } from '../state/visit';

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
const T0 = Date.parse('2026-10-24T10:00:00Z');

describe('visits (POLISH1 A6)', () => {
  it('a first load is a new visit, not a returning one', () => {
    const s = mem();
    const v = readVisit(T0, s);
    expect(v).toEqual({ returning: false, visits: 1, newVisit: true });
    settleVisits(v, T0, s);
    expect(s.m.get('yoyo.v3.visits')).toBe('1');
  });

  it('a reload within 30 minutes is the same visit', () => {
    const s = mem({ 'yoyo.v3.visits': '1', 'yoyo.v3.lastSeen': new Date(T0).toISOString() });
    expect(readVisit(T0 + 10 * 60_000, s)).toEqual({ returning: false, visits: 1, newVisit: false });
  });

  it('coming back after more than 30 minutes counts and is returning', () => {
    const s = mem({ 'yoyo.v3.visits': '1', 'yoyo.v3.lastSeen': new Date(T0).toISOString() });
    expect(readVisit(T0 + VISIT_GAP_MS + 1, s)).toEqual({ returning: true, visits: 2, newVisit: true });
  });

  it('an earlier visit with no lastSeen on record is long gone', () => {
    expect(readVisit(T0, mem({ 'yoyo.v3.visits': '3' })).returning).toBe(true);
  });

  it('survives storage that throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readVisit(T0, bad).visits).toBe(1);
    expect(() => settleVisits({ returning: false, visits: 1, newVisit: true }, T0, bad)).not.toThrow();
  });
});

describe('the open-build chip', () => {
  it('leads the returning chips and reopens the stored build', () => {
    const chips = returningChips('pomodoro');
    expect(chips[0]).toBe(openBuildChip('pomodoro'));
    expect(chips).toEqual([openBuildChip('pomodoro'), 'Who are you?', 'What have you built?']);
    expect(resolveChip('Open my pomodoro', { project: null, hasBuild: false, hasStoredBuild: true })).toEqual({ kind: 'open-build' });
    expect(resolveChip('Open my pomodoro', { project: null, hasBuild: false })).toEqual({ kind: 'say', text: 'Build me something' });
  });

  it('no stored build: the usual entry chips', () => {
    expect(returningChips()).toEqual(['Who are you?', 'What have you built?', 'Spell my name']);
  });
});
