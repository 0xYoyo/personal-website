import { describe, expect, it } from 'vitest';
import { commits } from '../../../data/stats';
import { reichmanSemester } from '../../../lib/time';
import { changedDigits, eventLines, formatHeight, hh, inWindow, israelClock, quietWindow } from '../format';

describe('israelClock', () => {
  it('formats the Israel wall clock with seconds and the day name', () => {
    // 2026-10-23 is a Friday; Israel is UTC+3 until 25 Oct 2026
    expect(israelClock(new Date('2026-10-23T13:42:07Z'))).toEqual({ day: 'Friday', time: '16:42:07', hour: 16 });
    // after the DST change Israel is UTC+2; midnight shows as 00, not 24
    expect(israelClock(new Date('2026-11-01T22:00:05Z'))).toEqual({ day: 'Monday', time: '00:00:05', hour: 0 });
  });
});

describe('quietWindow', () => {
  it('finds the longest hour range with no commits, in Israel time', () => {
    const at = (h: number) => `2026-01-01T${String(h).padStart(2, '0')}:30:00+02:00`;
    const busy = [0, 1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map(at);
    expect(quietWindow(busy)).toEqual({ from: 4, to: 9 });
  });

  it('wraps past midnight', () => {
    const at = (h: number) => `2026-01-01T${String(h).padStart(2, '0')}:30:00+02:00`;
    const days = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(at);
    expect(quietWindow(days)).toEqual({ from: 22, to: 6 });
    expect(inWindow(23, { from: 22, to: 6 })).toBe(true);
    expect(inWindow(3, { from: 22, to: 6 })).toBe(true);
    expect(inWindow(6, { from: 22, to: 6 })).toBe(false);
  });

  it('is 04:00 to 09:00 for the real data', () => {
    const w = quietWindow(commits.map((c) => c.d));
    expect(w).toEqual({ from: 4, to: 9 });
    expect(`${hh(w!.from)}–${hh(w!.to)}`).toBe('04:00–09:00');
  });
});

describe('block height', () => {
  it('uses thousands separators', () => {
    expect(formatHeight(968123)).toBe('968,123');
    expect(formatHeight(1000000)).toBe('1,000,000');
  });

  it('marks only the digits that changed, aligned from the right', () => {
    expect(changedDigits('968,123', '968,124')).toEqual([false, false, false, false, false, false, true]);
    expect(changedDigits('999,999', '1,000,000').filter(Boolean).length).toBe(8);
  });
});

describe('semester line', () => {
  it('reads sensibly through the degree', () => {
    expect(reichmanSemester(new Date('2026-10-23T12:00:00Z'))).toBe(3);
    expect(reichmanSemester(new Date('2027-03-15T12:00:00Z'))).toBe(4);
    expect(reichmanSemester(new Date('2027-10-20T12:00:00Z'))).toBe(5);
    expect(reichmanSemester(new Date('2028-03-15T12:00:00Z'))).toBe(6);
    expect(reichmanSemester(new Date('2028-07-01T12:00:00Z'))).toBe(6);
  });
});

describe('eventLines', () => {
  const when = (iso: string) => (iso < '2026-10-20' ? '4 days ago' : '2 hours ago');
  it('folds neighbours that would read the same into one counted line', () => {
    const items = [
      { repo: 'yoyo-loop', type: 'pull request', at: '2026-10-23T10:00:00Z' },
      { repo: 'runi-connector', type: 'push', at: '2026-10-19T18:00:00Z' },
      { repo: 'runi-connector', type: 'push', at: '2026-10-19T17:00:00Z' },
      { repo: 'runi-connector', type: 'push', at: '2026-10-19T16:00:00Z' },
      { repo: 'unfiltered', type: 'push', at: '2026-10-18T16:00:00Z' },
      { repo: 'orditax', type: 'push', at: '2026-10-17T16:00:00Z' },
    ];
    expect(eventLines(items, when)).toEqual([
      { repo: 'yoyo-loop', what: 'pull request', when: '2 hours ago' },
      { repo: 'runi-connector', what: '3 pushes', when: '4 days ago' },
      { repo: 'unfiltered', what: 'push', when: '4 days ago' },
    ]);
  });

  it('keeps distinct commits apart', () => {
    const items = ['a1', 'b2'].map((s) => ({ repo: 'x', type: `commit ${s}`, at: '2026-10-19T00:00:00Z' }));
    expect(eventLines(items, when).map((l) => l.what)).toEqual(['commit a1', 'commit b2']);
  });
});
