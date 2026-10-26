import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';

export function TopBar({ voiceSupported }: { voiceSupported: boolean }) {
  const overlay = useStore((s) => s.overlay);
  const sound = useStore((s) => s.sound);
  const voice = useStore((s) => s.voice);
  const phase = useStore((s) => s.phase);
  // mobile: History lives here, never under the words (POLISH2 A6); desktop keeps it under the conversation
  const history = useStore((s) => s.lines.length > 2 && !s.runner);

  return (
    <header className="y-top" data-ready={phase === 'ready'}>
      <button className="y-wordmark" onClick={() => ctl.home()} aria-label={copy.menu.homeLabel}>
        {copy.menu.home}
      </button>
      <nav className="y-menu" aria-label="Menu">
        <button className="y-textbtn" aria-current={overlay === 'card'} onClick={() => ctl.openProject(useStore.getState().project ?? 'prompt-racers')}>
          {copy.menu.work}
        </button>
        <button className="y-textbtn" aria-current={overlay === 'contact'} onClick={() => ctl.contact()}>
          {copy.menu.contact}
        </button>
        <button className="y-textbtn" aria-pressed={sound} onClick={() => void ctl.setSound(!sound)}>
          {copy.menu.sound}
        </button>
        {voiceSupported && (
          <button className="y-textbtn" aria-pressed={voice} onClick={() => ctl.setVoice(!voice)}>
            {copy.menu.voice}
          </button>
        )}
        {history && (
          <button className="y-textbtn y-menu-history" aria-current={overlay === 'history'} onClick={() => ctl.history()}>
            {copy.history.open}
          </button>
        )}
      </nav>
    </header>
  );
}
