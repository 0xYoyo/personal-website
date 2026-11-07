// Dialog behaviour for overlays: remembers the opener, moves focus in, traps
// Tab inside, and restores focus on close. Esc is handled globally (App) so
// it works the same everywhere (inside the game iframe Esc is the game's own pause, WAVE5 U2).
import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * `include` (WAVE6 L1): selectors of controls that work beside the dialog (contact's chips and the bar); Tab
 * goes round the dialog and then them, in that order, instead of stopping at the dialog's edge.
 */
export function useDialog(
  ref: RefObject<HTMLElement>,
  opts: { initial?: RefObject<HTMLElement>; active?: boolean; include?: readonly string[] } = {},
): void {
  const active = opts.active ?? true;
  const initial = opts.initial;
  const include = opts.include?.join(',') ?? '';
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
      if (include) {
        const beside = [...document.querySelectorAll<HTMLElement>(include)].flatMap((el) => focusables(el));
        const ring = [...focusables(root), ...beside];
        if (!ring.length) return;
        const i = ring.indexOf(document.activeElement as HTMLElement);
        const n = ring.length;
        e.preventDefault();
        ring[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + n) % n]!.focus();
        return;
      }
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
  }, [ref, initial, active, include]);
}
