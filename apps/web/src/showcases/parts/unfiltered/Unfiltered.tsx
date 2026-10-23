import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, caretOn, lerp, out, prog, spring, typed } from '../../lib/ease';
import './unfiltered.css';

const D = 10;
const KEY = 8.9;
const Q1 = 'elegant summer wedding dress, not black, under ₪400';
const Q2 = 'same but cheaper';
const T1 = 0.55; // query 1 starts typing
const CPS1 = 21;
const SUBMIT1 = T1 + Array.from(Q1).length / CPS1 + 0.15;
const CLEAR = 5.35;
const T2 = 5.7;
const CPS2 = 19;
const SUBMIT2 = T2 + Q2.length / CPS2 + 0.15;
const TAG = 8.05;

/** Four products. `rank2` is the slot after "same but cheaper"; prices drop to `p2`. */
const ITEMS = [
  { fill: '#E8DFCC', shape: 0, p1: 389, p2: 284, rank2: 3 },
  { fill: '#AEB79E', shape: 1, p1: 349, p2: 239, rank2: 1 },
  { fill: '#D8B1A4', shape: 2, p1: 372, p2: 259, rank2: 2 },
  { fill: '#AFC0D4', shape: 1, p1: 318, p2: 219, rank2: 0 },
] as const;

const CHIPS1 = ['summer', 'wedding', 'not black', 'under ₪400'];

const DRESS = [
  // slip dress, A-line
  'M15 4 L17 4 L18.5 13 Q20 14.2 21.5 13 L23 4 L25 4 L25.4 15 Q26 19 25 22 L33 52 Q20 55.5 7 52 L15 22 Q14 19 14.6 15 Z',
  // off-shoulder, full skirt
  'M10 11 Q20 8.5 30 11 L28 16 Q27.2 20 26 23 Q34 40 37 52 Q20 56 3 52 Q6 40 14 23 Q12.8 20 12 16 Z',
  // wrap, mermaid hem
  'M14.5 5 L16.5 5 Q20 13 23.5 5 L25.5 5 Q27 12 25.6 18 Q25 23 26 30 Q27 42 33 52 Q20 55 7 52 Q13 42 14 30 Q15 23 14.4 18 Q13 12 14.5 5 Z',
];

function Tile({ fill, shape, price, rank, low }: { fill: string; shape: number; price: number; rank: number; low?: boolean }) {
  return (
    <>
      <div className="sc-unfiltered-img">
        <svg viewBox="0 0 40 56" aria-hidden="true">
          <path d={DRESS[shape]} fill={fill} />
        </svg>
      </div>
      <div className="sc-unfiltered-meta">
        <span className={'sc-unfiltered-price sc-mono' + (low ? ' is-low' : '')}>₪{price}</span>
        <span className="sc-unfiltered-rank sc-mono">{rank}</span>
      </div>
    </>
  );
}

