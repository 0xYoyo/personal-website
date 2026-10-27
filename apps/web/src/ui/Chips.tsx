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
  const settling = useStore((s) => s.settling);
  // while the flock gathers after an overlay closes, the chips wait (POLISH2 A2)
  // (a card, a build and contact leave the row up: its moves work while they are open, FIX4 U2)
  const hide = phase !== 'ready' || overlay === 'game' || overlay === 'history' || !!settling;
  const row = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    // a short row (three chips or fewer) wraps centred on a phone (WAVE3 S5); decided once per row, so it
    // can't flip-flop. Only over the conversation: a build frame (and its controls) is laid out for a one-line row.
    const few = chips.length <= 3 && (overlay === 'none' || overlay === 'tour');
    el.dataset.few = String(few);
    el.dataset.compact = 'false';
    const first = el.firstElementChild as HTMLElement | null;
    const tall = () => !!first && el.offsetHeight > first.offsetHeight * 2 + 24;
    // three long chips ("Tell me about Polybot", …) take three lines at 390 px: a tighter chip puts two on
    // a line; if even that runs to three lines they still wrap: a row of three is never scrolled off (FIX4 U5)
    if (few && tall()) el.dataset.compact = 'true';
    const update = () => {
      // the row's height, for what stacks above it on a phone (the card sheet, contact, the words: FIX4 U2)
      const app = el.closest<HTMLElement>('.y-app');
      app?.style.setProperty('--chips-h', `${chips.length ? el.offsetHeight : 0}px`);
      const can = el.scrollWidth > el.clientWidth + 1;
      setScrollable(can);
      el.dataset.more = String(can && el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    // the mono face loading changes the chips' widths (not the row's box): measure again then
    let live = true;
    void document.fonts?.ready.then(() => live && update());
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      live = false;
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [key, chips.length, overlay]);

  return (
    <nav className="y-chips" data-hidden={hide || !chips.length} aria-label="suggestions">
      {/* the row is a stop of its own only when it scrolls (arrow keys reach the hidden chips), and then it says so */}
      <div
        className="y-chips-row"
        key={key}
        ref={row}
        {...(scrollable && !hide ? { tabIndex: 0, role: 'group', 'aria-label': copy.chips.scrollLabel } : {})}
      >
        {chips.map((c, i) => (
          <button key={c} className="y-chip" style={{ animationDelay: `${i * 30}ms` }} onClick={() => ctl.chip(c)} tabIndex={hide ? -1 : 0}>
            {c}
          </button>
        ))}
      </div>
    </nav>
  );
}
