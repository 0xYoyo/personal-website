import { useLayoutEffect, useRef, useState } from 'react';
import { useLoop, type ShowcaseProps } from '../../lib/clock';
import { Fit, offsetIn, useVariant } from '../../lib/fit';
import { accel, inOut, lerp, out, prog, typed } from '../../lib/ease';
import './runi-connector.css';

const D = 10;
const KEY = 9.3;
const ASK1 = "what's due this week?";
const ASK2 = "download this week's slides";

/** Illustrative rows (sample course names), the shape of a real answer. */
const DUE = [
  { day: 'Sun', what: 'Data Structures', item: 'problem set 4' },
  { day: 'Tue', what: 'Digital Systems', item: 'project 5' },
  { day: 'Thu', what: 'Probability', item: 'quiz 2' },
] as const;
const FILES = ['lecture 5', 'recitation 5', 'lecture 6'] as const;
/** What each source is, in plain words, with the product's name small beneath. */
const SOURCES = [
  { label: 'Courses', brand: 'Moodle' },
  { label: 'Lectures', brand: 'Panopto' },
  { label: 'Q&A forum', brand: 'Piazza' },
] as const;
// frame 1 already shows the question and the three sources; the answer rows land by ~1.3 s
const PULL = [0.25, 0.4, 0.55];
const ANSWER = 1.0;
const ASK2_AT = 4.0;
const FLY = (i: number) => 5.65 + i * 0.22;
const FLY_LEN = 0.62;

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

type Box = { x: number; y: number; w: number; h: number };
interface Geo {
  w: number;
  h: number;
  chat: Box;
  src: Box[];
  folder: Box;
  files: Box[];
  overflow: number;
}

/** A connector from the chat panel's right edge (its middle) to the left edge (middle) of a source box. */
function wire(g: Geo, i: number) {
  const s = g.src[i]!;
  const x0 = g.chat.x + g.chat.w;
  const y0 = g.chat.y + g.chat.h / 2;
  const x1 = s.x;
  const y1 = s.y + s.h / 2;
  const mx = (x0 + x1) / 2;
  return { x0, y0, x1, y1, mx, d: `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}` };
}
function onWire(w: ReturnType<typeof wire>, k: number) {
  // the cubic bezier above, at parameter k
  const u = 1 - k;
  const x = u * u * u * w.x0 + 3 * u * u * k * w.mx + 3 * u * k * k * w.mx + k * k * k * w.x1;
  const y = u * u * u * w.y0 + 3 * u * u * k * w.y0 + 3 * u * k * k * w.y1 + k * k * k * w.y1;
  return { x, y };
}

