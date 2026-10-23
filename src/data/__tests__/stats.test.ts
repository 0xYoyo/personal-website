import { describe, expect, it } from 'vitest';
import { burst, commitCount, firstCommit, mergeCommitCount, mergedPRCount, repoCount } from '../stats';

// These numbers are the verified ones in SPEC §8. If the data is re-baked and
// they change, update the copy that quotes them too.
describe('stats from the baked data', () => {
  it('counts commits and repos', () => {
    expect(commitCount).toBe(1405);
    expect(repoCount).toBe(61);
    expect(firstCommit?.d.slice(0, 10)).toBe('2022-09-07');
    expect(mergeCommitCount).toBe(321);
  });

  it('finds the 96-hour burst in unfiltered', () => {
    expect(burst?.prs).toHaveLength(44);
    expect(burst?.issues).toHaveLength(18);
    expect(burst?.start).toBe('2026-10-03T15:53:53Z');
    expect(burst?.end).toBe('2026-10-07T15:24:05Z');
  });

  it('counts merged PRs per repo', () => {
    expect(mergedPRCount('unfiltered')).toBe(245);
    expect(mergedPRCount('yoyo-loop')).toBe(55);
  });
});
