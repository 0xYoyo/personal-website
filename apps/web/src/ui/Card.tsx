// Project card (SPEC §2.4). The swarm holds the card's outline while it is
// open (buildFrame(rect, 1)) and releases it on close; the DOM draws no border.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { copy } from '../content/copy';
import { projectById } from '../content/projects';
import { ctl, lastOfShelf, MORE_ON_GITHUB } from '../controller';
import { getShowcase } from '../showcases';
import { useStore } from '../state/store';
import { useDialog } from './useDialog';

function useOutline(ref: React.RefObject<HTMLElement>, key: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      // layout box (ignores the 0.98 → 1 enter scale)
      const r = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      let p = el.offsetParent as HTMLElement | null;
      while (p) {
        r.x += p.offsetLeft;
        r.y += p.offsetTop;
        p = p.offsetParent as HTMLElement | null;
      }
      ctl.frameFor(r);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    addEventListener('resize', report);
    return () => {
      ro.disconnect();
      removeEventListener('resize', report);
    };
  }, [ref, key]);
}

export function Card() {
  const id = useStore((s) => s.project);
  const reducedMotion = useStore((s) => s.reducedMotion);
  const ref = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  useDialog(ref, { initial: ref });
  useOutline(ref, id ?? '');

  // after ←/→ the section remounts: keep focus inside the dialog
  useEffect(() => {
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') ctl.nextProject(1);
      else if (e.key === 'ArrowLeft') ctl.nextProject(-1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  if (!id) return null;
  const p = projectById(id);
  // the two shelves (WAVE4 U8): a small toggle above the card picks one; ←/→ go round the active one, and its
  // last card ends with a quiet link to the rest on GitHub
  const era = p.era;
  const last = lastOfShelf(id);
  const Showcase = getShowcase(p.showcase);

  return (
    <div className="y-card-wrap">
      <section
        ref={ref}
        className="y-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="y-card-name"
        aria-describedby="y-card-voice"
        tabIndex={-1}
        key={p.id}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - s.t < 700) ctl.nextProject(dx < 0 ? 1 : -1);
        }}
      >
        <div className="y-card-era y-mono" role="group" aria-label={copy.card.erasLabel}>
          {(['ai', 'hand'] as const).map((e) => (
            <button key={e} className="y-card-era-btn" aria-pressed={era === e} onClick={() => era !== e && ctl.openWork(e)}>
              {copy.card.eras[e]}
            </button>
          ))}
        </div>
        <div className="y-card-show">
          <Showcase reducedMotion={reducedMotion} />
        </div>
        <div className="y-card-body">
          <div className="y-card-head">
            <h2 className="y-card-name" id="y-card-name">
              {p.name}
            </h2>
            {p.nameHe && (
              <p className="y-card-he he" lang="he" dir="rtl">
                {p.nameHe}
              </p>
            )}
            <p className="y-card-status y-mono" data-status={p.status}>
              {copy.card.status(p.status, p.period, p.statusNote)}
            </p>
          </div>
          <p className="y-card-voice" id="y-card-voice">
            {p.voiceLine}
          </p>
          <ul className="y-card-facts y-mono">
            {p.cardFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="y-card-stack y-mono">{p.stack.map((s) => s.replace(/ /g, '\u00a0')).join(' · ')}</p>
          <div className="y-card-links">
            {p.play && (
              <button className="y-play" onClick={() => ctl.play()}>
                {copy.card.play}
              </button>
            )}
            {p.links.map((l) => (
              <a key={l.href} className="y-link y-mono" href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
            {last && (
              <a className="y-link y-mono y-card-more" href={MORE_ON_GITHUB} target="_blank" rel="noreferrer">
                {copy.card.more}
              </a>
            )}
          </div>
        </div>
        <nav className="y-card-nav" aria-label="Projects">
          <button className="y-textbtn" onClick={() => ctl.nextProject(-1)}>
            {copy.card.prev}
          </button>
          <button className="y-textbtn" onClick={() => ctl.nextProject(1)}>
            {copy.card.next}
          </button>

          <button className="y-textbtn y-card-close" onClick={() => ctl.closeOverlay()}>
            {copy.card.close}
          </button>
        </nav>
      </section>
    </div>
  );
}
