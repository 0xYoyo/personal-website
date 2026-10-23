import { useRef } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { accel, inOut, lerp, out, prog, typed } from '../../lib/ease';
import './runi-connector.css';

const D = 11;
const KEY = 8.9;
const ASK1 = "what's due this week?";
const ASK2 = "download this week's slides";

/** Illustrative rows (sample course names), the shape of a real answer. */
const DUE = [
  { day: 'Sun', what: 'Data Structures', item: 'problem set 4' },
  { day: 'Tue', what: 'Digital Systems', item: 'project 5' },
  { day: 'Thu', what: 'Probability', item: 'quiz 2' },
] as const;
const FILES = ['lecture 5', 'recitation 5', 'lecture 6'] as const;
const SOURCES = [
  { name: 'Moodle', y: 12 },
  { name: 'Panopto', y: 24.5 },
  { name: 'Piazza', y: 37 },
] as const;
const PULL = [1.7, 2.05, 2.4];
const FOLDER = { x: 82.5, y: 52 };

function SourceMark({ i }: { i: number }) {
  if (i === 0)
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3.5" width="14" height="17" rx="2" />
        <path d="M8.5 9 H15.5 M8.5 12.5 H15.5 M8.5 16 H12.5" />
      </svg>
    );
  if (i === 1)
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path className="is-fill" d="M10 9 L15 12 L10 15 Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5 H20 V16 H11 L7 19.5 V16 H4 Z" />
      <path d="M8 9.5 H16 M8 12.5 H13" />
    </svg>
  );
}

