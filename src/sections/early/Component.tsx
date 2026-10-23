import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { commitsPerYear, dataThrough, earlyLede, earlyMoments } from '../../content/early';
import { useFactory } from '../../factory/store';
import { Timeline } from './Timeline';
import './early.css';

export default function EarlySection() {
  const skipped = useFactory((s) => s.skipped);
  const reduced = useReducedMotion();
  // Decided once, at merge: the spine draws on this mount only.
  const [play] = useState(() => !skipped && !reduced);
  const last = commitsPerYear[commitsPerYear.length - 1];

  return (
    <div className="early">
      <p className="lede">{earlyLede}</p>
      <Timeline moments={earlyMoments} play={play} />
      <div className="early-years">
        <p className="early-years-label">
          Public commits per year
          {last && dataThrough && <span className="muted"> ({last.year} through {dataThrough})</span>}
        </p>
        <dl className="early-years-row mono">
          {commitsPerYear.map(({ year, n }) => (
            <div key={year} className="early-year">
              <dt>{year}</dt>
              <dd>{n.toLocaleString('en-US')}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
