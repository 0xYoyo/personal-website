import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';

export function Chips() {
  const chips = useStore((s) => s.chips);
  const key = useStore((s) => s.chipsKey);
  const phase = useStore((s) => s.phase);
  const overlay = useStore((s) => s.overlay);
  const sound = useStore((s) => s.sound);
  const hide = phase !== 'ready' || overlay === 'game' || overlay === 'history' || overlay === 'contact';
  return (
    <div className="y-chips" data-hidden={hide || !chips.length} role="group" aria-label="Suggestions">
      <div className="y-chips-row" key={key}>
        {chips.map((c, i) => (
          <button key={c} className="y-chip" style={{ animationDelay: `${i * 30}ms` }} onClick={() => ctl.chip(c)} tabIndex={hide ? -1 : 0}>
            {c}
          </button>
        ))}
        {!sound && (
          <button className="y-chip y-chip-sound-inline" style={{ animationDelay: `${chips.length * 30}ms` }} onClick={() => void ctl.setSound(true)} tabIndex={hide ? -1 : 0}>
            {copy.chips.soundOn}
          </button>
        )}
      </div>
    </div>
  );
}

/** Bottom-left "sound on" chip at entry (desktop). On mobile it sits at the end of the chip row instead. */
export function SoundChip() {
  const sound = useStore((s) => s.sound);
  const phase = useStore((s) => s.phase);
  const overlay = useStore((s) => s.overlay);
  if (sound || phase !== 'ready' || overlay !== 'none') return null;
  return (
    <button className="y-chip y-chip-sound" onClick={() => void ctl.setSound(true)}>
      <span className="y-sound-dot" aria-hidden="true" />
      {copy.chips.soundOn}
    </button>
  );
}
