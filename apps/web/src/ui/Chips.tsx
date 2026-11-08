import { useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { WatchAgain } from './WatchAgain';

/**
 * Whether a phone shows the whole row wrapped (never scrolled sideways): three chips or fewer, or a project
 * row with its `Back to <Project>` chip (four), so that chip is never the one off the edge (WAVE6).
 */
export const wrapsWhole = (chips: readonly string[]): boolean =>
  chips.length <= 3 || (chips.length <= 4 && chips.some((c) => c.startsWith('Back to ')));

/** WAVE7 M3: after a pointer/touch tap on a chip, its button lets go of focus (a keyboard click has detail 0). */
export const blurAfterTap = (e: React.MouseEvent): void => {
  if (e.detail > 0) (e.target as Element).closest<HTMLElement>('button')?.blur();
};

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
    // contact too (WAVE4 U6): its three chips wrap on a phone instead of one scrolling off the edge
    // WAVE6: a project row after its card closed carries the card's chips plus `Back to <name>`: four, all in view
    const few = wrapsWhole(chips) && (overlay === 'none' || overlay === 'tour' || overlay === 'contact');
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
    // WAVE7 M3: a tap (pointer click, detail ≥ 1) leaves no focus on the chip, so no ring stays on it (or on the
    // chip that takes its place) through the answer; Enter/Space on a focused chip (detail 0) keep the keyboard's focus
    <nav className="y-chips" data-hidden={hide || !chips.length} aria-label="suggestions" onClickCapture={blurAfterTap}>
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
        {/* right of the chips on desktop, the fourth chip on a phone (FIX4 W8) */}
        <WatchAgain hide={hide} delay={chips.length * 30} />
      </div>
    </nav>
  );
}
