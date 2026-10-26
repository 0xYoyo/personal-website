import { copy } from '../content/copy';
import { projects } from '../content/projects';
import { ctl } from '../controller';
import { useStore } from '../state/store';

/** Ask (WAVE3 V6): close what covers the bar (a card, contact, history), then put the caret in it. */
function ask() {
  const o = useStore.getState().overlay;
  if (o === 'card' || o === 'contact' || o === 'history') ctl.closeOverlay();
  requestAnimationFrame(() => document.getElementById('y-input')?.focus());
}

/** Work · Ask · Contact · Sound (WAVE3 V6). The voice toggle is dropped from the nav; `voiceSupported` stays for the shell. */
export function TopBar(_props: { voiceSupported: boolean }) {
  const overlay = useStore((s) => s.overlay);
  const sound = useStore((s) => s.sound);
  const phase = useStore((s) => s.phase);
  // mobile: History lives here, never under the words (POLISH2 A6); desktop keeps it under the conversation
  const history = useStore((s) => s.lines.length > 2 && !s.runner);

  return (
    <header className="y-top" data-ready={phase === 'ready'}>
      <button className="y-wordmark" onClick={() => ctl.home()} aria-label={copy.menu.homeLabel}>
        {copy.menu.home}
      </button>
      <nav className="y-menu" aria-label="Menu">
        <button className="y-textbtn" aria-current={overlay === 'card'} onClick={() => ctl.openProject(useStore.getState().project ?? projects[0]!.id)}>
          {copy.menu.work}
        </button>
        <button className="y-textbtn" onClick={ask}>
          {copy.menu.ask}
        </button>
        <button className="y-textbtn" aria-current={overlay === 'contact'} onClick={() => ctl.contact()}>
          {copy.menu.contact}
        </button>
        <button className="y-textbtn" aria-pressed={sound} onClick={() => void ctl.setSound(!sound)}>
          {copy.menu.sound}
        </button>
        {history && (
          <button className="y-textbtn y-menu-history" aria-current={overlay === 'history'} onClick={() => ctl.history()}>
            {copy.history.open}
          </button>
        )}
      </nav>
    </header>
  );
}
