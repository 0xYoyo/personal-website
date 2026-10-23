import { BUILT_BY_AGENTS, REVIEW_ROUNDS, SITE_DATE, SITE_VERSION } from '../../content/profile';

/**
 * Footer line 1. N and M are filled in by the planner at the end of the build;
 * while either is 0 its clause is left out rather than printing "0 agents".
 */
export function buildLine(agents = BUILT_BY_AGENTS, rounds = REVIEW_ROUNDS): string {
  let made = 'Planned by one model';
  if (agents > 0) made += `, built by ${agents} ${agents === 1 ? 'agent' : 'agents'}`;
  if (rounds > 0) made += `, reviewed in ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  return `${SITE_VERSION} — ${SITE_DATE}. Spec by Yoyo. ${made}.`;
}
