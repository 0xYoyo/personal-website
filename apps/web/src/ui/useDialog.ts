// Dialog behaviour for overlays: remembers the opener, moves focus in, traps
// Tab inside, and restores focus on close. Esc is handled globally (App) so
// it works the same everywhere, including inside the game iframe.
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

export function useDialog(ref: RefObject<HTMLElement>, opts: { initial?: RefObject<HTMLElement>; active?: boolean } = {}): void {
  const active = opts.active ?? true;
  const initial = opts.initial;
  useEffect(() => {
    if (!active) return;
    const start = ref.current;
    if (!start) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = initial?.current ?? focusables(start)[0] ?? start;
    // after the enter animation frame so the element is focusable
    const t = requestAnimationFrame(() => first.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (e.key !== 'Tab' || !root) return;
      const els = focusables(root);
      if (!els.length) {
        e.preventDefault();
        return;
      }
      const a = els[0]!;
      const z = els[els.length - 1]!;
      const cur = document.activeElement;
      if (e.shiftKey && (cur === a || !root.contains(cur))) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && (cur === z || !root.contains(cur))) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener('keydown', onKey);
      if (opener && document.contains(opener) && opener.id !== 'y-input') opener.focus({ preventScroll: true });
      else document.getElementById('y-input')?.focus({ preventScroll: true });
    };
  }, [ref, initial, active]);
}
