import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { CANVAS_H, Fit, useVariant, type Variant } from '../../lib/fit';
import { accel, lerp, out, prog, spring } from '../../lib/ease';
import './sentiment-gauge.css';

const D = 11;
const KEY = 10;

type Mood = 'bullish' | 'bearish' | 'neutral';
/** Fictional posts about a fictional project, $ORBIT. `score` is where the needle goes after each one. */
const POSTS: { who: string; text: string; mood: Mood; hue: string; score: number }[] = [
  { who: 'lunawhale', text: 'mainnet looks clean', mood: 'bullish', hue: '#7c9cff', score: 0.7 },
  { who: '0xkai', text: 'fees are way too high', mood: 'bearish', hue: '#f2a65a', score: 0.52 },
  { who: 'mira_eth', text: 'team shipped again', mood: 'bullish', hue: '#c58cf2', score: 0.6 },
  { who: 'degen_dan', text: 'when is the unlock?', mood: 'neutral', hue: '#6fcfb7', score: 0.57 },
  { who: 'sol_sam', text: 'bought more $ORBIT', mood: 'bullish', hue: '#f27a9b', score: 0.61 },
  { who: 'noa.eth', text: 'roadmap finally clicks', mood: 'bullish', hue: '#e6d06a', score: 0.62 },
];
const POST_AT = (p: number) => 0.6 + p * 0.85;
const TREND = [0.48, 0.51, 0.47, 0.55, 0.58, 0.6, 0.62];
const TREND_AT = POST_AT(POSTS.length - 1) + 0.8;

const L: Record<Variant, {
  headY: number; feedX: number; feedW: number; feedY: number; rowH: number; rowGap: number; rows: number;
  gx: number; gy: number; gr: number; scoreY: number; trendY: number; trendH: number; trendX: number; trendW: number;
}> = {
  tall: { headY: 6, feedX: 5, feedW: 52, feedY: 16, rowH: 12, rowGap: 2.2, rows: 5, gx: 78, gy: 36, gr: 15, scoreY: 40, trendX: 61, trendW: 34, trendY: 64, trendH: 18 },
  wide: { headY: 3, feedX: 4, feedW: 53, feedY: 10.5, rowH: 10, rowGap: 2, rows: 4, gx: 78.5, gy: 24.5, gr: 13.5, scoreY: 27.5, trendX: 62, trendW: 33, trendY: 45, trendH: 12 },
};

const moodOf = (s: number): Mood => (s >= 0.58 ? 'bullish' : s <= 0.42 ? 'bearish' : 'neutral');

