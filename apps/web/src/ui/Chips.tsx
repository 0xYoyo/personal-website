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
  const hide = phase !== 'ready' || overlay === 'game' || overlay === 'history' || overlay === 'contact';
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
    <div className="y-chips" data-hidden={hide || !chips.length}>
      <div
        className="y-chips-row"
        key={key}
        ref={row}
        role="group"
        aria-label="Suggestions"
        tabIndex={scrollable && !hide ? 0 : undefined}
      >
        {chips.map((c, i) => (
          <button key={c} className="y-chip" style={{ animationDelay: `${i * 30}ms` }} onClick={() => ctl.chip(c)} tabIndex={hide ? -1 : 0}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "sound on": left of the bar on desktop, under it on mobile — never inside the chip row. */
export function SoundChip() {
  const sound = useStore((s) => s.sound);
  const phase = useStore((s) => s.phase);
  const overlay = useStore((s) => s.overlay);
  if (!soundChipVisible(sound, phase, overlay)) return null;
  return (
    <button className="y-chip y-chip-sound" onClick={() => void ctl.setSound(true)}>
      <span className="y-sound-dot" aria-hidden="true" />
      {copy.chips.soundOn}
    </button>
  );
}

export const soundChipVisible = (sound: boolean, phase: string, overlay: string): boolean =>
  !sound && phase === 'ready' && (overlay === 'none' || overlay === 'tour' || overlay === 'stories');
