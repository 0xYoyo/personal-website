import { useEffect, useRef, useState } from 'react';
import { WATCH_AGAIN } from '../content/show';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { showSeen } from '../state/visit';

/**
 * "watch again" (wave 3 SHOW, FIX4 W8): a chip-sized text button at the end of the chip row (right of the chips
 * on desktop, the fourth chip on a phone), once the show has run (or been stopped) this visit, and for returning
 * visitors (whose show does not start by itself) — whenever nothing else holds the stage. Never while a reply is
 * on its way or streaming.
 */
export function WatchAgain({ hide = false, delay = 0 }: { hide?: boolean; delay?: number }) {
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const returning = useStore((s) => s.visitor.returning);
  const runner = useStore((s) => s.runner);
  const streaming = useStore((s) => s.streaming);
  const waiting = useStore((s) => s.lines[s.lines.length - 1]?.role === 'visitor');
  const [seen, setSeen] = useState(showSeen);
  const prev = useRef(overlay);
  useEffect(() => {
    if (prev.current === 'tour' && overlay !== 'tour') setSeen(true);
    prev.current = overlay;
  }, [overlay]);
  if (phase !== 'ready' || overlay !== 'none' || runner || streaming || waiting || !(seen || returning)) return null;
  return (
    <button
      className="y-chip y-chip-text y-watch"
      style={{ animationDelay: `${delay}ms` }}
      tabIndex={hide ? -1 : 0}
      onClick={(e) => {
        e.stopPropagation();
        ctl.startTour();
      }}
    >
      {WATCH_AGAIN}
    </button>
  );
}
