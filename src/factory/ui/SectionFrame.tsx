import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useFactory } from '../store';
import { useAutoMergeOnScroll } from '../useAutoMergeOnScroll';
import type { SectionModule } from '../types';
import { cx } from '../../lib/cx';
import { Slot } from './Slot';
import { CHOREO, runMergeFold } from './choreography';
import { commitLineMeta } from './commitLine';
import './factory-ui.css';

interface Props {
  module: SectionModule;
  /** The section's visible h2; null for the hero, whose h1 is the name */
  title: string | null;
  titleMono?: boolean;
}

/** slot: the PR card. folding: the merge in progress (card and section both mounted). done: the section. */
type Phase = 'slot' | 'folding' | 'done';

/**
 * Wraps every section. Until its PR merges it renders the Slot (as tall as
 * its PR card). On merge the section mounts at once under a clip and prints
 * in while the card folds into the section's commit line and the title flies
 * into the h2 (see choreography.ts). Sections never render their own h2.
 */
export function SectionFrame({ module: m, title, titleMono }: Props) {
  const ref = useRef<HTMLElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rt = useFactory((s) => s.sections[m.id]);
  const skipped = useFactory((s) => s.skipped);
  const reduced = useReducedMotion();
  const state = rt?.state ?? 'queued';
  const merged = state === 'merged';
  const animate = !skipped && !reduced && !rt?.instant && rt?.mergedBy !== 'init' && rt?.mergedBy !== 'skip';
  const headingId = `${m.id}-title`;

  const [phase, setPhase] = useState<Phase>(merged ? 'done' : 'slot');
  // Derive the phase from the store during render, so the first frame after a merge is already right.
  if (merged && phase === 'slot') setPhase(animate ? 'folding' : 'done');
  if (!merged && phase !== 'slot') setPhase('slot');
  if (phase === 'folding' && !animate) setPhase('done');

  useAutoMergeOnScroll(m.id, ref, !merged && !skipped);

  useLayoutEffect(() => {
    if (phase !== 'folding') return;
    const section = ref.current;
    const holder = holderRef.current;
    const body = bodyRef.current;
    if (!section || !holder || !body) {
      setPhase('done');
      return;
    }
    const anims = runMergeFold({ section, holder, commit: commitRef.current, titleText: titleRef.current, body });
    const t = window.setTimeout(() => setPhase('done'), CHOREO.overlayMs);
    return () => {
      window.clearTimeout(t);
      // Let the title and the wipe finish on their own; only the card's animations die with it.
      for (const a of anims) {
        const el = (a.effect as KeyframeEffect | null)?.target;
        if (el && holder.contains(el)) a.cancel();
      }
    };
  }, [phase]);

  const showSlot = phase === 'slot' || phase === 'folding';

  return (
    <section
      id={m.id}
      ref={ref}
      className={cx('section', `section--${m.id}`, merged ? 'is-merged' : 'is-slot', phase === 'folding' && 'is-folding')}
      aria-labelledby={title ? headingId : undefined}
      aria-live="polite"
      data-pr={m.pr}
      data-state={state}
    >
      <div className="container">
        {!merged && title ? (
          <h2 id={headingId} className="visually-hidden">
            {title} (pull request #{m.pr}, not merged yet)
          </h2>
        ) : null}
        {showSlot ? (
          <div className="slot-holder" ref={holderRef}>
            <Slot module={m} heading={title ?? m.title} headingMono={titleMono} />
          </div>
        ) : null}
        {merged ? (
          <>
            {title && (
              <p className="commit-line mono" ref={commitRef}>
                <span className="cl-num">#{m.pr}</span>
                <span className="cl-title">{m.title}</span>
                <span className="cl-meta">· {commitLineMeta(rt, skipped)}</span>
              </p>
            )}
            {title && (
              <h2 id={headingId} className={cx('section-title', titleMono && 'section-title--mono')}>
                <span className="section-title-text" ref={titleRef}>
                  {title}
                </span>
              </h2>
            )}
            <div className="section-body" ref={bodyRef}>
              <m.Component />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
