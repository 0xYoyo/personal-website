import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, out, prog } from '../../lib/ease';
import './vortex.css';

const D = 9;
const KEY = 6.4;

/** Illustrative: an applicant signs in with X, members vote in Discord, an admin sees the tally and lets them in. */
const VOTES = 7;

export function Vortex(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const step = (i: number) => out(prog(t, 0.4 + i * 1.6, 0.9 + i * 1.6));
  const votes = Math.round(VOTES * prog(t, 2.2, 4.6));
  const approved = t >= 5.2;

  return (
    <div ref={ref} className="sc-root sc-vortex">
      <p className="sc-sr">
        Vortex application system: an applicant signs in with X, community members vote in Discord, and an admin dashboard shows the
        tally and lets them in.
      </p>
      <div className="sc-vx-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-vx-col" style={{ opacity: step(0) }}>
          <span className="sc-mono sc-vx-label">apply</span>
          <span className="sc-vx-box">
            <span className="sc-vx-x">X</span> Sign in with X
          </span>
          <span className="sc-mono sc-vx-small">@applicant · connected</span>
        </div>
        <div className="sc-vx-col" style={{ opacity: step(1) }}>
          <span className="sc-mono sc-vx-label">discord vote</span>
          <span className="sc-vx-box sc-vx-votes">
            {Array.from({ length: VOTES }, (_, i) => (
              <i key={i} className={i < votes ? 'is-on' : ''} />
            ))}
          </span>
          <span className="sc-mono sc-vx-small">{votes} yes</span>
        </div>
        <div className="sc-vx-col" style={{ opacity: step(2) }}>
          <span className="sc-mono sc-vx-label">admin</span>
          <span className={'sc-vx-box sc-vx-admin' + (approved ? ' is-on' : '')}>{approved ? 'approved' : 'review'}</span>
          <span className="sc-mono sc-vx-small">role granted on approve</span>
        </div>
      </div>
    </div>
  );
}

export default Vortex;
export const vortexMeta = { duration: D, keyTime: KEY } as const;
