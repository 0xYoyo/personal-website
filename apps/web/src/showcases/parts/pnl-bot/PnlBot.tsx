import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, out, prog, spring } from '../../lib/ease';
import './pnl-bot.css';

const D = 10;
const KEY = 8.0;

/** Illustrative numbers — the layout of a real report: per-wallet realized and unrealized, across chains. */
const WALLETS = [
  { chain: 'EVM', addr: '0x8f3…a91c', realized: 1240, unrealized: 310 },
  { chain: 'SOL', addr: '7Gk2…mPq4', realized: 420, unrealized: -180 },
  { chain: 'BTC', addr: 'bc1q…7xkd', realized: 180, unrealized: 482 },
] as const;
const MAX = 1300;
const fmt = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

function ChainMark({ chain }: { chain: string }) {
  // abstract marks, not logos
  if (chain === 'EVM')
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2 L16 10 L10 18 L4 10 Z M4 10 L10 12.6 L16 10" />
      </svg>
    );
  if (chain === 'SOL')
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 5 H16.5 L14.5 7.5 H3.5 Z M3.5 8.8 H14.5 L16.5 11.2 H5.5 Z M5.5 12.5 H16.5 L14.5 15 H3.5 Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M8 6 V14 M8 6 H11.3 Q13.3 6 13.3 8 Q13.3 10 11.3 10 H8 M8 10 H11.8 Q13.8 10 13.8 12 Q13.8 14 11.8 14 H8 M9.6 4.6 V6 M9.6 14 V15.4" />
    </svg>
  );
}

export function PnlBot(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const user = out(prog(t, 0.25, 0.7));
  const bot = out(prog(t, 0.95, 1.35));
  const typing = t >= 1.0 && t < 1.55;
  const embed = out(prog(t, 1.45, 2.0));
  const bar = out(prog(t, 1.45, 2.2));
  const rows = (i: number) => out(prog(t, 1.95 + i * 0.16, 2.55 + i * 0.16));
  const rise = (i: number, j: number) => spring(prog(t, 2.8 + i * 0.22 + j * 0.1, 3.75 + i * 0.22 + j * 0.1), 6.5, 9);
  const totals = out(prog(t, 4.5, 5.6));
  const totalsIn = out(prog(t, 4.4, 4.8));
  const legend = out(prog(t, 4.4, 4.8));

  const rTotal = WALLETS.reduce((s, w) => s + w.realized, 0);
  const uTotal = WALLETS.reduce((s, w) => s + w.unrealized, 0);

  return (
    <div ref={ref} className="sc-root sc-pnl-bot">
      <p className="sc-sr">
        Discord PnL bot: a member types /pnl and the bot assembles a report — wallets on EVM chains, Solana and Bitcoin, with realized and
        unrealized profit and loss as bars and totals.
      </p>
      <div className="sc-pnl-bot-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-pnl-bot-msg" style={{ opacity: user, transform: `translateY(${(1 - user) * 1.5}cqw)` }}>
          <span className="sc-pnl-bot-av is-user" />
          <span className="sc-pnl-bot-name">member</span>
          <span className="sc-mono sc-pnl-bot-cmd">/pnl</span>
        </div>
        <div className="sc-pnl-bot-msg is-bot" style={{ opacity: bot, transform: `translateY(${(1 - bot) * 1.5}cqw)` }}>
          <span className="sc-pnl-bot-av is-bot">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 15 V9 M8.5 15 V5 M13 15 V11 M16.5 15 V7" />
            </svg>
          </span>
          <span className="sc-pnl-bot-name">PnL bot</span>
          <span className="sc-mono sc-pnl-bot-tag">bot</span>
          {typing && (
            <span className="sc-pnl-bot-typing">
              {[0, 1, 2].map((d) => (
                <i key={d} style={{ opacity: 0.3 + 0.7 * Math.max(0, Math.sin((t * 7 - d) * 1.3)) }} />
              ))}
            </span>
          )}
        </div>

        <div className="sc-pnl-bot-embed" style={{ opacity: embed }}>
          <span className="sc-pnl-bot-bar" style={{ transform: `scaleY(${bar})` }} />
          <div className="sc-pnl-bot-title">P&amp;L report</div>
          <div className="sc-pnl-bot-wallets">
            {WALLETS.map((w, i) => {
              const k = rows(i);
              return (
                <div key={w.chain} className="sc-pnl-bot-row" style={{ opacity: k, transform: `translateX(${(1 - k) * -2}cqw)` }}>
                  <span className="sc-pnl-bot-chain">
                    <ChainMark chain={w.chain} />
                    <span className="sc-mono">{w.chain}</span>
                  </span>
                  <span className="sc-mono sc-pnl-bot-addr">{w.addr}</span>
                </div>
              );
            })}
          </div>

          <div className="sc-pnl-bot-chart">
            <span className="sc-pnl-bot-zero" />
            {WALLETS.map((w, i) => (
              <div key={w.chain} className="sc-pnl-bot-group" style={{ left: `${i * 33.3}%` }}>
                {[w.realized, w.unrealized].map((v, j) => {
                  const k = rise(i, j);
                  const h = (Math.abs(v) / MAX) * 100 * k;
                  return (
                    <span
                      key={j}
                      className={'sc-pnl-bot-col' + (j === 0 ? ' is-realized' : ' is-unrealized') + (v < 0 ? ' is-neg' : '')}
                      style={{ height: `${h * 0.72}%`, left: `${18 + j * 34}%` }}
                    />
                  );
                })}
                <span className="sc-mono sc-pnl-bot-lab">{w.chain}</span>
              </div>
            ))}
          </div>

          <div className="sc-pnl-bot-totals" style={{ opacity: totalsIn }}>
            <span className="sc-pnl-bot-total">
              <span className="sc-pnl-bot-key" style={{ opacity: legend }}>
                <i className="is-realized" /> realized
              </span>
              <span className="sc-mono sc-pnl-bot-num">{fmt(rTotal * totals)}</span>
            </span>
            <span className="sc-pnl-bot-total">
              <span className="sc-pnl-bot-key" style={{ opacity: legend }}>
                <i className="is-unrealized" /> unrealized
              </span>
              <span className="sc-mono sc-pnl-bot-num">{fmt(uTotal * totals)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PnlBot;
export const pnlBotMeta = { duration: D, keyTime: KEY } as const;
