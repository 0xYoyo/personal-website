// Project card (SPEC §2.4). The swarm holds the card's outline while it is
// open (buildFrame(rect, 1)) and releases it on close; the DOM draws no border.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { copy } from '../content/copy';
import { projectById } from '../content/projects';
import { ctl } from '../controller';
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
  // a project on the second shelf (WAVE3 S3: "Written by hand, 2022–23") carries its shelf's label,
  // shown as a tiny mono header above the card; the ←/→ sequence runs straight through both shelves
  const shelf = p.shelf;
  const Showcase = getShowcase(p.showcase);

  return (
    <div className="y-card-wrap" data-shelf={!!shelf}>
      <section
        ref={ref}
        className="y-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={shelf ? 'y-card-shelf y-card-name' : 'y-card-name'}
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
        {shelf && (
          <p className="y-card-shelf y-mono" id="y-card-shelf">
            {shelf}
          </p>
        )}
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
