import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { loopSkills, unfilteredQueries } from '../../content/projects';
import { factoryStore, useFactory } from '../../factory/store';
import { MOUNT_ANIM_DELAY } from '../../factory/ui/choreography';

/** yoyo-loop: the eight skills, as they are typed in Claude Code */
export function LoopSkills() {
  return (
    <figure className="projects-skills">
      <figcaption className="projects-aside-cap">The eight skills</figcaption>
      <ol className="projects-skills-list mono">
        {loopSkills.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </figure>
  );
}

/** Types `text` once, a character at a time; returns the visible prefix. */
function useTyped(text: string, start: boolean, delay = 0, cps = 38) {
  const [n, setN] = useState(start ? 0 : text.length);
  useEffect(() => {
    if (!start) return;
    let id: number | undefined;
    const begin = window.setTimeout(() => {
      id = window.setInterval(() => {
        setN((v) => {
          if (v + 1 >= text.length && id !== undefined) window.clearInterval(id);
          return Math.min(v + 1, text.length);
        });
      }, 1000 / cps);
    }, delay);
    return () => {
      window.clearTimeout(begin);
      if (id !== undefined) window.clearInterval(id);
    };
  }, [text, start, delay, cps]);
  return text.slice(0, n);
}

/** Unfiltered: an example request typed into a search line, then a refinement */
export function SearchExample() {
  const reduced = useReducedMotion();
  const skipped = useFactory((s) => s.skipped);
  const animate = !reduced && !skipped;
  const [first, second] = unfilteredQueries;
  // Starts while the merge wipe reveals the section (choreography.ts).
  const a = useTyped(first, animate, MOUNT_ANIM_DELAY);
  const b = useTyped(second, animate, MOUNT_ANIM_DELAY + (first.length / 38) * 1000 + 700);
  const typingSecond = a.length === first.length && b.length < second.length;
  // The caret rests ~1.5 s after the last character, so it does not blink forever.
  const done = b.length === second.length;
  const [resting, setResting] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => setResting(true), 1500);
    return () => window.clearTimeout(id);
  }, [done]);
  return (
    <figure className="projects-search">
      <figcaption className="projects-aside-cap">A request, then a follow-up</figcaption>
      <p className="projects-search-line mono">
        <span className="visually-hidden">{first}</span>
        <span aria-hidden="true">
          {a}
          {a.length < first.length && <span className="projects-caret" />}
        </span>
      </p>
      <p className="projects-search-line is-follow mono">
        <span className="visually-hidden">{second}</span>
        <span aria-hidden="true">
          {b}
          {(typingSecond || done) && <span className={resting ? 'projects-caret is-resting' : 'projects-caret'} />}
        </span>
      </p>
    </figure>
  );
}

/** Prompt Racers: the Hebrew title and the button that opens the real game */
export function PlayGame({ nameHe }: { nameHe: string }) {
  return (
    <div className="projects-play">
      <p className="projects-play-he he" lang="he" dir="rtl">
        {nameHe}
      </p>
      <button
        type="button"
        className="projects-play-btn"
        onClick={() => factoryStore.getState().setGameOpen(true)}
        aria-label="Play Prompt Racers"
      >
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M0 0 L12 7 L0 14 Z" fill="currentColor" />
        </svg>
        Play
      </button>
      <p className="projects-aside-cap">The real contest build, 1.4 MB, loaded when you press Play.</p>
    </div>
  );
}
