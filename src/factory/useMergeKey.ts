import { useEffect } from 'react';
import { factoryStore, mergeByHand, selectAwaiting } from './store';

/** The key that merges the PR waiting on you. Shown in the control room's Merge button. */
export const MERGE_KEY = 'm';

/**
 * Pressing `m` (no modifier, not typing, palette and game closed) merges the
 * awaiting PR, exactly like pressing its Merge button. Logged as a merge by you.
 */
export function useMergeKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== MERGE_KEY || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const st = factoryStore.getState();
      if (st.paletteOpen || st.gameOpen) return;
      const awaiting = selectAwaiting(st);
      if (!awaiting) return;
      e.preventDefault();
      mergeByHand(awaiting.id, 'keyboard');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
