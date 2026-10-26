import { useEffect, useRef, useState } from 'react';
import { WATCH_AGAIN } from '../content/show';
import { ctl } from '../controller';
import { useStore } from '../state/store';

/**
 * The small "watch again" text button (wave 3 SHOW): after the show has run (or been stopped), and for
 * returning visitors (whose show does not start by itself), whenever nothing else holds the stage.
 */
export function WatchAgain() {
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const returning = useStore((s) => s.visitor.returning);
  const runner = useStore((s) => s.runner);
  const [seen, setSeen] = useState(false);
  const prev = useRef(overlay);
  useEffect(() => {
    if (prev.current === 'tour' && overlay !== 'tour') setSeen(true);
    prev.current = overlay;
  }, [overlay]);
  if (phase !== 'ready' || overlay !== 'none' || runner || !(seen || returning)) return null;
  return (
    <div className="y-runner y-watch">
      <button className="y-textbtn" onClick={(e) => { e.stopPropagation(); ctl.startTour(); }}>
        {WATCH_AGAIN}
      </button>
    </div>
  );
}
