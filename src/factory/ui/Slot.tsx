import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFactory } from '../store';
import { PR_STATES, type PRState, type SectionModule } from '../types';
import { cx } from '../../lib/cx';
import { PRCard } from './PRCard';
import './factory-ui.css';

interface Props {
  module: SectionModule;
  heading: string;
  headingMono?: boolean;
}

const STEP_LABEL: Record<PRState, string> = {
  queued: 'queued',
  building: 'building',
  ci: 'checks',
  review: 'review',
  'awaiting-merge': 'your merge',
  merged: 'merged',
};

/**
 * An unmerged section: a dashed outline exactly as tall as its pull request
 * (the section grows to its real height when it merges). Desktop shows the
 * PR's progress through the loop beside it.
 */
export function Slot({ module: m, heading, headingMono }: Props) {
  const state = useFactory((s) => s.sections[m.id]?.state ?? 'queued');
  const at = PR_STATES.indexOf(state);
  const ref = useRef<HTMLDivElement>(null);
  useClearOfControlRoom(ref, state === 'merged');

  return (
    <div className={cx('slot', `slot--${state}`)} ref={ref}>
      <div className="slot-card">
        <PRCard module={m} heading={heading} headingMono={headingMono} />
      </div>
      <div className="slot-side mono" role="status" aria-label={`PR #${m.pr} progress`}>
        <p className="slot-side-head">
          #{m.pr} <span className="muted">{m.branch}</span>
        </p>
        <ol className="steps">
          {PR_STATES.slice(0, -1).map((s, i) => (
            <li
              key={s}
              className={cx('step', i < at && 'is-done', i === at && 'is-current', s === 'awaiting-merge' && 'is-human')}
              aria-current={i === at ? 'step' : undefined}
            >
              <span className="step-dot" aria-hidden="true" />
              {STEP_LABEL[s]}
            </li>
          ))}
        </ol>
        <p className="slot-side-note">
          This section appears when the PR is merged. Scroll past and the loop merges it for you.
        </p>
      </div>
    </div>
  );
}

/** Gap kept between the slot's progress column and the expanded control room (px). */
const CLEARANCE = 16;

/**
 * On a fresh wide visit the control room starts expanded over the bottom
 * right of the screen, where the slot's progress column sits. While it is
 * expanded, pad the slot's right side so the column ends left of the panel's
 * footprint. A merged (folding) slot keeps whatever it had, so its card never
 * moves while it folds.
 */
function useClearOfControlRoom(ref: RefObject<HTMLDivElement>, frozen: boolean) {
  const open = useFactory((s) => s.controlRoomOpen);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || frozen) return;
    const apply = () => {
      el.style.paddingRight = '';
      if (!open || window.innerWidth < 1000) return;
      const panel = document.querySelector<HTMLElement>('.control.is-open');
      if (!panel) return;
      const base = parseFloat(getComputedStyle(el).paddingRight) || 0;
      const over = el.getBoundingClientRect().right - base - (panel.getBoundingClientRect().left - CLEARANCE);
      if (over > 0) el.style.paddingRight = `${Math.ceil(base + over)}px`;
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [open, frozen, ref]);
}
