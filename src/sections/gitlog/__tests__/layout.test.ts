import { describe, expect, it } from 'vitest';
import { gitCommits, gitGap, shaOf } from '../../../content/gitlog';
import { layoutGraph } from '../layout';

const opts = { laneGap: 20, pxPerDay: 0.3, curve: 18, top: 16, rowHeights: gitCommits.map(() => 38) };

describe('gitlog layout', () => {
  it('every parent exists and is older than its child', () => {
    const at = new Map(gitCommits.map((c) => [c.id, Date.parse(c.at)]));
    for (const c of gitCommits) for (const p of c.parents) expect(at.get(p)).toBeLessThan(at.get(c.id)!);
  });

  it('is deterministic, newest first, and never packs rows tighter than their text', () => {
    const a = layoutGraph(gitCommits, opts);
    expect(layoutGraph(gitCommits, opts)).toEqual(a);
    expect(a.rows[0]!.id).toBe('head');
    a.rows.slice(1).forEach((r, i) => expect(r.y - a.rows[i]!.y).toBeGreaterThanOrEqual(38));
  });

  it('fits in three lanes and keeps main in lane 0', () => {
    const g = layoutGraph(gitCommits, opts);
    expect(g.lanes).toBeLessThanOrEqual(3);
    expect(g.rows.filter((r) => r.branch === 'main').every((r) => r.lane === 0)).toBe(true);
  });

  it('draws the 2024 quiet at its real length', () => {
    const g = layoutGraph(gitCommits, opts);
    const y = (id: string) => g.rows.find((r) => r.id === id)!.y;
    const days = (Date.parse('2025-03-01') - Date.parse('2024-02-01')) / 86_400_000;
    expect(y('travel') - y('merge-travel')).toBeCloseTo(days * opts.pxPerDay, 0);
  });

  it('caps ordinary gaps but keeps the 2024 quiet uncapped and the longest', () => {
    const g = layoutGraph(gitCommits, { ...opts, maxGap: 56, uncapped: gitGap });
    const gaps = g.rows.slice(1).map((r, i) => ({ id: r.id, h: r.y - g.rows[i]!.y }));
    const quiet = gaps.find((x) => x.id === gitGap.from)!;
    for (const x of gaps.filter((x) => x.id !== gitGap.from)) expect(x.h, x.id).toBeLessThanOrEqual(56);
    expect(quiet.h).toBeGreaterThan(90);
  });

  it('resolves a real sha for every commit that names a repo', () => {
    for (const c of gitCommits.filter((c) => c.repo)) expect(shaOf(c).real, c.id).toBe(true);
  });
});
