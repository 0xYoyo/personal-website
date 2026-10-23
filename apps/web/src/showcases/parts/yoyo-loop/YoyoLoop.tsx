import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, inOut, lerp, out, prog, spring } from '../../lib/ease';
import './yoyo-loop.css';

const D = 11;
const KEY = 9.6;

/** Three real issues from the Oct 2026 Unfiltered burst, with the PRs that closed them (prs.json). */
const ROWS = [
  { issue: 'YOY-162', title: 'keep an excluded term only when it is negated', branch: 'YOY-162-exclusion-needs-negation', pr: 190 },
  { issue: 'YOY-163', title: 'drop what the judge calls not relevant', branch: 'YOY-163-drop-not-relevant', pr: 192 },
  { issue: 'YOY-161', title: 'size-missing is N/A on the seed catalog', branch: 'YOY-161-size-missing-na-on-seed', pr: 193 },
] as const;

const ROW_Y = [10.5, 25.5, 40.5]; // card tops, cqw
const CARD_H = 12.5;
const PRESS = [6.25, 6.85, 7.45];

function Check({ at, spinAt, t }: { at: number; spinAt: number; t: number }) {
  const spinning = t >= spinAt && t < at;
  const done = spring(prog(t, at, at + 0.45));
  return (
    <svg className="sc-yoyo-loop-check" viewBox="0 0 20 20" aria-hidden="true">
      {t < at && <circle className="sc-yoyo-loop-ring" cx="10" cy="10" r="7" />}
      {spinning && (
        <circle
          className="sc-yoyo-loop-spin"
          cx="10"
          cy="10"
          r="7"
          style={{ transform: `rotate(${(t - spinAt) * 540}deg)` }}
          strokeDasharray="11 33"
        />
      )}
      {t >= at && (
        <g style={{ transform: `scale(${0.4 + 0.6 * done})`, transformOrigin: '10px 10px' }}>
          <circle className="sc-yoyo-loop-ok" cx="10" cy="10" r="8" />
          <path className="sc-yoyo-loop-tick" d="M6 10.4 L8.8 13 L14 7.4" />
        </g>
      )}
    </svg>
  );
}

