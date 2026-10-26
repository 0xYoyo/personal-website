import { useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';

/**
 * Contextual chips above the bar. On mobile the row scrolls sideways: it fades
 * at the right edge while more chips are hidden there, and it takes keyboard
 * focus while it can scroll (so arrow keys reach the hidden ones).
 */
export function Chips() {
  const chips = useStore((s) => s.chips);
  const key = useStore((s) => s.chipsKey);
  const phase = useStore((s) => s.phase);
  const overlay = useStore((s) => s.overlay);
  const settling = useStore((s) => s.settling);
  // while the flock gathers after an overlay closes, the chips wait (POLISH2 A2)
  const hide = phase !== 'ready' || overlay === 'game' || overlay === 'history' || overlay === 'contact' || !!settling;
  const row = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => {
      const can = el.scrollWidth > el.clientWidth + 1;
      setScrollable(can);
      el.dataset.more = String(can && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [key]);

  return (
    <nav className="y-chips" data-hidden={hide || !chips.length} aria-label="suggestions">
      {/* the row is a stop of its own only when it scrolls (arrow keys reach the hidden chips), and then it says so */}
      <div
        className="y-chips-row"
        key={key}
        ref={row}
        {...(scrollable && !hide ? { tabIndex: 0, role: 'group', 'aria-label': copy.chips.scrollLabel } : {})}
      >
        {chips.map((c, i) => (
          <button key={c} className="y-chip" style={{ animationDelay: `${i * 30}ms` }} onClick={() => ctl.chip(c)} tabIndex={hide ? -1 : 0}>
            {c}
          </button>
        ))}
      </div>
    </nav>
  );
}
