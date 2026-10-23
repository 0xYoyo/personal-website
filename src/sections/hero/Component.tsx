import { useEffect, useState } from 'react';
import { profile } from '../../content/profile';
import { commitCount, firstCommit, fmt, repoCount } from '../../data/stats';
import { useFactory } from '../../factory/store';
import { cx } from '../../lib/cx';
import { CommitCloud } from './CommitCloud';
import { firstMergeDone, freshVisit } from './heroState';
import './hero.css';

const since = firstCommit
  ? new Date(firstCommit.d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '';

/** Fresh visits only (POLISH_WAVE E): what is happening below the fold, and that it waits for you. */
const HINT = 'Agents are building this page below you. The first pull request will wait for your merge.';
const HINT_DELAY = 1200;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The hint line. It keeps its space for the whole fresh run (so nothing below
 * it moves when it fades) and is not rendered at all for skipped, returning
 * or reduced-motion visits.
 */
function useHint() {
  const fresh = useFactory(freshVisit);
  const merged = useFactory(firstMergeDone);
  const runId = useFactory((s) => s.runId);
  const [reduced] = useState(prefersReducedMotion);
  const [due, setDue] = useState(false);

  useEffect(() => {
    setDue(false);
    const t = window.setTimeout(() => setDue(true), HINT_DELAY);
    return () => window.clearTimeout(t);
  }, [runId]);

  const eligible = fresh && !reduced;
  // The text stays in place once due, so the fade-out after the first merge has something to fade.
  return { eligible, due, shown: eligible && due && !merged };
}

export default function HeroSection() {
  const skipped = useFactory((s) => s.skipped);
  const hint = useHint();

  return (
    // While the show plays on a wide screen, the hero keeps the bottom-right clear for the
    // expanded control room (POLISH_WAVE I); a skipped or returning visit uses the full width.
    <div className={cx('hero', !skipped && 'hero--live')}>
      <h1 className="hero-name">{profile.name}</h1>
      <div className="hero-grid">
        <div className="hero-copy">
          <p className="hero-ids mono">
            <span>{profile.handle}</span>
            <span className="he hero-he" lang="he" dir="rtl">
              {profile.hebrewName}
            </span>
          </p>
          <p className="hero-oneliner">{profile.oneLiner}</p>
          {profile.supporting.map((line) => (
            <p key={line} className="hero-support">
              {line}
            </p>
          ))}
        </div>
        <figure className="hero-cloud">
          <figcaption className="hero-caption mono">
            {fmt(commitCount)} commits · {repoCount} repos · since {since} · each dot is one
          </figcaption>
          <CommitCloud />
        </figure>
        {hint.eligible && (
          <p className={cx('hero-hint mono', hint.shown && 'is-shown')} role="status">
            {hint.due ? HINT : ''}
          </p>
        )}
      </div>
    </div>
  );
}
