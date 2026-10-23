import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, hash, lerp, out, prog, spring } from '../../lib/ease';
import './polybot.css';

const D = 11;
const KEY = 9.2;
const N = 140;
const STOP = 0.8; // where observation stops and the line goes flat
const DIV: [number, number] = [0.4, 0.56];
const DRAW: [number, number] = [0.5, 6.0];
const STAMP = 7.05;

// chart box in stage units (cqw)
const X0 = 6;
const X1 = 94;
const Y0 = 13;
const Y1 = 49;
const LO = 0.4;
const HI = 0.62;

/** Illustrative series: a Pinnacle-derived reference and a Polymarket price that tracks it, diverges once, then re-converges. */
function series() {
  const ref: number[] = [];
  const poly: number[] = [];
  let walk = 0;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    walk += (hash(i + 7) - 0.5) * 0.006;
    walk *= 0.97;
    const r = 0.5 + 0.045 * Math.sin(x * 5.2 + 0.6) + 0.018 * Math.sin(x * 17 + 1.3) + walk;
    const bump = Math.sin(Math.PI * Math.min(1, Math.max(0, (x - DIV[0]) / (DIV[1] - DIV[0]))));
    const gap = x > DIV[0] && x < DIV[1] ? 0.038 * Math.pow(bump, 0.8) : 0;
    const p = r + gap + (hash(i * 3 + 1) - 0.5) * 0.004;
    ref.push(r);
    poly.push(p);
  }
  return { ref, poly };
}
const S = series();
const sx = (x: number) => lerp(X0, X1, x);
const sy = (v: number) => lerp(Y1, Y0, (v - LO) / (HI - LO));

function path(vals: number[], head: number): string {
  const last = Math.min(N - 1, Math.floor(head * (N - 1)));
  const stopI = Math.floor(STOP * (N - 1));
  let d = '';
  for (let i = 0; i <= Math.min(last, stopI); i++) d += `${i ? 'L' : 'M'}${sx(i / (N - 1)).toFixed(2)} ${sy(vals[i]!).toFixed(2)}`;
  // sub-sample interpolation for a smooth head
  if (last < stopI && last + 1 < N) {
    const f = head * (N - 1) - last;
    const v = lerp(vals[last]!, vals[last + 1]!, f);
    d += `L${sx(head).toFixed(2)} ${sy(v).toFixed(2)}`;
  }
  return d;
}
function valueAt(vals: number[], x: number): number {
  const f = Math.min(x, STOP) * (N - 1);
  const i = Math.floor(f);
  return lerp(vals[i]!, vals[Math.min(N - 1, i + 1)]!, f - i);
}

export function Polybot(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const axes = out(prog(t, 0.05, 0.6));
  const head = lerp(0, STOP, prog(t, DRAW[0], DRAW[1]));
  const flat = out(prog(t, DRAW[1] + 0.05, DRAW[1] + 0.8));
  const headX = Math.min(head, STOP);
  const pv = valueAt(S.poly, headX);
  const rv = valueAt(S.ref, headX);
  const edge = Math.abs(pv - rv) * 100;

  // divergence band, drawn as the head passes it
  const bandP = prog(head, DIV[0], DIV[1]);
  const band = bandP > 0 ? Math.min(1, bandP * 3) * (1 - 0.6 * prog(t, 5.2, 5.8)) : 0;
  const bandMid = (DIV[0] + DIV[1]) / 2;
  const peakGap = Math.max(...S.poly.map((p, i) => p - S.ref[i]!)) * 100;
  const gapLabel = out(prog(head, bandMid, bandMid + 0.04));

  const stamp = prog(t, STAMP, STAMP + 0.7);
  const stopV = valueAt(S.poly, STOP);
  const stopR = valueAt(S.ref, STOP);

  return (
    <div ref={ref} className="sc-root sc-polybot">
      <p className="sc-sr">
        Polybot: a Polymarket price tracks a Pinnacle-derived reference price; a gap opens and closes, the line goes flat, and a stamp lands:
        edge too small, stopped.
      </p>
      <div className="sc-polybot-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-polybot-legend" style={{ opacity: axes }}>
          <span>
            <i className="is-poly" /> Polymarket
          </span>
          <span>
            <i className="is-ref" /> reference
          </span>
        </div>
        <div className="sc-polybot-edge sc-mono" style={{ opacity: axes }}>
          edge <span>{(t >= DRAW[1] ? 0.2 : edge).toFixed(1)}¢</span>
        </div>

        <svg className="sc-polybot-chart" viewBox="0 0 100 62.5" preserveAspectRatio="none">
          {[0.45, 0.5, 0.55, 0.6].map((v) => (
            <line key={v} x1={X0} x2={X1} y1={sy(v)} y2={sy(v)} className="sc-polybot-grid" style={{ opacity: axes }} vectorEffect="non-scaling-stroke" />
          ))}
          {band > 0 && (
            <rect
              x={sx(DIV[0])}
              width={sx(Math.min(head, DIV[1])) - sx(DIV[0])}
              y={Y0}
              height={Y1 - Y0}
              className="sc-polybot-band"
              style={{ opacity: band }}
            />
          )}
          <path d={path(S.ref, head)} className="sc-polybot-ref" vectorEffect="non-scaling-stroke" />
          <path d={path(S.poly, head)} className="sc-polybot-poly" vectorEffect="non-scaling-stroke" />
          {flat > 0 && (
            <>
              <line x1={sx(STOP)} x2={lerp(sx(STOP), X1, flat)} y1={sy(stopR)} y2={sy(stopR)} className="sc-polybot-ref is-flat" vectorEffect="non-scaling-stroke" />
              <line x1={sx(STOP)} x2={lerp(sx(STOP), X1, flat)} y1={sy(stopV)} y2={sy(stopV)} className="sc-polybot-poly is-flat" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {head > 0 && head < STOP && (
          <>
            <span className="sc-polybot-head is-ref" style={{ left: `${sx(head)}cqw`, top: `${sy(rv)}cqw` }} />
            <span className="sc-polybot-head" style={{ left: `${sx(head)}cqw`, top: `${sy(pv)}cqw` }} />
          </>
        )}
        <span
          className="sc-polybot-gap sc-mono"
          style={{ left: `${sx(bandMid)}cqw`, top: `${Y0 - 0.4}cqw`, opacity: gapLabel * (1 - 0.5 * prog(t, 5.2, 5.8)) }}
        >
          gap {peakGap.toFixed(1)}¢
        </span>
        <div className="sc-polybot-axis sc-mono" style={{ opacity: axes }}>
          {['60¢', '55¢', '50¢', '45¢'].map((l, i) => (
            <span key={l} style={{ top: `${sy(0.6 - i * 0.05)}cqw` }}>
              {l}
            </span>
          ))}
        </div>

        <div
          className="sc-polybot-stamp sc-mono"
          style={{ opacity: Math.min(1, stamp * 4), transform: `translate(-50%,-50%) rotate(-5deg) scale(${lerp(1.7, 1, spring(stamp, 8, 11))})` }}
        >
          edge too small. stopped.
        </div>
      </div>
    </div>
  );
}

export default Polybot;
export const polybotMeta = { duration: D, keyTime: KEY } as const;
