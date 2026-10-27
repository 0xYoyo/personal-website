// What a key does while the show or a story runs (FIX4 W1). A keystroke only types: the show goes on while the
// visitor writes, and only sending the message (Enter in the bar → ctl.say) or a chip stops it — never a key.
export type RunnerKey = 'next' | 'prev' | 'focus-bar' | 'none';

export interface KeyLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * `typing`: the key went to a text field (the bar): it is the field's (←/→ move the caret, Enter sends).
 * Elsewhere ←/→ step between scenes, Enter steps in step mode (reduced motion; not on a button), and a printable
 * key moves focus to the bar so it lands there. Esc is handled before this (it closes the show).
 */
export function runnerKey(e: KeyLike, o: { typing: boolean; stepMode: boolean; onButton: boolean; tour: boolean }): RunnerKey {
  if (o.typing) return 'none';
  if (e.key === 'ArrowRight') return 'next';
  if (e.key === 'Enter' && o.stepMode && !o.onButton) return 'next';
  if (e.key === 'ArrowLeft') return 'prev';
  if (o.tour && e.key.length === 1 && e.key !== ' ' && !e.metaKey && !e.ctrlKey && !e.altKey) return 'focus-bar';
  return 'none';
}
