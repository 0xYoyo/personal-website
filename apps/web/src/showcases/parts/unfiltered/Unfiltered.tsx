import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant, type Variant } from '../../lib/fit';
import { accel, caretOn, inOut, lerp, out, prog, spring, typed } from '../../lib/ease';
import './unfiltered.css';

const D = 12;
const KEY = 11;
const Q1 = 'elegant summer wedding dress, not black, under ₪400';
const Q2 = 'same but cheaper';
const T1 = 0.5;
const CPS1 = 22;
const SUBMIT1 = T1 + Array.from(Q1).length / CPS1 + 0.14;
const PILL0 = SUBMIT1 + 0.15;
const PILL_STEP = 0.28;
const RES0 = PILL0 + 4 * PILL_STEP + 0.1;
const CLEAR = 7.0;
const T2 = 7.3;
const CPS2 = 20;
const SUBMIT2 = T2 + Q2.length / CPS2 + 0.15;
const MOVE = SUBMIT2 + 0.3;

/** What the engine understood from the sentence. The last one becomes "cheaper" on the follow-up. */
const PILLS = ['wedding', 'summer', 'not black', 'under ₪400'];

/** Illustrative catalogue. A: the first answer, in rank order. B: "same but cheaper", cheapest first. */
const ITEMS = [
  { name: 'Linen', fill: '#E8DFCC', shape: 0, price: 389 },
  { name: 'Silk slip', fill: '#D8B1A4', shape: 2, price: 372 },
  { name: 'Tulle', fill: '#AFC0D4', shape: 1, price: 365 },
  { name: 'Wrap', fill: '#AEB79E', shape: 3, price: 349 },
  { name: 'Satin', fill: '#E6C29A', shape: 0, price: 338 },
  { name: 'Lace', fill: '#EDE6DA', shape: 1, price: 329 },
  { name: 'Chiffon', fill: '#C9A9C9', shape: 2, price: 318 },
  { name: 'Floral', fill: '#F0D27A', shape: 3, price: 299 },
  { name: 'Cotton', fill: '#BFD8C8', shape: 1, price: 189 },
  { name: 'Eyelet', fill: '#F3CDBE', shape: 0, price: 214 },
  { name: 'Crepe', fill: '#9FB4C9', shape: 2, price: 239 },
] as const;
const A = [0, 1, 2, 3, 4, 5, 6, 7];
const B = [8, 9, 10, 7, 6, 5, 4, 3];

const DRESS = [
  // slip dress, A-line
  'M15 4 L17 4 L18.5 13 Q20 14.2 21.5 13 L23 4 L25 4 L25.4 15 Q26 19 25 22 L33 52 Q20 55.5 7 52 L15 22 Q14 19 14.6 15 Z',
  // off-shoulder, full skirt
  'M10 11 Q20 8.5 30 11 L28 16 Q27.2 20 26 23 Q34 40 37 52 Q20 56 3 52 Q6 40 14 23 Q12.8 20 12 16 Z',
  // wrap, mermaid hem
  'M14.5 5 L16.5 5 Q20 13 23.5 5 L25.5 5 Q27 12 25.6 18 Q25 23 26 30 Q27 42 33 52 Q20 55 7 52 Q13 42 14 30 Q15 23 14.4 18 Q13 12 14.5 5 Z',
  // short sleeves, knee length
  'M13 6 L17 5 Q20 8 23 5 L27 6 L31 12 L27.5 14.5 L26 12.5 L25.5 20 L30 40 Q20 43 10 40 L14.5 20 L14 12.5 L12.5 14.5 L9 12 Z',
];

/** Layout per composition, in canvas units. */
const L: Record<Variant, { fieldTop: number; fieldH: number; pillsTop: number; gridTop: number; tileH: number; gapY: number }> = {
  tall: { fieldTop: 10.5, fieldH: 9.4, pillsTop: 23.2, gridTop: 32.4, tileH: 29, gapY: 2.6 },
  wide: { fieldTop: 3, fieldH: 8.4, pillsTop: 14, gridTop: 22, tileH: 18.2, gapY: 2.2 },
};
const TILE_W = 20.2;
const GAP_X = 2.4;
const slotXY = (v: Variant, slot: number) => ({
  x: 6 + (slot % 4) * (TILE_W + GAP_X),
  y: L[v].gridTop + Math.floor(slot / 4) * (L[v].tileH + L[v].gapY),
});

function Tile({ i }: { i: number }) {
  const it = ITEMS[i]!;
  return (
    <>
      <div className="sc-unfiltered-img">
        <svg viewBox="0 0 40 56" aria-hidden="true">
          <path d={DRESS[it.shape]} fill={it.fill} />
        </svg>
      </div>
      <div className="sc-unfiltered-meta">
        <span className="sc-unfiltered-name">{it.name}</span>
        <span className="sc-unfiltered-price sc-mono">₪{it.price}</span>
      </div>
    </>
  );
}

