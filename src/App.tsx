import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { factoryStore, selectLightsLevel, selectProgress } from './factory/store';
import { MOBILE_SPEED, startScheduler } from './factory/scheduler';
import { TopBar } from './factory/ui/TopBar';
import { SectionFrame } from './factory/ui/SectionFrame';
import { ControlRoom } from './factory/ui/ControlRoom';
import { CommandPalette } from './factory/ui/CommandPalette';
import { EndCard } from './factory/ui/EndCard';
import { GameModal } from './factory/ui/GameModal';
import { registry, registryMeta } from './sections/registry';
import { headings } from './content/headings';
import { useMergeKey } from './factory/useMergeKey';
import { useLoopChrome } from './factory/useLoopChrome';
import { useBottomReach } from './factory/useBottomReach';

/**
 * The lights: mirror the build onto <html> as `data-lights` (0..7, which of the
 * eight palette states tokens.css shows) and `--progress` (0..1, for anything
 * that wants a continuous number). The registered color tokens ease between states.
 */
function useLights() {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (instant: boolean) => {
      const s = factoryStore.getState();
      if (instant) root.classList.add('lights-instant');
      root.dataset.lights = String(selectLightsLevel(s));
      root.style.setProperty('--progress', String(selectProgress(s)));
      if (instant) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('lights-instant')));
    };
    apply(true);
    // replay() bumps runId and resets the sections in two separate updates, so compare
    // against the run the lights last showed, not just the previous state.
    let shownRun = factoryStore.getState().runId;
    // (Boot also bumps runId without changing the lights; a replay is the only new run that
    // makes them go down, so "new run and darker" is the jump case.)
    return factoryStore.subscribe((s, prev) => {
      const level = selectLightsLevel(s);
      const prevLevel = selectLightsLevel(prev);
      if (level === prevLevel && selectProgress(s) === selectProgress(prev)) return;
      // Skipping the show and replaying jump straight there; merges ease (900 ms, 700 ms at the switch).
      apply((s.skipped && !prev.skipped) || (s.runId !== shownRun && level < prevLevel));
      shownRun = s.runId;
    });
  }, []);
}

export default function App() {
  useLights();
  useLoopChrome();
  useMergeKey();
  useBottomReach();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    // On a wide screen a fresh visit starts with the log open, so the loop is legible from t=0.
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    // Reduced motion and ?skip=1 land on the finished page, as does a returning visitor.
    const skip = reduced || params.get('skip') === '1';
    factoryStore.getState().boot(registryMeta, { skip, controlRoomOpen: wide });
    // ?autopilot=1 starts the show with Autopilot on (screen recordings). It also plays for a
    // returning visitor, so a recording never lands on the finished page by accident.
    if (params.get('autopilot') === '1' && !skip) {
      if (factoryStore.getState().skipped) factoryStore.getState().replay();
      factoryStore.getState().setMode('autopilot');
    }
    const scheduler = startScheduler(factoryStore, { speed: mobile ? MOBILE_SPEED : 1 });
    return () => scheduler.stop();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <main id="main" tabIndex={-1}>
        <span id="top" />
        {registry.map((m) => (
          <SectionFrame key={m.id} module={m} title={headings[m.id]?.text ?? null} titleMono={headings[m.id]?.mono} />
        ))}
      </main>
      <ControlRoom />
      <CommandPalette />
      <EndCard />
      <GameModal />
    </MotionConfig>
  );
}
