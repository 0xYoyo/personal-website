import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant, type Variant, CANVAS_H } from '../../lib/fit';
import { accel, hash, lerp, out, prog, spring } from '../../lib/ease';
import './polybot.css';

const D = 10;
const KEY = 9;
const N = 160;

/** The bookmaker's price jumps at JUMP; Polymarket lags and only catches up at CATCH. */
const JUMP = 0.5;
const CATCH = 0.62;
const END = 1;
const J = 0.08;
const LO = 0.455;
const HI = 0.615;

// time → how far the lines are drawn. Frame 1 already shows history (H0); the gap stays open
// T_JUMP..T_CATCH (2.4 s) and snaps shut right after.
const H0 = 0.42;
const T_JUMP = 1.3;
const T_CATCH = 3.9;
const T_END = 5.7;
const T_BET = 2.5;
const T_STAMP = 6.1;
function headAt(t: number): number {
  if (t < T_JUMP) return lerp(H0, JUMP, prog(t, 0, T_JUMP));
  if (t < T_CATCH) return lerp(JUMP, CATCH, prog(t, T_JUMP, T_CATCH));
  return lerp(CATCH, END, out(prog(t, T_CATCH, T_END)));
}

const step = (x: number, at: number) => {
  const k = Math.min(1, Math.max(0, (x - at) / 0.008));
  return k * k * (3 - 2 * k);
};
/** Illustrative prices, not real data. */
function base(i: number): number {
  const x = i / (N - 1);
  return 0.5 + 0.016 * Math.sin(x * 3.4 + 2.4) + 0.005 * Math.sin(x * 15 + 1.3) + (hash(i + 7) - 0.5) * 0.0025;
}
const BOOK = Array.from({ length: N }, (_, i) => base(i) + 0.006 + J * step(i / (N - 1), JUMP));
const POLY = Array.from({ length: N }, (_, i) => base(i) - 0.012 + J * step(i / (N - 1), CATCH) + (hash(i * 3 + 1) - 0.5) * 0.0015);

function valueAt(vals: number[], x: number): number {
  const f = Math.max(0, Math.min(1, x)) * (N - 1);
  const i = Math.floor(f);
  return lerp(vals[i]!, vals[Math.min(N - 1, i + 1)]!, f - i);
}

const L: Record<Variant, { y0: number; y1: number }> = {
  tall: { y0: 10, y1: 76 },
  wide: { y0: 7, y1: 50 },
};
// the lines end at X1 so their name labels fit to the right of the line ends
const X0 = 4;
const X1 = 74;

