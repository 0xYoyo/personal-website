import { describe, expect, it } from 'vitest';
import { buildLine } from './footer';

describe('contact footer build line', () => {
  it('prints both counts when set', () => {
    expect(buildLine(7, 3)).toContain('Planned by one model, built by 7 agents, reviewed in 3 rounds.');
  });
  it('renders the planner-set footer sentence', () => {
    expect(buildLine()).toBe(
      'v2.0 — Oct 2026. Spec by Yoyo. Planned by one model, built by 13 agents, reviewed in 2 rounds.',
    );
  });
  it('omits clauses whose count is 0', () => {
    expect(buildLine(0, 0)).toMatch(/Spec by Yoyo\. Planned by one model\.$/);
    expect(buildLine(5, 0)).toMatch(/built by 5 agents\.$/);
    expect(buildLine(0, 0)).not.toMatch(/ 0 (parallel|rounds?)/);
  });
});
