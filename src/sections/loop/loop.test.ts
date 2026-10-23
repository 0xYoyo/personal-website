import { burst, mergedPRs } from '../../data/stats';
import { hourTicks, issueOf, layoutBars, median, openToMerge } from './burst';

describe('loop burst', () => {
  it('replays the real window: 44 PRs across 18 issues', () => {
    expect(burst).not.toBeNull();
    expect(burst!.start).toBe('2026-10-03T15:53:53Z');
    expect(burst!.end).toBe('2026-10-07T15:24:05Z');
    expect(burst!.prs).toHaveLength(44);
    expect(new Set(burst!.prs.map(issueOf).filter(Boolean)).size).toBe(18);
  });

  it('lays bars out without overlap inside the strip', () => {
    const start = Date.parse(burst!.start);
    const end = Date.parse(burst!.end);
    const bars = layoutBars(burst!.prs, start, end, 342, 2, 1.5);
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(342.0001);
      for (const o of bars) {
        if (o === b || o.lane !== b.lane) continue;
        expect(b.x + b.w <= o.x || o.x + o.w <= b.x).toBe(true);
      }
    }
    expect(hourTicks(start, end)).toHaveLength(96);
  });

  it('median open to merge on Unfiltered is about 15 minutes', () => {
    const m = median(mergedPRs.filter((p) => p.repo === 'unfiltered').map(openToMerge));
    expect(Math.round(m)).toBe(15);
  });
});
