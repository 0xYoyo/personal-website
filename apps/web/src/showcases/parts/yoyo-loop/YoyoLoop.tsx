import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant, type Variant } from '../../lib/fit';
import { accel, inOut, lerp, out, prog, spring } from '../../lib/ease';
import './yoyo-loop.css';

const D = 12;
const KEY = 11;

const STAGES = ['Plan', 'Build', 'Review', 'Approve'] as const;
/** Three tasks, in plain words. */
const TASKS = ['Size filter', 'Fix checkout', 'Faster search'] as const;

const ENTER = 0.5; // first card appears in Plan
const STAGGER = 0.7; // between cards
const STEP = 1.6; // from one stage to the next
const TRAVEL = 0.5; // the move itself
const arrive = (i: number, s: number) => ENTER + i * STAGGER + s * STEP;
const PRESS = (i: number) => arrive(i, 3) + 0.5;
const COUNT = arrive(2, 3) + 1.2;

// four equal columns, equal gaps: the header pills and the arrows between them are identical
const MX = 4;
const GAP = 2;
const COL_W = (100 - 2 * MX - 3 * GAP) / 4;
const PILL_W = 15;
const colX = (s: number) => MX + s * (COL_W + GAP);

const L: Record<Variant, { headY: number; headH: number; laneTop: number; laneBot: number; cardY: number[]; cardH: number; countY: number }> = {
  tall: { headY: 7, headH: 6.4, laneTop: 17, laneBot: 77, cardY: [20.5, 39, 57.5], cardH: 15.5, countY: 84 },
  wide: { headY: 2.6, headH: 5.6, laneTop: 10.8, laneBot: 51.6, cardY: [13, 25.8, 38.6], cardH: 11.4, countY: 54.2 },
};

function Status({ i, t }: { i: number; t: number }) {
  // which stage the card is in (or arriving at) now
  let s = 0;
  for (let k = 1; k < 4; k++) if (t >= arrive(i, k) - TRAVEL * 0.5) s = k;
  if (s === 0) return <span className="sc-yoyo-loop-st sc-mono">planned</span>;
  if (s === 1) {
    const p = prog(t, arrive(i, 1), arrive(i, 1) + STEP - TRAVEL - 0.15);
    return (
      <span className="sc-yoyo-loop-st sc-mono">
        <span className="sc-yoyo-loop-bar">
          <i style={{ transform: `scaleX(${p})` }} />
          <b style={{ left: `${((t * 1.4) % 1) * 140 - 40}%`, opacity: p < 1 ? 1 : 0 }} />
        </span>
      </span>
    );
  }
  if (s === 2) {
    const ok = spring(prog(t, arrive(i, 2) + 0.4, arrive(i, 2) + 0.85));
    return (
      <span className="sc-yoyo-loop-st sc-mono">
        <svg className="sc-yoyo-loop-check" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="sc-yoyo-loop-ring" cx="10" cy="10" r="7.5" />
          {ok > 0 && (
            <g style={{ transform: `scale(${0.3 + 0.7 * ok})`, transformOrigin: '10px 10px' }}>
              <circle className="sc-yoyo-loop-ok" cx="10" cy="10" r="8" />
              <path className="sc-yoyo-loop-tick" d="M6 10.4 L8.8 13 L14 7.4" />
            </g>
          )}
        </svg>
        {ok > 0 ? 'checked' : 'checking'}
      </span>
    );
  }
  const press = prog(t, PRESS(i), PRESS(i) + 0.26);
  const merged = t >= PRESS(i) + 0.13;
  const sc = press > 0 && press < 1 ? 1 - 0.12 * Math.sin(press * Math.PI) : 1;
  return (
    <span className="sc-yoyo-loop-st sc-mono">
      <span className={'sc-yoyo-loop-merge' + (merged ? ' is-merged' : '')} style={{ transform: `scale(${sc})` }}>
        {merged ? 'Merged' : 'Merge'}
      </span>
    </span>
  );
}

