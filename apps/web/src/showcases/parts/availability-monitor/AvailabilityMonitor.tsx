import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant } from '../../lib/fit';
import { imageUrl } from '../../config';
import { accel, inOut, out, prog, spring } from '../../lib/ease';
import './availability-monitor.css';

const D = 11;
/** Reduced motion rests on the hit: two nights open and the Telegram message (the photo needs the story before it). */
const KEY = 6.3;
const FIRST = 3; // April 2026 starts on a Wednesday (Sunday-first grid)
const DAYS = 30;
const WINDOW: [number, number] = [1, 11]; // the flexible date window being watched
const OPEN = [6, 7]; // two nights open up
const SWEEPS = [1.2, 2.35, 3.5];
const SWEEP_LEN = 0.9;
const FLIP = 4.35;
const PING = 5.15;
/** After the ping, the room's own view crossfades in and holds 3 s. */
const VIEW = 6.7;
const VIEW_IN = 0.7;

function Tent() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 19.5 L12 4.5 L21.5 19.5 Z" />
      <path d="M12 4.5 L12 19.5 M9 19.5 L12 13.5 L15 19.5" />
    </svg>
  );
}

export function AvailabilityMonitor(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);

  const view = inOut(prog(t, VIEW, VIEW + VIEW_IN));
  const end = 1 - accel(prog(t, D - 0.6, D - 0.1));
  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - view);
  const caption = out(prog(t, VIEW + VIEW_IN - 0.1, VIEW + VIEW_IN + 0.4));
  const ping = spring(prog(t, PING, PING + 0.9));
  const pingOp = Math.min(1, prog(t, PING, PING + 0.25) * 1.2);
  const sweepIdx = SWEEPS.findIndex((s) => t >= s && t < s + SWEEP_LEN);
  const sweep = sweepIdx >= 0 ? inOut(prog(t, SWEEPS[sweepIdx]!, SWEEPS[sweepIdx]! + SWEEP_LEN)) : -1;
  const lastSweep = SWEEPS.filter((s) => t >= s + SWEEP_LEN).length;

  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = i - FIRST + 1;
    const inMonth = d >= 1 && d <= DAYS;
    const watched = inMonth && d >= WINDOW[0] && d <= WINDOW[1];
    const isOpen = OPEN.includes(d);
    const flip = isOpen ? prog(t, FLIP + OPEN.indexOf(d) * 0.12, FLIP + 0.55 + OPEN.indexOf(d) * 0.12) : 0;
    const flipped = flip >= 0.5;
    cells.push(
      <div
        key={i}
        className={
          'sc-availability-monitor-cell' +
          (inMonth ? '' : ' is-blank') +
          (watched ? ' is-watched' : '') +
          (watched && !flipped ? ' is-sold' : '') +
          (flipped ? ' is-open' : '')
        }
        style={{
          transform: `perspective(40cqw) rotateY(${(flipped ? 1 - flip : flip) * 90}deg) scale(${flipped ? 1 + 0.08 * Math.sin(prog(t, FLIP + 0.55, FLIP + 1.1) * Math.PI) : 1})`,
        }}
      >
        {inMonth ? <span>{d}</span> : null}
      </div>,
    );
  }

  const log = [
    { at: SWEEPS[0]! + SWEEP_LEN, text: 'sold out' },
    { at: SWEEPS[1]! + SWEEP_LEN, text: 'sold out' },
    { at: FLIP + 0.3, text: '2 nights open' },
  ];

  return (
    <div ref={ref} className="sc-root sc-availability-monitor">
      <p className="sc-sr">
        Availability Monitor: a sold-out April at the Metzoke Dragot hotel is checked again and again until two nights open up, and a
        Telegram message arrives: Room open, 2 nights. Then the view from that room.
      </p>
      <Fit v={v} className="sc-availability-monitor-stage" style={{ opacity: stage }}>
        <div aria-hidden="true">
        {/* the calendar is whole from frame 1 */}
        <div className="sc-availability-monitor-cal">
          <div className="sc-availability-monitor-head">
            <span className="sc-availability-monitor-hotel">Metzoke Dragot</span>
            <span className="sc-mono sc-availability-monitor-month">April</span>
          </div>
          <div className="sc-availability-monitor-dow sc-mono">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="sc-availability-monitor-grid sc-mono">
            {cells}
            {sweep >= 0 && <span className="sc-availability-monitor-sweep" style={{ left: `${sweep * 100}%` }} />}
          </div>
        </div>

        <div
          className="sc-availability-monitor-ping"
          style={{ opacity: pingOp, transform: `translateX(${(1 - ping) * 30}cqw)` }}
        >
          <span className="sc-availability-monitor-avatar">
            <Tent />
          </span>
          <span className="sc-availability-monitor-msg">
            <span className="sc-availability-monitor-from">
              Availability Monitor <span className="sc-mono">now</span>
            </span>
            <span className="sc-availability-monitor-text">Room open · 2 nights</span>
          </span>
        </div>

        <div className="sc-availability-monitor-log sc-mono">
          {log.map((l, i) => {
            // a check's row takes its place only once it has run, so "checking" sits right under the last one
            if (t < l.at) return null;
            const k = out(prog(t, l.at, l.at + 0.35));
            return (
              <div
                key={i}
                className={'sc-availability-monitor-run' + (i === 2 ? ' is-hit' : '')}
                style={{ opacity: k, transform: `translateY(${(1 - k) * 1.2}cqw)` }}
              >
                <span>check {i + 1}</span>
                <span>{l.text}</span>
              </div>
            );
          })}
          <div className="sc-availability-monitor-checking" style={{ opacity: t < FLIP && lastSweep < 3 ? 1 : 0 }}>
            checking{'.'.repeat(1 + (Math.floor(t * 3) % 3))}
          </div>
        </div>
        </div>
      </Fit>
      <div className="sc-availability-monitor-view" style={{ opacity: view * end, visibility: view > 0 ? 'visible' : 'hidden' }} aria-hidden="true">
        <img src={imageUrl('room-view.webp')} alt="" draggable={false} style={{ transform: `scale(${1.05 - 0.05 * view})` }} />
        <span className="sc-mono sc-availability-monitor-caption" style={{ opacity: caption }}>
          the view.
        </span>
      </div>
    </div>
  );
}

export default AvailabilityMonitor;
export const availabilityMonitorMeta = { duration: D, keyTime: KEY } as const;
