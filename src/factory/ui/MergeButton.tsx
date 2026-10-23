import { useEffect, useRef } from 'react';
import { factoryStore, mergeByHand, useFactory } from '../store';
import type { SectionId } from '../types';
import { cx } from '../../lib/cx';

interface Props {
  id: SectionId;
  pr: number;
  size?: 'md' | 'sm';
  /** Show "Only humans merge here. Your turn." under the button (first awaiting PR only). */
  allowHint?: boolean;
  /** Show the keyboard shortcut inside the button while it is ready (control room only). */
  shortcut?: string;
  /**
   * The slot's own button. It tells the store while it is on screen, so the
   * control room can hide its copy: one amber button on screen at a time.
   */
  inline?: boolean;
}

/** Bottom strip the control room bar covers (bar + its margin). */
const BAR_STRIP = 72;

/**
 * The only amber thing on the page: the action only a human can take.
 * Before the PR is ready it renders as a quiet, disabled outline. Pressing it
 * merges at once; the button reads "Merged" in ink while the card folds away.
 */
export function MergeButton({ id, pr, size = 'md', allowHint = false, shortcut, inline = false }: Props) {
  const state = useFactory((s) => s.sections[id]?.state);
  const showHint = useFactory((s) => allowHint && s.hintFor === id && s.mode === 'manual');
  const ref = useRef<HTMLButtonElement>(null);

  const ready = state === 'awaiting-merge';
  const merged = state === 'merged';

  useInlineVisibility(inline && ready, id, ref);

  const onClick = () => {
    if (!ready) return;
    mergeByHand(id);
  };

  return (
    <div className={cx('merge', size === 'sm' && 'merge--sm')}>
      <button
        ref={ref}
        type="button"
        className={cx('merge-btn', ready && 'is-ready', merged && 'is-merged')}
        onClick={onClick}
        disabled={!ready && !merged}
        aria-disabled={!ready}
        aria-label={merged ? `PR #${pr} merged` : ready ? `Merge PR #${pr}` : `Merge PR #${pr} (not ready yet)`}
        aria-keyshortcuts={shortcut && ready ? shortcut : undefined}
      >
        <MergeIcon />
        <span>{merged ? 'Merged' : 'Merge'}</span>
        {shortcut && ready && (
          <kbd className="merge-kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        )}
      </button>
      {allowHint && (
        // Always laid out so the button never moves when the hint appears.
        <p className={cx('merge-hint', !(showHint && ready) && 'is-hidden')} aria-hidden={!(showHint && ready)}>
          Only humans merge here. Your turn.
        </p>
      )}
    </div>
  );
}

function useInlineVisibility(active: boolean, id: SectionId, ref: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const set = (v: boolean) => factoryStore.getState().setSlotButtonInView(id, v);
    if (!active || !el || typeof IntersectionObserver === 'undefined') return;
    // A button behind the top bar or the control room bar does not count as visible.
    const io = new IntersectionObserver(([e]) => set(!!e?.isIntersecting && (e.intersectionRatio ?? 0) > 0.6), {
      rootMargin: `-44px 0px -${BAR_STRIP}px 0px`,
      threshold: [0, 0.6, 1],
    });
    io.observe(el);
    return () => {
      io.disconnect();
      set(false);
    };
  }, [active, id, ref]);
}

function MergeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="merge-icon">
      <circle cx="4.5" cy="3.5" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4.5" cy="12.5" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.5" cy="8" r="1.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 5.25v5.5M4.5 5.5c0 2.5 2 2.5 5.25 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
