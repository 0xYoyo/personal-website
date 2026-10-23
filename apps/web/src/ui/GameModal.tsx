// The real Prompt Racers (same-origin iframe, no sandbox). Esc closes even
// when focus is inside the game: we listen on the iframe's contentWindow.
import { useEffect, useRef } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useDialog } from './useDialog';

export const GAME_SRC = '/play/prompt-racers.html';

export function GameModal() {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  useDialog(ref, { initial: frame as React.RefObject<HTMLElement> });

  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    let win: Window | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        ctl.closeOverlay();
      }
    };
    const attach = () => {
      try {
        win = f.contentWindow;
        win?.addEventListener('keydown', onKey, true);
        f.focus();
      } catch {
        /* not same-origin: the Close button still works */
      }
    };
    f.addEventListener('load', attach);
    if (f.contentDocument?.readyState === 'complete') attach();
    return () => {
      f.removeEventListener('load', attach);
      try {
        win?.removeEventListener('keydown', onKey, true);
      } catch {
        /* gone */
      }
    };
  }, []);

  return (
    <section ref={ref} className="y-game" role="dialog" aria-modal="true" aria-label={copy.game.title}>
      <iframe ref={frame} className="y-game-frame" src={GAME_SRC} title={copy.game.title} allow="fullscreen; autoplay; gamepad" />
      <button className="y-game-close y-mono" onClick={() => ctl.closeOverlay()}>
        {copy.game.close}
      </button>
    </section>
  );
}