export function RuniConnector(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLoop(ref, D, KEY, props);

  const stage = Math.min(out(prog(t, 0, 0.4)), 1 - accel(prog(t, D - 0.6, D - 0.1)));
  const b1 = out(prog(t, 0.35, 0.8));
  const q1 = typed(ASK1, t, 0.4, 34);
  const status = out(prog(t, 1.45, 1.8)) * (1 - prog(t, 3.1, 3.35));
  const ans = (i: number) => out(prog(t, 3.2 + i * 0.16, 3.8 + i * 0.16));
  const b2 = out(prog(t, 5.15, 5.55));
  const q2 = typed(ASK2, t, 5.2, 38);
  const scroll = inOut(prog(t, 5.0, 5.6));
  const filesIn = (i: number) => out(prog(t, 6.0 + i * 0.12, 6.5 + i * 0.12));
  const flyStart = (i: number) => 6.85 + i * 0.22;
  const landed = FILES.filter((_, i) => t >= flyStart(i) + 0.62).length;
  const bump = Math.max(...FILES.map((_, i) => { const k = prog(t, flyStart(i) + 0.62, flyStart(i) + 1.0); return k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0; }));
  const saved = out(prog(t, 7.95, 8.4));
  const folderIn = out(prog(t, 5.9, 6.4));

  return (
    <div ref={ref} className="sc-root sc-runi-connector">
      <p className="sc-sr">
        Reichman Courses connector: a student asks “{ASK1}”, the connector reads Moodle, Panopto and Piazza and answers with a short list;
        then “{ASK2}” saves the files into a folder.
      </p>
      <div className="sc-runi-connector-stage" style={{ opacity: stage }} aria-hidden="true">
        <div className="sc-runi-connector-chat">
          <div className="sc-runi-connector-flow" style={{ transform: `translateY(${-scroll * 11}cqw)` }}>
            <div className="sc-runi-connector-me" style={{ opacity: b1, transform: `translateY(${(1 - b1) * 2}cqw)` }}>
              {q1 || ' '}
            </div>
            <div className="sc-runi-connector-status sc-mono" style={{ opacity: status }}>
              reading Moodle, Panopto, Piazza
              <span className="sc-runi-connector-dots">
                {[0, 1, 2].map((d) => (
                  <i key={d} style={{ opacity: 0.3 + 0.7 * Math.max(0, Math.sin((t * 6 - d) * 1.2)) }} />
                ))}
              </span>
            </div>
            <div className="sc-runi-connector-answer">
              <div className="sc-runi-connector-lead" style={{ opacity: ans(0) }}>
                Three things this week:
              </div>
              {DUE.map((r, i) => (
                <div
                  key={r.what}
                  className="sc-runi-connector-row"
                  style={{ opacity: ans(i + 1), transform: `translateY(${(1 - ans(i + 1)) * 1.6}cqw)` }}
                >
                  <span className="sc-mono sc-runi-connector-day">{r.day}</span>
                  <span className="sc-runi-connector-what">{r.what}</span>
                  <span className="sc-runi-connector-item">{r.item}</span>
                </div>
              ))}
            </div>
            <div className="sc-runi-connector-me" style={{ opacity: b2, transform: `translateY(${(1 - b2) * 2}cqw)` }}>
              {q2 || ' '}
            </div>
            <div className="sc-runi-connector-files">
              {FILES.map((f, i) => {
                const k = filesIn(i);
                const fly = prog(t, flyStart(i), flyStart(i) + 0.62);
                return (
                  <span
                    key={f}
                    className="sc-runi-connector-file"
                    style={{ opacity: fly > 0 ? 0.28 : k, transform: `scale(${0.85 + 0.15 * k})` }}
                  >
                    {f}
                  </span>
                );
              })}
            </div>
            <div className="sc-runi-connector-saved sc-mono" style={{ opacity: saved }}>
              saved {landed} files to Week 5
            </div>
          </div>
        </div>

        <svg className="sc-runi-connector-wires" viewBox="0 0 100 62.5" preserveAspectRatio="none">
          {SOURCES.map((s, i) => {
            const lit = prog(t, PULL[i]!, PULL[i]! + 0.3) * (1 - prog(t, 3.2, 3.6));
            return (
              <path
                key={s.name}
                d={`M 74 ${s.y + 4} C 69 ${s.y + 4}, 69 24.5, 64.6 24.5`}
                className="sc-runi-connector-wire"
                style={{ opacity: 0.45 + 0.55 * lit, stroke: lit > 0.02 ? 'var(--sc-accent)' : undefined }}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {SOURCES.map((s, i) => {
          // a packet travels from each source into the chat
          const k = prog(t, PULL[i]! + 0.15, PULL[i]! + 0.75);
          if (k <= 0 || k >= 1) return null;
          const e = inOut(k);
          const x = lerp(74, 64.6, e);
          const y = lerp(s.y + 4, 24.5, e * e * (3 - 2 * e));
          return <span key={`p${i}`} className="sc-runi-connector-packet" style={{ left: `${x}cqw`, top: `${y}cqw` }} />;
        })}
        {SOURCES.map((s, i) => {
          const k = out(prog(t, 0.6 + i * 0.12, 1.1 + i * 0.12));
          const lit = prog(t, PULL[i]!, PULL[i]! + 0.25) * (1 - prog(t, 3.2, 3.6));
          return (
            <div
              key={s.name}
              className={'sc-runi-connector-src' + (lit > 0.5 ? ' is-lit' : '')}
              style={{ top: `${s.y}cqw`, opacity: k, transform: `translateX(${(1 - k) * 2}cqw)` }}
            >
              <SourceMark i={i} />
              <span className="sc-mono">{s.name}</span>
            </div>
          );
        })}

        <div
          className="sc-runi-connector-folder"
          style={{ left: `${FOLDER.x}cqw`, top: `${FOLDER.y}cqw`, opacity: folderIn, transform: `translate(-50%,-50%) scale(${1 + 0.12 * bump})` }}
        >
          <svg viewBox="0 0 32 26" aria-hidden="true">
            <path d="M1.5 4 Q1.5 2 3.5 2 H11 L14 5 H28.5 Q30.5 5 30.5 7 V22 Q30.5 24 28.5 24 H3.5 Q1.5 24 1.5 22 Z" />
          </svg>
          <span className="sc-mono">{landed > 0 ? `${landed}` : ''}</span>
        </div>
        {FILES.map((f, i) => {
          const k = prog(t, flyStart(i), flyStart(i) + 0.62);
          if (k <= 0 || k >= 1) return null;
          const e = inOut(k);
          // start: the file chip in the chat (after the scroll); end: the folder
          const sx = [14.5, 30.5, 46.5][i]!;
          const sy = 44.2;
          const x = lerp(sx, FOLDER.x, e);
          const y = lerp(sy, FOLDER.y, e) - Math.sin(e * Math.PI) * 9;
          return (
            <span
              key={`fly-${f}`}
              className="sc-runi-connector-flyer"
              style={{ left: `${x}cqw`, top: `${y}cqw`, transform: `translate(-50%,-50%) rotate(${e * 18 - 9}deg) scale(${1 - 0.45 * e})` }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default RuniConnector;
export const runiConnectorMeta = { duration: D, keyTime: KEY } as const;
