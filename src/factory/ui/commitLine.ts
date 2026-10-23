import { formatAt } from '../store';
import type { SectionRuntime } from '../types';

/**
 * The tail of a merged section's commit line: how and when it merged, in the
 * same words as the log. Skipped and returning visits have no timing to show.
 */
export function commitLineMeta(rt: Pick<SectionRuntime, 'mergedBy' | 'mergedAt' | 'mergedVia'> | undefined, skipped: boolean): string {
  if (!rt || rt.mergedAt === null || rt.mergedBy === null || rt.mergedBy === 'skip' || rt.mergedBy === 'init' || skipped) {
    return 'merged';
  }
  const at = formatAt(rt.mergedAt);
  switch (rt.mergedBy) {
    case 'human':
      return rt.mergedVia === 'keyboard' ? `merged by you (keyboard) at ${at}` : `merged by you at ${at}`;
    case 'autopilot':
      return `merged by autopilot at ${at}`;
    case 'scroll':
      return `merged at ${at} · you scrolled past`;
    case 'command':
      return `merged with /yoyo-merge-all at ${at}`;
  }
}