export function Polybot(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const lay = L[v];
  const sx = (x: number) => lerp(X0, X1, x);
  const sy = (val: number) => lerp(lay.y1, lay.y0, (val - LO) / (HI - LO));

  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - accel(prog(t, D - 0.45, D - 0.05)));
  const axes = 1;
  const head = headAt(t);

  const line = (vals: number[]) => {
    const last = Math.floor(head * (N - 1));
    let d = '';
    for (let i = 0; i <= last; i++) d += `${i ? 'L' : 'M'}${sx(i / (N - 1)).toFixed(2)} ${sy(vals[i]!).toFixed(2)}`;
    if (last < N - 1) d += `L${sx(head).toFixed(2)} ${sy(valueAt(vals, head)).toFixed(2)}`;
    return d;
  };

  // the shaded gap between the two lines, from the jump to wherever the head is (or the catch-up)
  let gap = '';
  if (head > JUMP) {
    const a = Math.ceil(JUMP * (N - 1));
    const b = Math.min(head, CATCH + 0.01);
    const top: string[] = [];
    const bot: string[] = [];
    for (let i = a; i / (N - 1) <= b; i++) {
      top.push(`${sx(i / (N - 1)).toFixed(2)} ${sy(BOOK[i]!).toFixed(2)}`);
      bot.unshift(`${sx(i / (N - 1)).toFixed(2)} ${sy(POLY[i]!).toFixed(2)}`);
    }
    top.push(`${sx(b).toFixed(2)} ${sy(valueAt(BOOK, b)).toFixed(2)}`);
    bot.unshift(`${sx(b).toFixed(2)} ${sy(valueAt(POLY, b)).toFixed(2)}`);
    gap = `M${top.join(' L')} L${bot.join(' L')} Z`;
  }
  const caught = t >= T_CATCH + 0.05;
  const gapOp = head > JUMP ? (caught ? lerp(1, 0.45, prog(t, T_CATCH + 0.6, T_CATCH + 1.2)) : 1) : 0;
  const label1 = out(prog(t, T_JUMP + 0.15, T_JUMP + 0.45)) * (1 - prog(t, T_CATCH, T_CATCH + 0.15));
  const label2 = out(prog(t, T_CATCH + 0.05, T_CATCH + 0.35));
  // the labels sit in the empty space left of the jump, centred on the gap's height
  const labelX = sx(JUMP) - 1.6;
  const labelY = (sy(valueAt(BOOK, JUMP + 0.02)) + sy(valueAt(POLY, JUMP + 0.02))) / 2;
  const bet = spring(prog(t, T_BET, T_BET + 0.5));
  const betX = 0.56;
  const betMissed = caught;
  const stamp = prog(t, T_STAMP, T_STAMP + 0.7);
  const h = CANVAS_H[v];

  return (
    <div ref={ref} className="sc-root sc-polybot">
      <p className="sc-sr">
        Polybot: the Polymarket price and a bookmaker's price move together. The bookmaker moves first and Polymarket lags: a mispriced gap
        opens, the bot gets ready to bet, and the gap closes in a fraction of a second, too fast to catch. Stopped.
      </p>
      <Fit v={v} style={{ opacity: stage }}>
        <div aria-hidden="true">
          

          <svg className="sc-polybot-chart" viewBox={`0 0 100 ${h}`}>
            {[0, 1, 2, 3].map((k) => {
              const y = lerp(lay.y0, lay.y1, k / 3);
              return <line key={k} x1={X0} x2={X1} y1={y} y2={y} className="sc-polybot-grid" style={{ opacity: axes }} vectorEffect="non-scaling-stroke" />;
            })}
            {gap && <path d={gap} className="sc-polybot-band" style={{ opacity: gapOp }} />}
            <path d={line(BOOK)} className="sc-polybot-ref" vectorEffect="non-scaling-stroke" />
            <path d={line(POLY)} className="sc-polybot-poly" vectorEffect="non-scaling-stroke" />
          </svg>

          <span className="sc-polybot-name is-ref" style={{ left: `${sx(head) + 2}cqw`, top: `${sy(valueAt(BOOK, head)) - 1.2}cqw` }}>
            Bookmaker
          </span>
          <span className="sc-polybot-name" style={{ left: `${sx(head) + 2}cqw`, top: `${sy(valueAt(POLY, head)) + 1.2}cqw` }}>
            Polymarket
          </span>
          {head > 0 && (
            <>
              <span className="sc-polybot-head is-ref" style={{ left: `${sx(head)}cqw`, top: `${sy(valueAt(BOOK, head))}cqw` }} />
              <span className="sc-polybot-head" style={{ left: `${sx(head)}cqw`, top: `${sy(valueAt(POLY, head))}cqw` }} />
            </>
          )}

          <span className="sc-polybot-gap sc-mono" style={{ left: `${labelX}cqw`, top: `${labelY}cqw`, opacity: label1 }}>
            mispriced
          </span>
          <span
            className="sc-polybot-gap is-late sc-mono"
            style={{ left: `${sx(JUMP)}cqw`, top: `${sy(valueAt(BOOK, JUMP + 0.02)) - 2.4}cqw`, opacity: label2, transform: 'translate(-50%, -100%)' }}
          >
            too fast to catch
          </span>

          {bet > 0 && (
            <span
              className={'sc-polybot-bet sc-mono' + (betMissed ? ' is-missed' : '')}
              style={{
                left: `${sx(betX)}cqw`,
                top: `${sy(valueAt(POLY, betX)) + 1.6}cqw`,
                opacity: Math.min(1, bet * 1.5) * (betMissed ? 0.55 : 1),
                transform: `translateX(-50%) scale(${0.6 + 0.4 * bet})`,
              }}
            >
              bet?
            </span>
          )}

          <div
            className="sc-polybot-stamp sc-mono"
            style={{
              // the stamp sits centred under the chart, clear of the lines and the "bet?" marker
              left: '50%',
              top: `${v === 'tall' ? lay.y1 + 11 : lay.y1 + 6.5}cqw`,
              opacity: Math.min(1, stamp * 4),
              transform: `translate(-50%,-50%) rotate(-5deg) scale(${lerp(1.7, 1, spring(stamp, 8, 11))})`,
            }}
          >
            stopped.
          </div>
        </div>
      </Fit>
    </div>
  );
}

export default Polybot;
export const polybotMeta = { duration: D, keyTime: KEY } as const;
