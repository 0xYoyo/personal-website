// What the hero reads from the factory store, in one place. The store is
// being extended (a `lightsOn` switch, a `firstMergeDone` flag), so these
// selectors read those flags when they exist and derive the same answer from
// the merged sections when they do not.
import type { FactoryState } from '../../factory/store';

/** Fields the hero uses that a given version of the store may or may not have. */
interface MaybeFlags {
  lightsOn?: unknown;
  firstMergeDone?: unknown;
  lightsOverride?: unknown;
  seen?: unknown;
  skipped?: unknown;
}

type HeroInput = Pick<FactoryState, 'meta' | 'sections'>;

const flags = (s: HeroInput): MaybeFlags => s as unknown as MaybeFlags;

/** The lights flip from ink to paper when this many PRs after #1 have merged (POLISH_WAVE D). */
export const LIGHTS_ON_AT = 4;

/** PRs merged after #1 (the hero itself is merged at init and does not count). */
export function mergedAfterInit(s: HeroInput): number {
  return s.meta.slice(1).filter((m) => s.sections[m.id]?.state === 'merged').length;
}

/** True once the page is in the paper regime: the store's switch, the "Lights" command, or 4+ merged. */
export function lightsOn(s: HeroInput): boolean {
  const f = flags(s);
  if (f.lightsOverride === 0 || f.lightsOverride === 1) return f.lightsOverride === 1;
  if (typeof f.lightsOn === 'boolean') return f.lightsOn;
  if (f.skipped === true) return true;
  return mergedAfterInit(s) >= LIGHTS_ON_AT;
}

/** Any PR after #1 has merged this run, by any source. */
export function firstMergeDone(s: HeroInput): boolean {
  const f = flags(s);
  if (typeof f.firstMergeDone === 'boolean') return f.firstMergeDone;
  return mergedAfterInit(s) > 0;
}

/** A first visit with the show playing: not skipped, not returning, not a replay of a finished show. */
export function freshVisit(s: HeroInput): boolean {
  const f = flags(s);
  return f.skipped !== true && f.seen !== true;
}
