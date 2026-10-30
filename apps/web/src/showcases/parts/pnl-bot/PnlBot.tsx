import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, useVariant, type Variant } from '../../lib/fit';
import { accel, inOut, out, prog } from '../../lib/ease';
import './pnl-bot.css';

const D = 10;
const KEY = 9;

/** Fictional positions. The card is the image the bot posts: one per token or NFT. */
const CARDS = [
  {
    asset: '$PEPE',
    chain: 'Ethereum',
    kind: 'coin' as const,
    rows: [
      { k: 'Total cost', v: 2400 },
      { k: 'Fees', v: 36 },
      { k: 'Realized profit', v: 3120, signed: true },
      { k: 'Unrealized profit', v: 1480, signed: true },
      { k: 'Current value', v: 3860 },
    ],
    roi: 190.2,
    total: 4564,
  },
  {
    asset: 'Pixel Fox #482',
    chain: 'Solana',
    kind: 'nft' as const,
    rows: [
      { k: 'Total cost', v: 5200 },
      { k: 'Fees', v: 260 },
      { k: 'Realized profit', v: -640, signed: true },
      { k: 'Unrealized profit', v: -310, signed: true },
      { k: 'Current value', v: 4250 },
    ],
    roi: -23.3,
    total: -1210,
  },
];
// the first card's frame is there from frame 1; its numbers count up right after
const CARD_IN = [0, 4.6];
const COUNT_LEN = 1.1;

