import { useCallback, useEffect, useRef } from 'react';
import { factoryStore, useFactory } from '../store';
import { useFocusTrap } from '../../lib/focusTrap';
import { assetUrl } from './actions';
import './factory-ui.css';

/**
 * Full-screen modal with the real Prompt Racers contest build. Lives at the
 * app root so the command palette can open it before #3 is merged; the
 * projects section opens it with factoryStore.getState().setGameOpen(true).
 */
export function GameModal() {
  const open = useFactory((s) => s.gameOpen);
  if (!open) return null;
  return <GameDialog />;
}

function GameDialog() {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const close = useCallback(() => factoryStore.getState().setGameOpen(false), []);
  useFocusTrap(ref, true, close);

  // Keys typed into the game go to the iframe's own window, so Esc would never reach the
  // focus trap. The game is a same-origin file, so listen inside it once it has loaded.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let win: Window | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const attach = () => {
      try {
        win?.removeEventListener('keydown', onKey);
        win = frame.contentWindow;
        win?.addEventListener('keydown', onKey);
      } catch {
        win = null; // not same-origin after all: Esc still works outside the game
      }
    };
    frame.addEventListener('load', attach);
    if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow?.location.href !== 'about:blank') attach();
    return () => {
      frame.removeEventListener('load', attach);
      try {
        win?.removeEventListener('keydown', onKey);
      } catch {
        // the frame is already gone
      }
    };
  }, [close]);
  return (
    <div className="overlay overlay--game">
      <div className="game" role="dialog" aria-modal="true" aria-labelledby="game-title" ref={ref}>
        <div className="game-head">
          <h2 id="game-title" className="game-title">
            <span className="he" lang="he" dir="rtl">
              מרוץ הפרומפטים
            </span>{' '}
            <span>Prompt Racers</span>
          </h2>
          <p className="game-note mono">The actual contest build — one file, zero network calls.</p>
          <button type="button" className="game-close mono" onClick={close}>
            Close (Esc)
          </button>
        </div>
        <iframe
          className="game-frame"
          title="Prompt Racers"
          ref={frameRef}
          src={assetUrl('play/prompt-racers.html')}
          loading="lazy"
          allow="autoplay; fullscreen; gamepad"
        />
      </div>
    </div>
  );
}
