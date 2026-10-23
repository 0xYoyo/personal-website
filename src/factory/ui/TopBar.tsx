import { useEffect, useState } from 'react';
import { factoryStore, isComplete, selectAwaiting, selectStatus, useFactory } from '../store';
import { cx } from '../../lib/cx';
import { LIGHTS_ON_AT } from '../../design/lights';
import { replayBuild } from './actions';
import './factory-ui.css';

/** Fixed 44px bar: wordmark and live status left; Autopilot, ⌘K, Skip/Replay right. */
export function TopBar() {
  const loopStatus = useFactory(selectStatus);
  const lightsFlash = useLightsFlash();
  const status = lightsFlash ?? loopStatus;
  const complete = useFactory(isComplete);
  const waiting = useFactory((s) => selectAwaiting(s) !== null && s.mode === 'manual');
  const running = useFactory((s) => !isComplete(s));
  const mode = useFactory((s) => s.mode);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <a className="wordmark" href="#top" aria-label="Yoyo, back to top">
            Yoyo
          </a>
          <p className="topbar-status mono" aria-live="polite">
            <span className={cx('status-dot', waiting ? 'is-waiting' : running ? 'is-running' : 'is-done')} aria-hidden="true" />
            <span className="topbar-status-text">{status}</span>
          </p>
        </div>
        <div className="topbar-right">
          {!complete && <AutopilotSwitch on={mode === 'autopilot'} />}
          <button
            type="button"
            className="topbar-btn topbar-k mono"
            onClick={() => factoryStore.getState().setPaletteOpen(true)}
            aria-label="Open command palette"
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          >
            {isMac ? '⌘K' : 'Ctrl K'}
          </button>
          {complete ? (
            <button type="button" className="topbar-btn" onClick={replayBuild}>
              Replay the build
            </button>
          ) : (
            <button type="button" className="topbar-btn" onClick={() => factoryStore.getState().skipShow()}>
              Skip the show
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/** How long the top bar says "lights on" when the switch happens (POLISH_WAVE D). */
export const LIGHTS_FLASH_MS = 2000;

/** "lights on · 4 of 7 merged" for two seconds after the lights switch on, else null. */
function useLightsFlash(): string | null {
  const at = useFactory((s) => s.lightsOnAt);
  const total = useFactory((s) => s.meta.length - 1);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (at === null) {
      setText(null);
      return;
    }
    const left = LIGHTS_FLASH_MS - (Date.now() - at);
    if (left <= 0) return;
    setText(`lights on · ${LIGHTS_ON_AT} of ${total} merged`);
    const t = window.setTimeout(() => setText(null), left);
    return () => window.clearTimeout(t);
  }, [at, total]);
  return text;
}

export function AutopilotSwitch({ on, compact = false }: { on: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={cx('switch', compact && 'switch--compact')}
      onClick={() => factoryStore.getState().setMode(on ? 'manual' : 'autopilot')}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">Autopilot</span>
    </button>
  );
}