/** A point on the gauge's arc: score 0 is the far left, 1 the far right. */
const arcPt = (cx: number, cy: number, r: number, s: number) => {
  const a = Math.PI * (1 - s);
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
};
const arc = (cx: number, cy: number, r: number, s0: number, s1: number) => {
  const p0 = arcPt(cx, cy, r, s0);
  const p1 = arcPt(cx, cy, r, s1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
};

export function SentimentGauge(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const lay = L[v];
  const h = CANVAS_H[v];

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const gaugeIn = out(prog(t, 0.15, 0.7));

  // the needle: from the middle, a spring to each post's new score
  let score = 0.5;
  for (let p = 0; p < POSTS.length; p++) {
    const k = spring(prog(t, POST_AT(p) + 0.15, POST_AT(p) + 1.0), 6, 9);
    if (k > 0) score = lerp(score, POSTS[p]!.score, k);
  }
  const arrived = POSTS.filter((_, p) => t >= POST_AT(p)).length;
  const mood = moodOf(score);

  const needle = arcPt(lay.gx, lay.gy, lay.gr * 0.78, score);
  const trendK = out(prog(t, TREND_AT, TREND_AT + 1.2));
  const tx = (i: number) => lay.trendX + (i / (TREND.length - 1)) * lay.trendW;
  const ty = (val: number) => lay.trendY + lay.trendH - ((val - 0.42) / 0.24) * lay.trendH;
  const trendPts = TREND.map((val, i) => `${tx(i).toFixed(2)},${ty(val).toFixed(2)}`).join(' ');
  const trendLen = TREND.reduce((s, val, i) => (i ? s + Math.hypot(tx(i) - tx(i - 1), ty(val) - ty(TREND[i - 1]!)) : 0), 0);

  return (
    <div ref={ref} className="sc-root sc-sentiment-gauge">
      <p className="sc-sr">
        Crypto Sentiment Gauge: posts about a project, $ORBIT, stream in from X, each tagged bullish, bearish or neutral. A gauge needle settles
        at 0.62, bullish, and a 7-day trend line draws in.
      </p>
      <Fit v={v} style={{ opacity: stage }}>
        <div aria-hidden="true">
          <div className="sc-sg-head" style={{ top: `${lay.headY}cqw`, left: `${lay.feedX}cqw`, opacity: gaugeIn }}>
            <span className="sc-sg-token">$ORBIT</span>
            <span className="sc-mono sc-sg-sub">mood on X</span>
          </div>

          {POSTS.map((p, i) => {
            const at = POST_AT(i);
            if (t < at) return null;
            const k = out(prog(t, at, at + 0.45));
            // newest on top: each later post pushes this one a slot down
            let slot = 0;
            for (let j = i + 1; j < POSTS.length; j++) slot += out(prog(t, POST_AT(j), POST_AT(j) + 0.45));
            const gone = Math.min(1, Math.max(0, slot - (lay.rows - 1)));
            if (gone >= 1) return null;
            const y = lay.feedY + slot * (lay.rowH + lay.rowGap);
            return (
              <div
                key={p.who}
                className="sc-sg-post"
                style={{
                  left: `${lay.feedX}cqw`,
                  width: `${lay.feedW}cqw`,
                  top: `${y}cqw`,
                  height: `${lay.rowH}cqw`,
                  opacity: k * (1 - gone),
                  transform: `translateX(${(1 - k) * -3}cqw)`,
                }}
              >
                <span className="sc-sg-av" style={{ background: p.hue }}>
                  {p.who.replace(/[^a-z]/g, '')[0]!.toUpperCase()}
                </span>
                <span className="sc-sg-body">
                  <span className="sc-mono sc-sg-who">@{p.who}</span>
                  <span className="sc-sg-text">{p.text}</span>
                </span>
                <span className={`sc-mono sc-sg-tag is-${p.mood}`}>{p.mood}</span>
              </div>
            );
          })}

          <svg className="sc-sg-svg" viewBox={`0 0 100 ${h}`} style={{ opacity: gaugeIn }}>
            <path d={arc(lay.gx, lay.gy, lay.gr, 0, 0.42)} className="sc-sg-band is-bearish" />
            <path d={arc(lay.gx, lay.gy, lay.gr, 0.435, 0.565)} className="sc-sg-band is-neutral" />
            <path d={arc(lay.gx, lay.gy, lay.gr, 0.58, 1)} className="sc-sg-band is-bullish" />
            <line x1={lay.gx} y1={lay.gy} x2={needle.x} y2={needle.y} className="sc-sg-needle" />
            <circle cx={lay.gx} cy={lay.gy} r={1.3} className="sc-sg-hub" />

            <line x1={lay.trendX} x2={lay.trendX + lay.trendW} y1={lay.trendY + lay.trendH} y2={lay.trendY + lay.trendH} className="sc-sg-base" />
            {trendK > 0 && (
              <>
                <polyline
                  points={trendPts}
                  className="sc-sg-trend"
                  style={{ strokeDasharray: trendLen, strokeDashoffset: trendLen * (1 - trendK) }}
                />
                {trendK >= 1 && <circle cx={tx(TREND.length - 1)} cy={ty(TREND[TREND.length - 1]!)} r={0.9} className="sc-sg-dot" />}
              </>
            )}
          </svg>

          <div className="sc-sg-score" style={{ left: `${lay.gx}cqw`, top: `${lay.scoreY}cqw`, opacity: gaugeIn }}>
            <span className="sc-sg-num">{score.toFixed(2)}</span>
            <span className={`sc-mono sc-sg-tag is-${mood}`}>{arrived ? mood : 'reading'}</span>
          </div>
          <span
            className="sc-mono sc-sg-trend-label"
            style={{ left: `${lay.trendX}cqw`, top: `${lay.trendY - (v === 'tall' ? 4 : 3.6)}cqw`, opacity: out(prog(t, TREND_AT - 0.2, TREND_AT + 0.3)) }}
          >
            last 7 days
          </span>
        </div>
      </Fit>
    </div>
  );
}

export default SentimentGauge;
export const sentimentGaugeMeta = { duration: D, keyTime: KEY } as const;