/** `neg` is the sign of the final value, so a number counting up from zero already carries it. */
const money = (v: number, signed = false, neg = v < 0) => {
  const s = `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!signed) return s;
  return `${neg ? '−' : '+'}${s}`;
};
const pct = (v: number, neg = v < 0) => `${neg ? '−' : '+'}${Math.abs(v).toFixed(1)}%`;

const L: Record<Variant, { msgY: number; botY: number; cardY: number[]; cardH: number }> = {
  tall: { msgY: 5, botY: 18.5, cardY: [26, 61.5], cardH: 32.5 },
  wide: { msgY: 2.5, botY: 13, cardY: [20, 20], cardH: 39.5 },
};

function ChainMark({ chain }: { chain: string }) {
  // abstract marks, not logos
  if (chain === 'Ethereum')
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2 L16 10 L10 18 L4 10 Z M4 10 L10 12.6 L16 10" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 5 H16.5 L14.5 7.5 H3.5 Z M3.5 8.8 H14.5 L16.5 11.2 H5.5 Z M5.5 12.5 H16.5 L14.5 15 H3.5 Z" />
    </svg>
  );
}

function AssetMark({ kind }: { kind: 'coin' | 'nft' }) {
  if (kind === 'coin')
    return (
      <span className="sc-pnl-bot-coin" aria-hidden="true">
        P
      </span>
    );
  return (
    <span className="sc-pnl-bot-nft" aria-hidden="true">
      <svg viewBox="0 0 20 20">
        <path d="M4 15 L4 6 L7 3.5 L9 7 L11 7 L13 3.5 L16 6 L16 15 L10 17.5 Z" />
        <circle cx="7.6" cy="10.4" r="1.1" />
        <circle cx="12.4" cy="10.4" r="1.1" />
      </svg>
    </span>
  );
}

function Card({ c, t, at, member }: { c: (typeof CARDS)[number]; t: number; at: number; member: string }) {
  const n = (i: number) => out(prog(t, at + 0.4 + i * 0.12, at + 0.4 + i * 0.12 + COUNT_LEN));
  const up = c.roi >= 0;
  return (
    <div className={'sc-pnl-bot-card' + (up ? ' is-up' : ' is-down')}>
      <div className="sc-pnl-bot-side">
        <div className="sc-pnl-bot-asset">
          <AssetMark kind={c.kind} />
          <span className="sc-pnl-bot-asset-txt">
            <span className="sc-pnl-bot-asset-name">{c.asset}</span>
            <span className="sc-pnl-bot-chain sc-mono">
              <ChainMark chain={c.chain} /> {c.chain}
            </span>
          </span>
        </div>
        <div className="sc-pnl-bot-total">
          <span className="sc-pnl-bot-total-k sc-mono">total profit</span>
          <span className="sc-pnl-bot-total-v">{money(c.total * n(6), true, c.total < 0)}</span>
        </div>
        <div className="sc-pnl-bot-who">
          <span className="sc-pnl-bot-av is-user is-small" />
          <span>{member}</span>
        </div>
      </div>
      <div className="sc-pnl-bot-rows sc-mono">
        {c.rows.map((r, i) => {
          const val = r.v * n(i);
          return (
            <div key={r.k} className="sc-pnl-bot-row">
              <span className="sc-pnl-bot-k">{r.k}</span>
              <span className={'sc-pnl-bot-v' + (r.signed ? (r.v < 0 ? ' is-down' : ' is-up') : '')}>{money(val, r.signed, r.v < 0)}</span>
            </div>
          );
        })}
        <div className="sc-pnl-bot-row is-roi">
          <span className="sc-pnl-bot-k">ROI</span>
          <span className={'sc-pnl-bot-v ' + (up ? 'is-up' : 'is-down')}>{pct(c.roi * n(5), c.roi < 0)}</span>
        </div>
      </div>
    </div>
  );
}

export function PnlBot(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const lay = L[v];

  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - accel(prog(t, D - 0.5, D - 0.05)));

  return (
    <div ref={ref} className="sc-root sc-pnl-bot">
      <p className="sc-sr">
        Discord PnL bot: a member types /pnl and the bot replies with a profit card for $PEPE on Ethereum: total cost, fees, realized and
        unrealized profit, current value and ROI, plus 190 percent. Then a second card for an NFT on Solana, down 23 percent.
      </p>
      <Fit v={v} style={{ opacity: stage }}>
        {/* the /pnl message and the bot's reply are on screen from frame 1 */}
        <div aria-hidden="true">
          <div className="sc-pnl-bot-msg" style={{ top: `${lay.msgY}cqw` }}>
            <span className="sc-pnl-bot-av is-user" />
            <span className="sc-pnl-bot-lines">
              <span className="sc-pnl-bot-name">
                dana <span className="sc-mono sc-pnl-bot-time">today</span>
              </span>
              <span className="sc-mono sc-pnl-bot-cmd">/pnl</span>
            </span>
          </div>
          <div className="sc-pnl-bot-msg is-bot" style={{ top: `${lay.botY}cqw` }}>
            <span className="sc-pnl-bot-av is-bot">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 15 V9 M8.5 15 V5 M13 15 V11 M16.5 15 V7" />
              </svg>
            </span>
            <span className="sc-pnl-bot-name">
              PnL bot <span className="sc-mono sc-pnl-bot-tag">BOT</span>
            </span>
          </div>

          {CARDS.map((c, i) => {
            const at = CARD_IN[i]!;
            const k = i === 0 ? 1 : inOut(prog(t, at, at + 0.55));
            if (k <= 0) return null;
            // the phone has room for one card: the first slides away, then the second slides in (never both at once)
            const leave = v === 'wide' && i === 0 ? inOut(prog(t, CARD_IN[1]! - 0.5, CARD_IN[1]! - 0.05)) : 0;
            if (leave >= 1) return null;
            const fromX = v === 'wide' && i === 1 ? 30 : 0;
            const fromY = v === 'wide' && i === 1 ? 0 : 3;
            return (
              <div
                key={c.asset}
                className="sc-pnl-bot-slot"
                style={{
                  top: `${lay.cardY[i]}cqw`,
                  height: `${lay.cardH}cqw`,
                  opacity: k * (1 - leave),
                  transform: `translate(${(1 - k) * fromX - leave * 30}cqw, ${(1 - k) * fromY}cqw)`,
                }}
              >
                <Card c={c} t={t} at={at} member="dana" />
              </div>
            );
          })}
        </div>
      </Fit>
    </div>
  );
}

export default PnlBot;
export const pnlBotMeta = { duration: D, keyTime: KEY } as const;
