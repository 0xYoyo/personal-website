import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant } from '../../lib/fit';
import { accel, out, prog, spring } from '../../lib/ease';
import './vortex.css';

const D = 9;
const KEY = 7.6;

/** Illustrative: one applicant signs in with X, members vote in Discord, an admin approves and the role is granted. */
const YES = 9;
const NO = 1;

// timeline (s)
const T_SIGN = 0.9; // the X sign-in goes through
const T_VOTE0 = 1.5; // votes start counting
const T_VOTE1 = 4.0;
const T_PRESS = 4.7; // the admin presses Approve
const T_ROLE = 5.3; // the role pill pops in

export function Vortex(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - accel(prog(t, D - 0.5, D - 0.05)));
  const signed = t >= T_SIGN;
  const vp = prog(t, T_VOTE0, T_VOTE1);
  const yes = Math.round(YES * vp);
  const no = vp > 0.55 ? NO : 0;
  const pressed = t >= T_PRESS;
  const press = t >= T_PRESS - 0.15 && t < T_PRESS + 0.1 ? 0.94 : 1;
  const role = spring(prog(t, T_ROLE, T_ROLE + 0.6));
  const active = t < T_VOTE0 - 0.1 ? 0 : t < T_PRESS - 0.3 ? 1 : 2;
  const done = (i: number) => (i === 0 ? signed : i === 1 ? vp >= 1 : pressed);

  const cards = [
    {
      title: 'Apply with X',
      sub: 'the applicant signs in',
      body: (
        <div className="sc-vx-profile">
          <span className="sc-vx-av">M</span>
          <span className="sc-vx-who">
            <span className="sc-vx-name">Maya Levi</span>
            <span className="sc-vx-handle sc-mono">@maya_onchain</span>
          </span>
          <span className={'sc-vx-chip' + (signed ? ' is-ok' : '')}>
            <span className="sc-vx-x">X</span> {signed ? 'connected' : 'Sign in'}
          </span>
        </div>
      ),
    },
    {
      title: 'Members vote in Discord',
      sub: '#applications',
      body: (
        <div className="sc-vx-tally">
          <span className="sc-vx-count is-yes">
            <b className="sc-mono">{yes}</b> yes
          </span>
          <span className="sc-vx-bar">
            <i style={{ width: `${(yes / (YES + NO)) * 100}%` }} />
            <i className="is-no" style={{ width: `${(no / (YES + NO)) * 100}%` }} />
          </span>
          <span className="sc-vx-count">
            <b className="sc-mono">{no}</b> no
          </span>
        </div>
      ),
    },
    {
      title: 'Admin approves',
      sub: 'role given automatically',
      body: (
        <div className="sc-vx-admin">
          <span className={'sc-vx-btn' + (pressed ? ' is-on' : '')} style={{ transform: `scale(${press})` }}>
            {pressed ? 'Approved' : 'Approve'}
          </span>
          <span className="sc-vx-role" style={{ opacity: Math.min(1, role * 1.5), transform: `scale(${0.7 + 0.3 * role})` }}>
            Member role granted
          </span>
        </div>
      ),
    },
  ];

  return (
    <div ref={ref} className="sc-root sc-vortex">
      <p className="sc-sr">
        Vortex membership system: an applicant applies by signing in with X, community members vote in Discord, and an admin approves.
        The member role is then granted automatically.
      </p>
      <Fit v={v} style={{ opacity: stage }}>
        <div className="sc-vx-stack" aria-hidden="true">
          {cards.map((c, i) => (
            <div key={c.title} className={'sc-vx-card' + (active === i ? ' is-active' : '')}>
              <span className={'sc-vx-num sc-mono' + (done(i) ? ' is-done' : '')}>{done(i) ? '✓' : i + 1}</span>
              <span className="sc-vx-head">
                <span className="sc-vx-title">{c.title}</span>
                <span className="sc-vx-sub sc-mono">{c.sub}</span>
              </span>
              {c.body}
            </div>
          ))}
        </div>
      </Fit>
    </div>
  );
}

export default Vortex;
export const vortexMeta = { duration: D, keyTime: KEY } as const;
