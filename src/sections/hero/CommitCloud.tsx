import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { factoryStore, type FactoryState } from '../../factory/store';
import { commitCount, commits, fmt } from '../../data/stats';
import { CloudRenderer, DOMAIN, PAD, SETTLED, xOf, type Palette } from './cloud';
import { AgentFlights } from './flights';
import { lightsOn, mergedAfterInit } from './heroState';

const YEARS = [2023, 2024, 2025, 2026];
/** Particle indices oldest to newest, for keyboard stepping. */
const BY_DATE = commits.map((_, i) => i).sort((a, b) => Date.parse(commits[a]!.d) - Date.parse(commits[b]!.d));
const RANK = new Map(BY_DATE.map((i, r) => [i, r]));
/** Flights start from the agent era: commits since the loop began (Jul 2026). */
const AGENT_ERA = commits.map((c, i) => (c.d >= '2026-07-28' ? i : -1)).filter((i) => i >= 0);

const label = (i: number) => {
  const c = commits[i]!;
  // The baked data keeps subject lines to 80 characters; mark the ones it cut.
  return { meta: `${c.r} · ${c.s} · ${c.d.slice(0, 10)} · `, message: c.m.length >= 80 ? `${c.m}…` : c.m };
};

/** The glow goes out with the lights-on switch over this long (and fades back in after a degraded coalesce). */
const GLOW_FADE = 700;
/** A coalesce frame slower than this (ms) counts toward dropping quality... */
const SLOW_FRAME = 24;
/** ...after this many in a row. */
const SLOW_RUN = 10;

interface Hover {
  i: number;
  x: number;
  y: number;
}