export function Unfiltered(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stageIn = out(prog(t, 0, 0.5));
  const stageOut = 1 - accel(prog(t, D - 0.7, D - 0.12));
  const stage = Math.min(stageIn, stageOut);

  // Query text and selection
  const clearing = t >= CLEAR && t < T2;
  let query = '';
  if (t < CLEAR) query = typed(Q1, t, T1, CPS1);
  else if (t < T2) query = Q1;
  else query = typed(Q2, t, T2, CPS2);
  const selected = clearing && t > CLEAR + 0.08;
  const typing = (t >= T1 && t < SUBMIT1) || (t >= T2 && t < SUBMIT2);
  const showCaret = !selected && (typing || caretOn(t));
  const submitted = (t >= SUBMIT1 && t < CLEAR) || t >= SUBMIT2;
  const focusLine = Math.max(prog(t, SUBMIT1, SUBMIT1 + 0.2) * (1 - prog(t, CLEAR - 0.2, CLEAR)), prog(t, SUBMIT2, SUBMIT2 + 0.2));
  const load1 = prog(t, SUBMIT1, SUBMIT1 + 0.55);
  const load2 = prog(t, SUBMIT2, SUBMIT2 + 0.5);
  const loading = (load1 > 0 && load1 < 1) || (load2 > 0 && load2 < 1);
  const loadP = load2 > 0 ? load2 : load1;

  // Chips: four parsed constraints, then "cheaper" joins
  const chipsIn = (i: number) => spring(prog(t, SUBMIT1 + 0.35 + i * 0.07, SUBMIT1 + 0.95 + i * 0.07));
  const cheaperIn = spring(prog(t, SUBMIT2 + 0.2, SUBMIT2 + 0.85));

  // Re-rank + price drop
  const drop = out(prog(t, SUBMIT2 + 0.6, SUBMIT2 + 1.6));

  const tag = prog(t, TAG, TAG + 0.75);

  return (
    <div ref={ref} className="sc-root sc-unfiltered">
      <p className="sc-sr">
        Unfiltered: a shopper types “{Q1}”, the engine reads the constraints and shows ranked dresses; then “{Q2}” re-ranks them and the prices drop.
        p95 latency down about 70%.
      </p>
      <div className="sc-unfiltered-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-unfiltered-bar">
          <span className="sc-unfiltered-mark sc-mono">unfiltered</span>
        </div>

        <div
          className={'sc-unfiltered-field' + (submitted ? ' is-submitted' : '')}
          style={{ transform: `translateY(${(1 - stageIn) * 2}cqw)`, ['--sc-uf-focus' as string]: focusLine }}
        >
          <svg className="sc-unfiltered-glass" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5 L21 21" />
          </svg>
          <span className="sc-unfiltered-q">
            <span className={selected ? 'sc-unfiltered-sel' : undefined}>{query}</span>
            <span className="sc-unfiltered-caret" style={{ opacity: showCaret ? 1 : 0 }} />
          </span>
          <span className="sc-unfiltered-load" style={{ transform: `scaleX(${loadP})`, opacity: loading ? 1 : 0 }} />
        </div>

        <div className="sc-unfiltered-chips sc-mono">
          {CHIPS1.map((c, i) => {
            const k = chipsIn(i);
            return (
              <span key={c} className="sc-unfiltered-chip" style={{ opacity: Math.min(1, k * 1.4), transform: `scale(${0.7 + 0.3 * k})` }}>
                {c}
              </span>
            );
          })}
          <span
            className="sc-unfiltered-chip is-new"
            style={{ opacity: Math.min(1, cheaperIn * 1.4), transform: `scale(${0.7 + 0.3 * cheaperIn})` }}
          >
            cheaper
          </span>
        </div>

        <div className="sc-unfiltered-grid">
          {ITEMS.map((it, i) => {
            // first results: fan in, then step aside when the refinement lands
            const a = SUBMIT1 + 0.45 + i * 0.11;
            const fan = out(prog(t, a, a + 0.7));
            const exit = accel(prog(t, SUBMIT2 + 0.05 + i * 0.05, SUBMIT2 + 0.4 + i * 0.05));
            if (fan <= 0 || exit >= 1) return null;
            const rot = (1 - fan) * (-9 + i * 6);
            return (
              <div
                key={`a${i}`}
                className="sc-unfiltered-tile"
                style={{
                  left: `${i * 22.6}cqw`,
                  opacity: Math.min(1, fan * 1.6) * (1 - exit),
                  transform: `translate(${(1 - fan) * (1.5 - i) * 5}cqw, ${(1 - fan) * 9 + exit * 2}cqw) rotate(${rot}deg) scale(${(0.9 + 0.1 * fan) * (1 - 0.04 * exit)})`,
                }}
              >
                <Tile fill={it.fill} shape={it.shape} price={it.p1} rank={i + 1} />
              </div>
            );
          })}
          {ITEMS.map((it, i) => {
            // re-ranked, cheaper: each slot's price counts down from what was there before
            const s = it.rank2;
            const a = SUBMIT2 + 0.45 + s * 0.1;
            const k = out(prog(t, a, a + 0.6));
            if (k <= 0) return null;
            const before = ITEMS[s]!.p1;
            const price = Math.round(lerp(before, it.p2, drop));
            return (
              <div
                key={`b${i}`}
                className="sc-unfiltered-tile"
                style={{ left: `${s * 22.6}cqw`, opacity: k, transform: `translateY(${(1 - k) * -2.5}cqw) scale(${0.96 + 0.04 * k})` }}
              >
                <Tile fill={it.fill} shape={it.shape} price={price} rank={s + 1} low />
              </div>
            );
          })}
        </div>

        <div
          className="sc-unfiltered-tag sc-mono"
          style={{ opacity: Math.min(1, tag * 3), transform: `rotate(-4deg) scale(${lerp(1.5, 1, spring(tag))})` }}
        >
          p95 ↓70%
        </div>
      </div>
    </div>
  );
}

export default Unfiltered;
export const unfilteredMeta = { duration: D, keyTime: KEY } as const;