export function RuniConnector(props: ShowcaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const srcs = useRef<(HTMLDivElement | null)[]>([]);
  const folder = useRef<HTMLDivElement>(null);
  const files = useRef<(HTMLSpanElement | null)[]>([]);
  const v = useVariant(ref);
  const { t } = useLoop(ref, D, KEY, props);
  const [geo, setGeo] = useState<Geo | null>(null);

  // measure where everything actually is, and again whenever the canvas or the chat's content changes size
  useLayoutEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const measure = () => {
      const c = chat.current;
      const f = flow.current;
      const fo = folder.current;
      if (!c || !f || !fo || root.offsetWidth === 0) return;
      const inner = c.clientHeight - parseFloat(getComputedStyle(c).paddingTop) - parseFloat(getComputedStyle(c).paddingBottom);
      setGeo({
        w: root.offsetWidth,
        h: root.offsetHeight,
        chat: offsetIn(c, root),
        src: srcs.current.map((s) => (s ? offsetIn(s, root) : { x: 0, y: 0, w: 0, h: 0 })),
        folder: offsetIn(fo, root),
        files: files.current.map((s) => (s ? offsetIn(s, root) : { x: 0, y: 0, w: 0, h: 0 })),
        overflow: Math.max(0, f.offsetHeight - inner),
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (flow.current) ro.observe(flow.current);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [v]);

  const stage = Math.min(out(prog(t, 0, 0.2)), 1 - accel(prog(t, D - 0.5, D - 0.05)));
  const checking = out(prog(t, 0.2, 0.4)) * (1 - prog(t, ANSWER - 0.15, ANSWER));
  const lead = out(prog(t, ANSWER, ANSWER + 0.4));
  const row = (i: number) => out(prog(t, ANSWER + 0.15 + i * 0.16, ANSWER + 0.75 + i * 0.16));
  const b2 = out(prog(t, ASK2_AT, ASK2_AT + 0.4));
  const q2 = typed(ASK2, t, ASK2_AT + 0.05, 38);
  const scroll = inOut(prog(t, ASK2_AT - 0.2, ASK2_AT + 0.4));
  const fileIn = (i: number) => out(prog(t, 4.8 + i * 0.12, 5.3 + i * 0.12));
  const landed = FILES.filter((_, i) => t >= FLY(i) + FLY_LEN).length;
  const bump = Math.max(
    ...FILES.map((_, i) => {
      const k = prog(t, FLY(i) + FLY_LEN, FLY(i) + FLY_LEN + 0.38);
      return k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
    }),
  );
  const saved = out(prog(t, 6.75, 7.2));
  const folderIn = out(prog(t, 4.7, 5.2));
  const lit = (i: number) => prog(t, PULL[i]!, PULL[i]! + 0.25) * (1 - prog(t, ANSWER + 0.1, ANSWER + 0.5));
  const scrollPx = geo ? geo.overflow * scroll : 0;

  return (
    <div ref={ref} className="sc-root sc-runi-connector">
      <p className="sc-sr">
        Reichman Courses connector: a student asks “{ASK1}”. It reads their courses, lectures and Q&amp;A forum and answers with three things
        due this week. Then “{ASK2}” saves the files into a folder.
      </p>
      <Fit v={v} innerRef={canvas} className="sc-runi-connector-stage" style={{ opacity: stage }}>
        <div aria-hidden="true">
          <div ref={chat} className="sc-runi-connector-chat">
            <div ref={flow} className="sc-runi-connector-flow" style={{ transform: `translateY(${-scrollPx}px)` }}>
              <div className="sc-runi-connector-me">
                {ASK1}
              </div>
              <div className="sc-runi-connector-lead">
                <span className="sc-mono sc-runi-connector-status" style={{ opacity: checking }}>
                  checking your courses
                  <span className="sc-runi-connector-dots">
                    {[0, 1, 2].map((d) => (
                      <i key={d} style={{ opacity: 0.3 + 0.7 * Math.max(0, Math.sin((t * 6 - d) * 1.2)) }} />
                    ))}
                  </span>
                </span>
                <span style={{ opacity: lead }}>Three things this week:</span>
              </div>
              {DUE.map((r, i) => (
                <div
                  key={r.what}
                  className="sc-runi-connector-row"
                  style={{ opacity: row(i), transform: `translateY(${(1 - row(i)) * 1.6}cqw)` }}
                >
                  <span className="sc-mono sc-runi-connector-day">{r.day}</span>
                  <span className="sc-runi-connector-what">{r.what}</span>
                  <span className="sc-runi-connector-item">{r.item}</span>
                </div>
              ))}
              <div className="sc-runi-connector-me" style={{ opacity: b2, transform: `translateY(${(1 - b2) * 2}cqw)` }}>
                {q2 || ' '}
              </div>
              <div className="sc-runi-connector-files">
                {FILES.map((f, i) => {
                  const k = fileIn(i);
                  const fly = prog(t, FLY(i), FLY(i) + FLY_LEN);
                  return (
                    <span
                      key={f}
                      ref={(el) => (files.current[i] = el)}
                      className="sc-runi-connector-file"
                      style={{ opacity: fly > 0 ? 0.3 : k, transform: `scale(${0.85 + 0.15 * k})` }}
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

          {geo && (
            <svg className="sc-runi-connector-wires" viewBox={`0 0 ${geo.w} ${geo.h}`}>
              {SOURCES.map((s, i) => {
                const l = lit(i);
                return (
                  <path
                    key={s.label}
                    d={wire(geo, i).d}
                    className="sc-runi-connector-wire"
                    style={{ opacity: 0.5 + 0.5 * l, stroke: l > 0.02 ? 'var(--sc-accent)' : undefined }}
                  />
                );
              })}
              <circle cx={geo.chat.x + geo.chat.w} cy={geo.chat.y + geo.chat.h / 2} r={Math.max(2, geo.w * 0.006)} className="sc-runi-connector-hub" />
              {SOURCES.map((s, i) => {
                // a packet travels from each source into the chat
                const k = prog(t, PULL[i]! + 0.1, PULL[i]! + 0.7);
                if (k <= 0 || k >= 1) return null;
                const p = onWire(wire(geo, i), 1 - inOut(k));
                return <circle key={`p${s.label}`} cx={p.x} cy={p.y} r={Math.max(2.5, geo.w * 0.008)} className="sc-runi-connector-packet" />;
              })}
            </svg>
          )}

          <div className="sc-runi-connector-srcs">
            {SOURCES.map((s, i) => {
              return (
                <div
                  key={s.label}
                  ref={(el) => (srcs.current[i] = el)}
                  className={'sc-runi-connector-src' + (lit(i) > 0.5 ? ' is-lit' : '')}
                >
                  <SourceMark i={i} />
                  <span className="sc-runi-connector-src-txt">
                    <span className="sc-runi-connector-label">{s.label}</span>
                    <span className="sc-mono sc-runi-connector-brand">{s.brand}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div
            ref={folder}
            className="sc-runi-connector-folder"
            style={{ opacity: folderIn, transform: `scale(${1 + 0.1 * bump})` }}
          >
            <svg viewBox="0 0 32 26" aria-hidden="true">
              <path d="M1.5 4 Q1.5 2 3.5 2 H11 L14 5 H28.5 Q30.5 5 30.5 7 V22 Q30.5 24 28.5 24 H3.5 Q1.5 24 1.5 22 Z" />
            </svg>
            <span className="sc-mono">{landed > 0 ? landed : ''}</span>
          </div>

          {geo &&
            FILES.map((f, i) => {
              const k = prog(t, FLY(i), FLY(i) + FLY_LEN);
              if (k <= 0 || k >= 1) return null;
              const e = inOut(k);
              const from = geo.files[i]!;
              const sx = from.x + from.w / 2;
              const sy = from.y + from.h / 2 - scrollPx;
              const tx = geo.folder.x + geo.folder.w / 2;
              const ty = geo.folder.y + geo.folder.h * 0.4;
              const x = lerp(sx, tx, e);
              const y = lerp(sy, ty, e) - Math.sin(e * Math.PI) * geo.h * 0.08;
              return (
                <span
                  key={`fly-${f}`}
                  className="sc-runi-connector-flyer"
                  style={{ left: `${x}px`, top: `${y}px`, transform: `translate(-50%,-50%) rotate(${e * 18 - 9}deg) scale(${1 - 0.45 * e})` }}
                />
              );
            })}
        </div>
      </Fit>
    </div>
  );
}

export default RuniConnector;
export const runiConnectorMeta = { duration: D, keyTime: KEY } as const;