export function YoyoLoop(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const lay = L[v];

  const stage = Math.min(out(prog(t, 0, 0.35)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const heads = out(prog(t, 0.05, 0.5));
  const countIn = out(prog(t, COUNT, COUNT + 0.5));
  const count = Math.round(44 * out(prog(t, COUNT, COUNT + 1)));

  // a stage header lights while a card sits in it
  const busy = STAGES.map((_, s) =>
    TASKS.some((_, i) => {
      const a = arrive(i, s);
      const end = s === 3 ? PRESS(i) + 0.3 : arrive(i, s + 1) - TRAVEL;
      return t >= a && t < end;
    }),
  );

  return (
    <div ref={ref} className="sc-root sc-yoyo-loop">
      <p className="sc-sr">
        yoyo-loop: three tasks move through four stages, Plan, Build, Review and Approve. AI agents build and check each one, and I press
        Merge. 44 updates in 4 days.
      </p>
      <Fit v={v} className="sc-yoyo-loop-stage" style={{ opacity: stage }}>
        <div aria-hidden="true">
          {STAGES.map((name, s) => (
            <div
              key={`lane-${name}`}
              className="sc-yoyo-loop-lane"
              style={{ left: `${colX(s)}cqw`, width: `${COL_W}cqw`, top: `${lay.laneTop}cqw`, height: `${lay.laneBot - lay.laneTop}cqw`, opacity: heads }}
            />
          ))}
          {STAGES.map((name, s) => (
            <span
              key={name}
              className={'sc-yoyo-loop-head' + (busy[s] ? ' is-busy' : '')}
              style={{
                left: `${colX(s) + (COL_W - PILL_W) / 2}cqw`,
                width: `${PILL_W}cqw`,
                top: `${lay.headY}cqw`,
                height: `${lay.headH}cqw`,
                opacity: heads,
              }}
            >
              {name}
            </span>
          ))}
          <svg className="sc-yoyo-loop-arrows" viewBox={`0 0 100 ${v === 'tall' ? 100 : 62.5}`} style={{ opacity: heads }}>
            {[0, 1, 2].map((s) => {
              const x1 = colX(s) + (COL_W + PILL_W) / 2 + 1;
              const x2 = colX(s + 1) + (COL_W - PILL_W) / 2 - 1;
              const y = lay.headY + lay.headH / 2;
              return (
                <g key={s} className="sc-yoyo-loop-arrow">
                  <line x1={x1} y1={y} x2={x2 - 0.2} y2={y} />
                  <path d={`M ${x2 - 1.3} ${y - 1.1} L ${x2} ${y} L ${x2 - 1.3} ${y + 1.1}`} />
                </g>
              );
            })}
          </svg>

          {TASKS.map((task, i) => {
            const k = out(prog(t, ENTER + i * STAGGER - 0.3, ENTER + i * STAGGER + 0.2));
            let x = colX(0);
            for (let s = 1; s < 4; s++) {
              const m = inOut(prog(t, arrive(i, s) - TRAVEL, arrive(i, s)));
              if (m > 0) x = lerp(colX(s - 1), colX(s), m);
            }
            const merged = t >= PRESS(i) + 0.13;
            return (
              <div
                key={task}
                className={'sc-yoyo-loop-card' + (merged ? ' is-merged' : '')}
                style={{
                  left: `${x + 1}cqw`,
                  width: `${COL_W - 2}cqw`,
                  top: `${lay.cardY[i]}cqw`,
                  height: `${lay.cardH}cqw`,
                  opacity: k,
                  transform: `translateY(${(1 - k) * -1.5}cqw)`,
                }}
              >
                <span className="sc-yoyo-loop-title">{task}</span>
                <Status i={i} t={t} />
              </div>
            );
          })}

          <div className="sc-yoyo-loop-count" style={{ top: `${lay.countY}cqw`, opacity: countIn, transform: `translateY(${(1 - countIn) * 1.5}cqw)` }}>
            <span className="sc-yoyo-loop-big">{count}</span> updates <span className="sc-yoyo-loop-dot">·</span> 4 days
          </div>
        </div>
      </Fit>
    </div>
  );
}

export default YoyoLoop;
export const yoyoLoopMeta = { duration: D, keyTime: KEY } as const;