export function Unfiltered(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const lay = L[v];

  const stageIn = out(prog(t, 0, 0.4));
  const stage = Math.min(stageIn, 1 - accel(prog(t, D - 0.6, D - 0.1)));

  // the query
  const selected = t >= CLEAR + 0.05 && t < T2;
  const query = t < CLEAR ? typed(Q1, t, T1, CPS1) : t < T2 ? Q1 : typed(Q2, t, T2, CPS2);
  const typing = (t >= T1 && t < SUBMIT1) || (t >= T2 && t < SUBMIT2);
  const showCaret = !selected && (typing || caretOn(t));
  const focus = Math.max(prog(t, SUBMIT1, SUBMIT1 + 0.2) * (1 - prog(t, CLEAR - 0.2, CLEAR)), prog(t, SUBMIT2, SUBMIT2 + 0.2));
  const load1 = prog(t, SUBMIT1, SUBMIT1 + 0.5);
  const load2 = prog(t, SUBMIT2, SUBMIT2 + 0.4);
  const loadP = t >= SUBMIT2 ? load2 : load1;
  const loading = loadP > 0 && loadP < 1;

  // what it understood
  const pillK = (i: number) => spring(prog(t, PILL0 + i * PILL_STEP, PILL0 + i * PILL_STEP + 0.5));
  const labelK = out(prog(t, PILL0 - 0.1, PILL0 + 0.3));
  const cheaper = out(prog(t, SUBMIT2 + 0.1, SUBMIT2 + 0.45));

  // the grid: A fades in ranked; on the follow-up the expensive ones leave, the rest slide to their
  // new slots (cheapest first) and the cheaper newcomers drop into place
  const tiles: JSX.Element[] = [];
  const ids = new Set([...A, ...B]);
  for (const id of ids) {
    const a = A.indexOf(id);
    const b = B.indexOf(id);
    let x = 0;
    let y = 0;
    let op = 0;
    let lift = 0;
    let scale = 1;
    if (a >= 0) {
      const inK = out(prog(t, RES0 + a * 0.09, RES0 + a * 0.09 + 0.45));
      const pa = slotXY(v, a);
      x = pa.x;
      y = pa.y;
      op = inK;
      lift = (1 - inK) * 2.5;
      if (b < 0) {
        const ex = accel(prog(t, SUBMIT2 + 0.05 + a * 0.05, SUBMIT2 + 0.4 + a * 0.05));
        op *= 1 - ex;
        scale = 1 - 0.08 * ex;
      } else {
        const pb = slotXY(v, b);
        const m = inOut(prog(t, MOVE + b * 0.04, MOVE + b * 0.04 + 0.75));
        x = lerp(pa.x, pb.x, m);
        y = lerp(pa.y, pb.y, m);
        lift -= Math.sin(m * Math.PI) * 0.8;
      }
    } else {
      const k = out(prog(t, MOVE + 0.85 + b * 0.08, MOVE + 1.3 + b * 0.08));
      const pb = slotXY(v, b);
      x = pb.x;
      y = pb.y;
      op = k;
      lift = (1 - k) * -3;
      scale = 0.94 + 0.06 * k;
    }
    if (op <= 0.001) continue;
    const isNew = a < 0;
    tiles.push(
      <div
        key={id}
        className={'sc-unfiltered-tile' + (isNew ? ' is-new' : '')}
        style={{
          left: `${x}cqw`,
          top: `${y}cqw`,
          height: `${lay.tileH}cqw`,
          opacity: op,
          transform: `translateY(${lift}cqw) scale(${scale})`,
          zIndex: b >= 0 && a >= 0 ? 2 : 1,
        }}
      >
        <Tile i={id} />
      </div>,
    );
  }

  return (
    <div ref={ref} className="sc-root sc-unfiltered">
      <p className="sc-sr">
        Unfiltered: a shopper types “{Q1}”. The search understands wedding, summer, not black and under ₪400, and shows eight matching
        dresses. Then “{Q2}” re-sorts them, cheapest first.
      </p>
      <Fit v={v} className="sc-unfiltered-stage" style={{ opacity: stage }}>
        <div aria-hidden="true">
          {v === 'tall' && <span className="sc-unfiltered-mark sc-mono">unfiltered</span>}
          <div
            className="sc-unfiltered-field"
            style={{
              top: `${lay.fieldTop}cqw`,
              height: `${lay.fieldH}cqw`,
              transform: `translateY(${(1 - stageIn) * 2}cqw)`,
              ['--sc-uf-focus' as string]: focus,
            }}
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

          <div className="sc-unfiltered-pills sc-mono" style={{ top: `${lay.pillsTop}cqw` }}>
            <span className="sc-unfiltered-understood" style={{ opacity: labelK }}>
              understood
            </span>
            {PILLS.map((p, i) => {
              const k = pillK(i);
              const last = i === PILLS.length - 1;
              return (
                <span
                  key={p}
                  className={'sc-unfiltered-pill' + (last && cheaper > 0.5 ? ' is-new' : '')}
                  style={{ opacity: Math.min(1, k * 1.4), transform: `scale(${0.7 + 0.3 * k})` }}
                >
                  {last && cheaper > 0 ? (
                    <span className="sc-unfiltered-swap">
                      <span style={{ opacity: 1 - cheaper }}>{p}</span>
                      <span className="sc-unfiltered-swap-to" style={{ opacity: cheaper }}>
                        cheaper
                      </span>
                    </span>
                  ) : (
                    p
                  )}
                </span>
              );
            })}
          </div>

          {tiles}
        </div>
      </Fit>
    </div>
  );
}

export default Unfiltered;
export const unfilteredMeta = { duration: D, keyTime: KEY } as const;
