import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { EarlyMoment } from '../../content/early';

/** The spine draws top to bottom once, in this long. */
export const DRAW_MS = 900;

const months = (date: string) => Number(date.slice(0, 4)) * 12 + (date.length > 4 ? Number(date.slice(5, 7)) - 1 : 0);

/**
 * Space below an entry, in px, roughly proportional to the time until the
 * next one (square-root compressed and clamped). A deliberate gap is exempt
 * from the clamp: it is drawn at its real length.
 */
function spaceAfter(m: EarlyMoment, next: EarlyMoment | undefined): number {
  if (m.gap) return m.gap.months * 14;
  if (!next) return 0;
  const dt = Math.max(1, months(next.date) - months(m.date));
  return Math.round(Math.min(56, Math.max(20, 12 + 10 * Math.sqrt(dt))));
}

interface Props {
  moments: EarlyMoment[];
  /** Draw the spine and reveal entries as it reaches them */
  play: boolean;
}

export function Timeline({ moments, play }: Props) {
  const list = useRef<HTMLOListElement>(null);

  // Each entry owns the spine segment down to the next entry. Once laid out,
  // give every segment a delay and duration proportional to its position and
  // height, so the whole spine draws as one line at constant speed and each
  // entry appears the moment the line reaches its node.
  useLayoutEffect(() => {
    const ol = list.current;
    if (!play || !ol) return;
    const total = ol.offsetHeight || 1;
    for (const li of Array.from(ol.children) as HTMLElement[]) {
      li.style.setProperty('--at', `${Math.round((li.offsetTop / total) * DRAW_MS)}ms`);
      li.style.setProperty('--for', `${Math.round((li.offsetHeight / total) * DRAW_MS)}ms`);
    }
    ol.classList.add('is-playing');
  }, [play]);

  return (
    <ol ref={list} className={play ? 'early-list is-pending' : 'early-list'}>
      {moments.map((m, i) => (
        <li
          key={m.date + m.wave}
          className={m.gap ? 'early-item is-gap' : 'early-item'}
          style={{ '--space': `${spaceAfter(m, moments[i + 1])}px` } as CSSProperties}
        >
          <span className="early-seg" aria-hidden="true" />
          <time className="early-date mono" dateTime={m.date}>
            {m.date}
          </time>
          <div className="early-body">
            <h3 className="early-wave">{m.wave}</h3>
            {m.world && <p className="early-world">{m.world}</p>}
            <p className="early-him">{m.him}</p>
            {m.gap && <p className="early-note mono">{m.gap.note}</p>}
            {m.evidence && (
              <a className="early-evidence mono" href={m.evidence.url} target="_blank" rel="noreferrer">
                {m.evidence.label}
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
