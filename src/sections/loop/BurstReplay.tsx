import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Burst } from '../../data/stats';
import { MOUNT_ANIM_DELAY } from '../../factory/ui/choreography';
import { hourTicks, issueOf, layoutBars, openToMerge, type Bar } from './burst';

interface Props {
  burst: Burst;
  width: number;
  /** Play the replay once when the strip first comes into view; otherwise start on the final state. */
  autoplay: boolean;
  /** Reduced motion: no replay at all. */
  still: boolean;
}

const DURATION = 3000;
const VISIBLE = 0.5;
/** If the strip is already in view at mount (just merged), wait out the merge wipe first. */
const MOUNT_HOLD_MS = MOUNT_ANIM_DELAY;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const dayLabel = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const tipText = (b: Bar) => `#${b.pr.number} · ${b.pr.title} · open→merge ${Math.round(openToMerge(b.pr))}m`;

export function BurstReplay({ burst, width, autoplay, still }: Props) {
  const start = Date.parse(burst.start);
  const end = Date.parse(burst.end);
  const narrow = width < 600;
  const pitch = narrow ? 11 : 16;
  const inner = width - 2;
  const bars = useMemo(() => layoutBars(burst.prs, start, end, inner, 2, narrow ? 1.5 : 2), [burst, start, end, inner, narrow]);
  const lanes = Math.max(...bars.map((b) => b.lane)) + 1;
  const axis = lanes * pitch + 10;
  const height = axis + 34;
  const laneY = (lane: number) => axis - 6 - (lane + 1) * pitch + 4;

  // The replay: a playhead sweeps the 96 hours in 3 s and each PR appears as it merges.
  const [p, setP] = useState(autoplay && !still ? 0 : 1);
  const raf = useRef(0);
  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / DURATION);
      setP(k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    setP(0);
    raf.current = requestAnimationFrame(tick);
  }, []);
  // A data playback, so it starts when the strip is at least half in view (once), not on a timer.
  const figRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = figRef.current;
    if (!autoplay || still || !el) return;
    const mountedAt = performance.now();
    let hold: number | undefined;
    const start = () => {
      hold = window.setTimeout(play, Math.max(0, MOUNT_HOLD_MS - (performance.now() - mountedAt)));
    };
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= VISIBLE)) {
                io?.disconnect();
                start();
              }
            },
            { threshold: VISIBLE },
          );
    if (io) io.observe(el);
    else start();
    return () => {
      io?.disconnect();
      window.clearTimeout(hold);
      cancelAnimationFrame(raf.current);
    };
  }, [autoplay, still, play]);

  const shown = bars.filter((b) => b.at <= p);
  const issues = new Set(shown.map((b) => issueOf(b.pr)).filter(Boolean)).size;
  const playing = p > 0 && p < 1;

  // Hover, touch and arrow keys all pick a bar; the tooltip follows it.
  const [active, setActive] = useState<number | null>(null);
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    let best: number | null = null;
    let bestD = 24;
    bars.forEach((b, i) => {
      if (b.at > p) return;
      const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - b.x - b.w : 0;
      const dy = Math.abs(y - (laneY(b.lane) + pitch / 2 - 2)) / 2;
      if (dx + dy < bestD) [best, bestD] = [i, dx + dy];
    });
    setActive(best);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = bars.length - 1;
    if (e.key === 'ArrowRight') setActive((a) => (a === null ? 0 : Math.min(last, a + 1)));
    else if (e.key === 'ArrowLeft') setActive((a) => (a === null ? last : Math.max(0, a - 1)));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const ticks = hourTicks(start, end).filter((t) => !narrow || (t / HOUR) % 3 === 0);
  const x = (t: number) => 1 + ((t - start) / (end - start)) * inner;
  const cur = active !== null && bars[active] && bars[active].at <= p ? bars[active] : null;
  const tipLeft = cur && cur.x + cur.w / 2 < width / 2;

  return (
    <figure className="loop-burst" ref={figRef}>
      <figcaption className="loop-burst-head">
        <span className="loop-burst-label">Unfiltered, pull requests merged 3–7 Oct 2026</span>
        <span className="loop-count mono">
          {shown.length} {shown.length === 1 ? 'PR' : 'PRs'} · {issues} {issues === 1 ? 'issue' : 'issues'}
        </span>
      </figcaption>

      <div
        className="loop-strip"
        tabIndex={0}
        role="group"
        aria-label={`Timeline of the ${bars.length} pull requests. Use the arrow keys to step through them.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          aria-hidden="true"
        >
          {ticks.map((t) => {
            const midnight = t % DAY === 0;
            const major = midnight || (t / HOUR) % 6 === 0;
            return (
              <g key={t}>
                {midnight && <line className="loop-rule" x1={x(t)} x2={x(t)} y1={0} y2={axis} />}
                <line className="loop-tick" x1={x(t)} x2={x(t)} y1={axis} y2={axis + (midnight ? 10 : major ? 6 : 3)} />
                {midnight && (
                  <text className="loop-t" x={x(t) + 4} y={axis + 24}>
                    {dayLabel(t)}
                  </text>
                )}
              </g>
            );
          })}
          <line className="loop-axis" x1={0} x2={width} y1={axis} y2={axis} />
          {shown.map((b) => (
            <rect
              key={b.pr.number}
              className={b === cur ? 'loop-bar is-active' : 'loop-bar'}
              x={1 + b.x}
              y={laneY(b.lane)}
              width={b.w}
              height={pitch - 4}
              rx={1}
            />
          ))}
          {playing && <line className="loop-playhead" x1={x(start + p * (end - start))} x2={x(start + p * (end - start))} y1={0} y2={axis} />}
        </svg>

        {cur && (
          <div
            className="loop-tip mono"
            style={
              tipLeft
                ? { left: Math.max(0, cur.x - 12), top: laneY(cur.lane) - 8 }
                : { right: Math.max(0, width - cur.x - cur.w - 12), top: laneY(cur.lane) - 8 }
            }
          >
            {tipText(cur)}
          </div>
        )}
        <span className="visually-hidden" aria-live="polite">
          {cur ? tipText(cur) : ''}
        </span>
      </div>

      <p className="loop-burst-note">
        Each bar is one pull request, drawn from opened to merged. {burst.prs.length} merged on Unfiltered between{' '}
        {dayLabel(start)} 2026, {burst.start.slice(11, 16)} UTC and {dayLabel(end)}, {burst.end.slice(11, 16)} UTC,
        across {burst.issues.length} Linear issues.{' '}
        {!still && (
          <button type="button" className="loop-replay" onClick={play}>
            Replay
          </button>
        )}
      </p>
    </figure>
  );
}