export function YoyoLoop(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.35)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const dim = lerp(1, 0.13, inOut(prog(t, 7.75, 8.3)));
  const count = Math.round(44 * out(prog(t, 8.3, 9.3)));
  const countIn = out(prog(t, 8.2, 8.8));
  const daysIn = out(prog(t, 9.15, 9.6));

  // Cursor path: enters bottom right, visits each Merge button
  const targets = ROW_Y.map((y) => ({ x: 89.5, y: y + CARD_H / 2 + 0.6 }));
  const legs: [number, number, { x: number; y: number }, { x: number; y: number }][] = [
    [5.55, 6.15, { x: 104, y: 70 }, targets[0]!],
    [6.4, 6.75, targets[0]!, targets[1]!],
    [7.0, 7.35, targets[1]!, targets[2]!],
    [7.6, 8.3, targets[2]!, { x: 104, y: 72 }],
  ];
  let cx = 104;
  let cy = 70;
  for (const [a, b, p0, p1] of legs) {
    if (t >= a) {
      const k = inOut(prog(t, a, b));
      cx = lerp(p0.x, p1.x, k);
      cy = lerp(p0.y, p1.y, k);
    }
  }
  const pressScale = PRESS.reduce((s, p) => {
    const k = prog(t, p, p + 0.28);
    return k > 0 && k < 1 ? Math.min(s, 1 - 0.16 * Math.sin(k * Math.PI)) : s;
  }, 1);

  return (
    <div ref={ref} className="sc-root sc-yoyo-loop">
      <p className="sc-sr">
        yoyo-loop: three agent-ready Linear issues each get their own git worktree, open a pull request, pass CI and the agent review,
        and a human presses Merge. 44 PRs in 4 days.
      </p>
      <div className="sc-yoyo-loop-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-yoyo-loop-work" style={{ opacity: dim }}>
          <svg className="sc-yoyo-loop-lanes" viewBox="0 0 100 62.5" preserveAspectRatio="none">
            {ROWS.map((r, i) => {
              const y = ROW_Y[i]! + CARD_H / 2;
              const draw = out(prog(t, 1.45 + i * 0.16, 2.35 + i * 0.16));
              const merged = prog(t, PRESS[i]! + 0.1, PRESS[i]! + 0.5);
              return (
                <g key={r.pr}>
                  <line
                    x1="35"
                    y1={y}
                    x2={lerp(35, 57, draw)}
                    y2={y}
                    className={'sc-yoyo-loop-lane' + (merged > 0 ? ' is-merged' : '')}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </svg>
          {ROWS.map((r, i) => {
            const y = ROW_Y[i]!;
            const a = 0.15 + i * 0.13;
            const k = out(prog(t, a, a + 0.65));
            const lab = spring(prog(t, 0.95 + i * 0.1, 1.5 + i * 0.1));
            return (
              <div
                key={r.issue}
                className="sc-yoyo-loop-issue"
                style={{ top: `${y}cqw`, opacity: k, transform: `translateY(${(1 - k) * -3}cqw)` }}
              >
                <div className="sc-yoyo-loop-issue-top">
                  <span className="sc-mono sc-yoyo-loop-id">{r.issue}</span>
                  <span className="sc-mono sc-yoyo-loop-label" style={{ opacity: Math.min(1, lab * 1.5), transform: `scale(${0.6 + 0.4 * lab})` }}>
                    agent-ready
                  </span>
                </div>
                <div className="sc-yoyo-loop-title">{r.title}</div>
              </div>
            );
          })}
          {ROWS.map((r, i) => {
            const y = ROW_Y[i]! + CARD_H / 2;
            return [0, 1, 2].map((j) => {
              const at = 2.05 + i * 0.22 + j * 0.42;
              const k = spring(prog(t, at, at + 0.4));
              return (
                <span
                  key={`${r.pr}-${j}`}
                  className="sc-yoyo-loop-commit"
                  style={{ left: `${40 + j * 6}cqw`, top: `${y}cqw`, transform: `translate(-50%,-50%) scale(${k})` }}
                />
              );
            });
          })}
          {ROWS.map((r, i) => {
            const y = ROW_Y[i]! + CARD_H / 2;
            const k = out(prog(t, 1.75 + i * 0.16, 2.4 + i * 0.16));
            return (
              <span
                key={`b-${r.pr}`}
                className="sc-mono sc-yoyo-loop-branch"
                style={{ top: `${y - 3.6}cqw`, opacity: k }}
              >
                worktree
              </span>
            );
          })}
          {ROWS.map((r, i) => {
            const y = ROW_Y[i]!;
            const a = 3.05 + i * 0.2;
            const k = out(prog(t, a, a + 0.7));
            const merged = t >= PRESS[i]! + 0.08;
            const fill = prog(t, PRESS[i]!, PRESS[i]! + 0.25);
            const isPressing = t >= PRESS[i]! && t < PRESS[i]! + 0.28;
            return (
              <div
                key={r.pr}
                className={'sc-yoyo-loop-pr' + (merged ? ' is-merged' : '')}
                style={{ top: `${y}cqw`, opacity: k, transform: `translateX(${(1 - k) * 8}cqw)` }}
              >
                <div className="sc-yoyo-loop-pr-top">
                  <span className="sc-mono sc-yoyo-loop-num">#{r.pr}</span>
                  <span className="sc-mono sc-yoyo-loop-br">{r.branch}</span>
                </div>
                <div className="sc-yoyo-loop-checks sc-mono">
                  <span>
                    <Check t={t} spinAt={3.9 + i * 0.15} at={4.55 + i * 0.22} /> ci
                  </span>
                  <span>
                    <Check t={t} spinAt={4.35 + i * 0.15} at={5.05 + i * 0.22} />
                    {t >= 5.05 + i * 0.22 ? (<><span className="sc-yoyo-loop-long">loop-approved</span><span className="sc-yoyo-loop-short">review</span></>) : 'review'}
                  </span>
                </div>
                <span
                  className="sc-yoyo-loop-merge"
                  style={{
                    transform: `translateY(-50%) scale(${isPressing ? pressScale : 1})`,
                    ['--sc-yl-fill' as string]: fill,
                  }}
                >
                  {merged ? 'Merged' : 'Merge'}
                </span>
              </div>
            );
          })}
        </div>

        <svg
          className="sc-yoyo-loop-cursor"
          viewBox="0 0 24 24"
          style={{ left: `${cx}cqw`, top: `${cy}cqw`, transform: `scale(${pressScale})` }}
          aria-hidden="true"
        >
          <path d="M3 2 L3 19.5 L7.6 15.3 L10.6 22 L13.8 20.6 L10.9 14.1 L17 14.1 Z" />
        </svg>

        <div className="sc-yoyo-loop-count" style={{ opacity: countIn, transform: `translateY(${(1 - countIn) * 3}cqw)` }}>
          <span className="sc-yoyo-loop-big">
            {count} <span className="sc-yoyo-loop-unit">PRs</span>
          </span>
          <span className="sc-yoyo-loop-days" style={{ opacity: daysIn, transform: `translateX(${(1 - daysIn) * -2}cqw)` }}>
            · 4 days
          </span>
        </div>
      </div>
    </div>
  );
}

export default YoyoLoop;
export const yoyoLoopMeta = { duration: D, keyTime: KEY } as const;