export function CommitCloud() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dotProbe = useRef<HTMLSpanElement>(null);
  const fgProbe = useRef<HTMLSpanElement>(null);
  const haloProbe = useRef<HTMLSpanElement>(null);
  const cloud = useRef<CloudRenderer | null>(null);
  const kick = useRef<(ms: number) => void>(() => {});
  const [hover, setHover] = useState<Hover | null>(null);
  const [pinned, setPinned] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const renderer = new CloudRenderer(canvasRef.current!, commits);
    cloud.current = renderer;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => motionQuery.matches || factoryStore.getState().skipped;
    const flights = new AgentFlights(overlayRef.current!, () => palette);

    // Colors come from the probes. Reading them forces a style pass, so it only
    // happens while the page's colors can be changing: at start and for a while
    // after the lights change.
    let palette: Palette = { dot: '', halo: '', fg: '', glow: 0 };
    let paletteUntil = 0;
    const readPalette = () => {
      palette = {
        dot: getComputedStyle(dotProbe.current!).color,
        halo: getComputedStyle(haloProbe.current!).color,
        fg: getComputedStyle(fgProbe.current!).color,
        glow: palette.glow,
      };
    };

    // Glow belongs to the dark regime: it is on until the lights-on switch and
    // goes out with it (eased over the switch, not over build progress).
    const glowTarget = () => (lightsOn(factoryStore.getState()) ? 0 : 1);
    const glowEase = { from: glowTarget(), to: glowTarget(), at: 0 };
    palette.glow = glowEase.to;
    const glowAt = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - glowEase.at) / GLOW_FADE));
      return glowEase.from + (glowEase.to - glowEase.from) * k * k * (3 - 2 * k);
    };

    // Adaptive quality: if the coalesce misses its frame budget SLOW_RUN times in
    // a row, drop to 1x resolution and leave the glow out until every particle
    // has landed. The cap stays at 1x for the rest of the visit.
    let slowRun = 0;
    let lastFrame = 0;
    let degraded = false;

    let raf = 0;
    let visible = true;
    let startAt: number | null = null;
    let kickUntil = 0;

    const frame = (now: number) => {
      raf = 0;
      if (factoryStore.getState().meta.length === 0) {
        raf = requestAnimationFrame(frame); // wait for boot: skip/seen decides whether we animate
        return;
      }
      if (!palette.dot || now < paletteUntil) readPalette();
      palette.glow = glowAt(now);
      renderer.setPalette(palette);
      const isStill = still();
      if (isStill) renderer.draw(Infinity, 0, 0);
      else {
        if (startAt === null) {
          startAt = now;
          performance.mark('hero:coalesce');
        }
        const t = now - startAt;
        if (t < SETTLED && !degraded) {
          slowRun = lastFrame && now - lastFrame > SLOW_FRAME ? slowRun + 1 : 0;
          if (slowRun >= SLOW_RUN) {
            degraded = true;
            renderer.setDprCap(1);
            flights.dprCap = 1;
            performance.mark('hero:degraded');
          }
        }
        // Degraded: no glow while particles fly, then it fades back in once they have landed.
        const glowScale = degraded ? Math.min(1, Math.max(0, (t - SETTLED) / GLOW_FADE)) : 1;
        renderer.draw(t, now, 0.35, glowScale);
      }
      lastFrame = now;
      if (visible && !document.hidden && (!isStill || now < kickUntil)) raf = requestAnimationFrame(frame);
    };
    const run = () => {
      if (raf || !visible || document.hidden) return;
      lastFrame = 0; // a resumed loop's first gap is a pause, not a slow frame
      raf = requestAnimationFrame(frame);
    };
    kick.current = (ms: number) => {
      kickUntil = Math.max(kickUntil, performance.now() + ms);
      run();
    };

    const resize = new ResizeObserver(() => {
      const { width, height } = wrap.getBoundingClientRect();
      renderer.resize(width, height, window.devicePixelRatio || 1, width < 600 ? 1.15 : 1.45);
      kick.current(60);
    });
    resize.observe(wrap);

    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      run();
    });
    io.observe(wrap);
    const onVisibility = () => run();
    document.addEventListener('visibilitychange', onVisibility);
    const onMotion = () => kick.current(60);
    motionQuery.addEventListener('change', onMotion);

    const lightsKey = (st: FactoryState) =>
      `${st.runId}|${st.skipped}|${mergedAfterInit(st)}|${lightsOn(st)}|${String((st as { lightsOverride?: unknown }).lightsOverride)}`;
    const unsubscribe = factoryStore.subscribe((s, prev) => {
      if (s.runId !== prev.runId) startAt = null; // replay: coalesce again
      if (lightsKey(s) !== lightsKey(prev)) {
        const now = performance.now();
        const to = glowTarget();
        // Boot, skip and replay set the scene at once; a merge or the Lights command eases.
        const jump = prev.meta.length === 0 || s.skipped !== prev.skipped || s.runId !== prev.runId;
        if (to !== glowEase.to || jump) Object.assign(glowEase, { from: jump ? to : glowAt(now), to, at: now });
        // The page's colors ease over ~900 ms; follow them.
        paletteUntil = now + 1100;
        kick.current(1100);
      }
      if (still()) return flights.stop();
      const started = s.meta.some(
        (m) => s.sections[m.id]?.state === 'building' && prev.sections[m.id]?.state !== 'building',
      );
      if (!started || document.hidden) return;
      const box = wrap.getBoundingClientRect();
      const target = document.querySelector('.control-bar') ?? document.querySelector('.control');
      if (!target || box.bottom < 0 || box.top > window.innerHeight) return;
      const t = target.getBoundingClientRect();
      const n = 3 + Math.floor(Math.random() * 3);
      const from = Array.from({ length: n }, () => {
        const p = renderer.particles[AGENT_ERA[Math.floor(Math.random() * AGENT_ERA.length)]!]!;
        return { x: box.left + p.x, y: box.top + p.y };
      });
      flights.launch(from, { x: t.left + 20, y: t.top + t.height / 2 });
    });

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotion);
      unsubscribe();
      flights.stop();
      cloud.current = null;
    };
  }, []);

  const show = (i: number) => {
    const r = cloud.current;
    const p = r?.particles[i];
    if (!r || !p) return setHover(null);
    r.active = i;
    setHover({ i, x: p.x, y: p.y });
    kick.current(60);
  };
  const clear = () => {
    if (cloud.current) cloud.current.active = -1;
    setHover(null);
    setPinned(false);
    kick.current(60);
  };

  // A pinned tooltip (tap or click) closes on a tap anywhere else.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) clear();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  const local = (e: PointerEvent) => {
    const b = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || pinned || !cloud.current) return;
    const { x, y } = local(e);
    const i = cloud.current.pick(x, y, 16);
    if (i < 0) {
      if (hover) clear();
    } else if (i !== hover?.i) show(i);
  };

  const onPointerUp = (e: PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!cloud.current || !start) return;
    const { x, y } = local(e);
    if (Math.hypot(x - start.x, y - start.y) > 10) return; // a scroll, not a tap
    const i = cloud.current.pick(x, y, e.pointerType === 'touch' ? 28 : 16);
    if (i < 0) return clear();
    show(i);
    setPinned(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const rank = hover ? RANK.get(hover.i)! : -1;
    const last = BY_DATE.length - 1;
    const step: Record<string, number> = {
      ArrowRight: rank < 0 ? 0 : rank + 1,
      ArrowUp: rank < 0 ? 0 : rank + 1,
      ArrowLeft: rank < 0 ? last : rank - 1,
      ArrowDown: rank < 0 ? last : rank - 1,
      PageUp: rank + 25,
      PageDown: rank - 25,
      Home: 0,
      End: last,
    };
    if (e.key === 'Escape' && hover) {
      e.preventDefault();
      return clear();
    }
    const next = step[e.key];
    if (next === undefined) return;
    e.preventDefault();
    show(BY_DATE[Math.max(0, Math.min(last, next))]!);
    setPinned(true);
  };

  const tip = hover ? label(hover.i) : null;
  const size = cloud.current?.size;
  const along = hover && size?.w ? hover.x / size.w : 0;
  const summary = `${fmt(commitCount)} commits from ${new Date(DOMAIN.start).getUTCFullYear()} to ${new Date(DOMAIN.end).getUTCFullYear()}`;

  return (
    <div className="hero-cloud-plot" style={{ ['--hero-pad' as string]: `${PAD}px` }}>
      <div
        ref={wrapRef}
        className="hero-cloud-canvas"
        tabIndex={0}
        role="slider"
        aria-label="Commit timeline, one dot per commit. Arrow keys step through commits by date."
        aria-valuemin={1}
        aria-valuemax={commitCount}
        aria-valuenow={hover ? RANK.get(hover.i)! + 1 : 1}
        aria-valuetext={tip ? tip.meta + tip.message : summary}
        onPointerMove={onPointerMove}
        onPointerLeave={() => !pinned && hover && clear()}
        onPointerDown={(e) => (down.current = local(e))}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onBlur={() => pinned && clear()}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <span ref={dotProbe} className="hero-probe hero-probe--dot" aria-hidden="true" />
        <span ref={fgProbe} className="hero-probe hero-probe--fg" aria-hidden="true" />
        <span ref={haloProbe} className="hero-probe hero-probe--halo" aria-hidden="true" />
        {tip && hover && (
          <div
            className="hero-tip mono"
            aria-hidden="true"
            style={{
              left: hover.x,
              top: hover.y,
              // Slide the box along with the point so it never leaves the plot.
              transform: `translate(${-along * 100}%, ${hover.y < 64 ? '14px' : 'calc(-100% - 14px)'})`,
            }}
          >
            <span className="hero-tip-meta">{tip.meta}</span>
            {tip.message}
          </div>
        )}
      </div>
      <ol className="hero-ticks mono" aria-hidden="true">
        {YEARS.map((y) => (
          <li key={y} style={{ left: `${xOf(Date.UTC(y, 0, 1)) * 100}%` }}>
            {y}
          </li>
        ))}
      </ol>
      {createPortal(<canvas ref={overlayRef} className="hero-flights" aria-hidden="true" />, document.body)}
    </div>
  );
}
