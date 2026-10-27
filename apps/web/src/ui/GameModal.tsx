// The real Prompt Racers (same-origin iframe, no sandbox). Esc closes even
// when focus is inside the game: we listen on the iframe's contentWindow.
import { useEffect, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useDialog } from './useDialog';

export const GAME_SRC = '/play/prompt-racers.html';
/**
 * Whether the game steers by touch. Checked in its build (public/play/prompt-racers.html): its only touch /
 * pointer listeners unlock the audio; steering is keys (arrows / WASD, Shift, Space). So a phone is told it is
 * best on a keyboard (FIX4 U10). Flip this when the game ships touch controls.
 */
export const GAME_TOUCH = false;
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function GameModal() {
  const [touch] = useState(isTouch);
  // the hint stays until the first tap in the game (or 8 s), then fades
  const [hint, setHint] = useState(true);
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
    const seen = () => setHint(false);
    const hintTimer = setTimeout(seen, 8000);
    const attach = () => {
      try {
        win = f.contentWindow;
        win?.addEventListener('keydown', onKey, true);
        win?.addEventListener('pointerdown', seen, { once: true, capture: true });
        f.focus();
      } catch {
        /* not same-origin: the Close button still works */
      }
    };
    f.addEventListener('load', attach);
    if (f.contentDocument?.readyState === 'complete') attach();
    return () => {
      clearTimeout(hintTimer);
      f.removeEventListener('load', attach);
      try {
        win?.removeEventListener('keydown', onKey, true);
        win?.removeEventListener('pointerdown', seen, true);
      } catch {
        /* gone */
      }
    };
  }, []);

  return (
    <section ref={ref} className="y-game" role="dialog" aria-modal="true" aria-label={copy.game.title}>
      <iframe ref={frame} className="y-game-frame" src={GAME_SRC} title={copy.game.title} allow="fullscreen; autoplay; gamepad" />
      {touch && (
        <p className="y-game-hint y-mono" data-on={hint} aria-hidden="true">
          {GAME_TOUCH ? copy.game.touchHint : copy.game.keyboardHint}
        </p>
      )}
      {/* on a phone it sits bottom-right, clear of the game's own Settings top-right (FIX4 U10) */}
      <button className="y-game-close y-mono" onClick={() => ctl.closeOverlay()}>
        {copy.game.close}
      </button>
    </section>
  );
}
