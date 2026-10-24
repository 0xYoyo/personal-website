// Orchestrates SPEC §2.1 (entry), §2.2 (idle → tour), global keys, pointer,
// stage layout and the overlays. Everything stateful goes through ctl/store.
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '@yoyo/protocol';
import { createBrain, readSharedFromHash } from './agent';
import { ENTRY_CHIPS, returningChips } from './content/chips';
import { copy } from './content/copy';
import { ctl } from './controller';
import { isMobileViewport, prefersReducedMotion } from './design';
import { useStore } from './state/store';
import { keepSeen, readVisitOnce, settleVisits } from './state/visit';
import { createSwarm } from './swarm';
import { BuildFrame } from './ui/BuildFrame';
import { Card } from './ui/Card';
import { Chips, SoundChip, soundChipVisible } from './ui/Chips';
import { CommandBar } from './ui/CommandBar';
import { Contact } from './ui/Contact';
import { Conversation, RunnerControls } from './ui/Conversation';
import { GameModal } from './ui/GameModal';
import { History, LiveRegion } from './ui/History';
import { createSound } from './ui/sound';
import { TopBar } from './ui/TopBar';
import { createVoice } from './ui/voice';

/** The greeting rests this long (from the moment it has landed) before "or just watch." (POLISH2 A5). */
const IDLE_MS = 7000;
/** The name line fades in under the letters once they have knitted (POLISH2 A5). */
const NAME_LINE_MS = 2200;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// the browser eats the Esc that leaves full screen, but not always: ignore one that lands right after
let lastFullscreenExit = -1e9;
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) lastFullscreenExit = performance.now();
  });
}

/** Where shapes should form: the right ~36% on desktop (the words take the left ~62%), the top ~34% on mobile. */
function stageRect(): Rect {
  const w = innerWidth;
  const h = innerHeight;
  if (isMobileViewport()) return { x: 16, y: 60, w: w - 32, h: Math.max(180, Math.round(h * 0.34)) };
  const x = Math.round(w * 0.64);
  return { x, y: 72, w: w - x - 32, h: h - 72 - 190 };
}

/** `sel`'s box; `inset` > 0 shrinks it (a keep-out inside a frame the swarm outlines). */
const boxOf = (sel: string, inset = 0): Rect | null => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left + inset, y: r.top + inset, w: Math.max(1, r.width - 2 * inset), h: Math.max(1, r.height - 2 * inset) };
};

/**
 * What the flock should stay off (POLISH1 B3; up to 6): the top bar, the words, the chips and the
 * bar — and with a build open, its caption, the inside of its frame and the controls (POLISH2 A4).
 * `restored`: an overlay is closing (POLISH2 A2): count the conversation and chips that are about to
 * come back even though they are still hidden, so the flock is kept off them before it moves.
 */
function keepOutRects(restoring = false): Rect[] {
  // while the flock gathers, the words and chips are still hidden but already kept clear
  const restored = restoring || !!useStore.getState().settling;
  const shown = restored ? '' : '[data-hidden="false"]';
  const sels: [string, number?][] = [
    ['.y-top'],
    [`.y-convo${shown} .y-agent`],
    [`.y-convo${shown} .y-echo`],
    [`.y-convo${shown} .y-prev[data-room="true"]`],
    [`.y-chips${shown} .y-chips-row`],
    ['.y-bar-wrap[data-ready="true"] .y-bar'],
  ];
  if (!restored && useStore.getState().overlay === 'build') {
    sels.splice(1, 3, ['.y-build-caption'], ['.y-build-frame[data-visible="true"]', 14], ['.y-build-controls[data-on="true"]']);
  }
  return sels
    .map(([sel, inset]) => boxOf(sel, inset))
    .filter((r): r is Rect => !!r)
    .slice(0, 6);
}

type StageFn = (rect: Rect, keepOut?: Rect[]) => void;
/**
 * Tell the engine where to draw. Keep-out rects go along only when the engine's
 * `setStage` takes a second argument (or flags `keepOut` support), so this works
 * against engines with and without it.
 */
function pushStage(restored = false) {
  const sw = ctl.swarm as (typeof ctl.swarm & { keepOut?: boolean }) | null;
  const fn = sw?.setStage as StageFn | undefined;
  if (!sw || !fn) return;
  if (fn.length >= 2 || sw.keepOut === true) fn.call(sw, stageRect(), keepOutRects(restored));
  else fn.call(sw, stageRect());
}

const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function App() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const sound = useStore((s) => s.sound);
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);

  // ---- boot: swarm, brain, sound, voice; then the entry -------------------
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const st = useStore.getState();
    const reduced = prefersReducedMotion();
    st.setReducedMotion(reduced);
    const params = new URLSearchParams(location.search);
    const speed = Number(params.get('speed') ?? '1') || 1; // QA only: ?speed=0.2 runs timings 5× faster
    const tierParam = params.get('tier'); // QA only: ?tier=0..3 forces a quality tier (no adaptive drop)
    const tier = tierParam !== null && /^[0-3]$/.test(tierParam) ? (Number(tierParam) as 0 | 1 | 2 | 3) : undefined;
    const scene = params.get('scene') === 'light' ? 'light' : 'dark';
    const visit = readVisitOnce(); // before the client starts: it stamps lastSeen itself
    const brain = createBrain({ agentUrl: import.meta.env.VITE_AGENT_URL as string | undefined, speed });
    const sound = createSound();
    const voice = createVoice();
    let cancelled = false;
    let swarm: Awaited<ReturnType<typeof createSwarm>> | null = null;

    void (async () => {
      swarm = await createSwarm(container, { scene, reducedMotion: reduced, ...(tier !== undefined ? { tier, adaptive: false } : {}) });
      if (cancelled) {
        swarm.destroy();
        return;
      }
      ctl.init({ swarm, brain, sound, voice });
      // QA hook (dev server, or ?qa=1 on a build): tools/shots.mjs and tools/og.mjs drive the page through it
      if (import.meta.env.DEV || params.has('qa')) Object.assign(window, { __yoyo: { ctl, swarm, brain, store: useStore } });
      ctl.setScene(scene);
      pushStage();
      if (reduced) swarm.mood('asleep');

      // memory
      settleVisits(visit);
      const name = brain.memory.name();
      const returning = visit.returning;
      st.setVisitor({ name, returning, visits: visit.visits });
      if (brain.memory.voice()) st.setVoice(true);
      const soundWanted = brain.memory.sound();

      // shared build link (#b=...)
      const shared = await readSharedFromHash();

      // ---- entry (SPEC §2.1)
      st.setPhase('entry');
      const nameLine = setTimeout(() => useStore.getState().setEntryName(copy.entry.nameLine), reduced ? 0 : NAME_LINE_MS);
      const entryName = returning && name ? name : undefined;
      if (params.get('skipEntry') !== '1') {
        if (swarm.playEntry) await swarm.playEntry({ ...(entryName ? { name: entryName } : {}), reducedMotion: reduced });
        else {
          swarm.become(entryName ? { kind: 'text', text: entryName } : { kind: 'yoyo3d' });
          await sleep(2000);
          swarm.release();
        }
      }
      clearTimeout(nameLine);
      if (cancelled) return;
      useStore.getState().setEntryName(null);
      useStore.getState().setPhase('ready');
      useStore.getState().touch();
      if (soundWanted) void ctl.setSound(true);

      if (shared) {
        useStore.getState().patchBuild({ status: 'locked', html: shared, bytes: shared.length, progress: 1, title: copy.share.title });
        useStore.getState().openOverlay('build');
        useStore.getState().spendIdle();
        history.replaceState(null, '', location.pathname + location.search);
      }

      let line: string = copy.entry.greeting;
      let chips = ENTRY_CHIPS;
      if (returning) {
        const last = brain.memory.builds().find((b) => b.html);
        line = name ? copy.entry.welcomeBack(name) : copy.entry.welcomeBackAnon;
        if (last) {
          const title = last.title.toLowerCase();
          line += ` ${copy.entry.lastBuild(title)}`;
          chips = returningChips(title);
        }
      }
      useStore.getState().setChips(chips);
      await ctl.speakLine(line);
      // the idle timer starts when the greeting has landed
      useStore.getState().touch();
    })();

    const stopSeen = keepSeen();
    return () => {
      cancelled = true;
      stopSeen();
      swarm?.destroy();
    };
  }, []);

  // ---- stage layout --------------------------------------------------------
  // the stage, plus keep-outs that follow the words, chips and bar as they change size
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => pushStage());
    };
    ctl.onStage((restored) => pushStage(restored));
    addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    for (const sel of ['.y-convo', '.y-chips', '.y-bar-wrap']) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
    const unsub = useStore.subscribe((s, p) => {
      if (s.overlay !== p.overlay || s.phase !== p.phase || s.chipsKey !== p.chipsKey || s.build.status !== p.build.status || s.settling !== p.settling) schedule();
    });
    return () => {
      ctl.onStage(null);
      removeEventListener('resize', schedule);
      ro.disconnect();
      unsub();
      cancelAnimationFrame(raf);
    };
  }, []);

  // ---- pointer → swarm (and sound energy) ----------------------------------
  // Window-level, so mouse, pen and touch all reach the swarm through any layer.
  // Velocity in CSS px/s, smoothed over ~30 ms and clamped; a new touch or a
  // long pause restarts the estimate instead of reporting a jump as a fling.
  useEffect(() => {
    const MAX_V = 6000;
    let lx = 0;
    let ly = 0;
    let lt = 0;
    let vx = 0;
    let vy = 0;
    const clamp = (v: number) => Math.max(-MAX_V, Math.min(MAX_V, v));
    const reset = (e: PointerEvent) => {
      lx = e.clientX;
      ly = e.clientY;
      lt = performance.now();
      vx = 0;
      vy = 0;
      ctl.swarm?.pointer(e.clientX, e.clientY, 0, 0);
    };
    const move = (e: PointerEvent) => {
      const t = performance.now();
      const dtMs = t - lt;
      if (!lt || dtMs > 250) return reset(e);
      const dt = Math.max(4, dtMs) / 1000;
      const k = Math.min(1, dtMs / 30);
      vx += (clamp((e.clientX - lx) / dt) - vx) * k;
      vy += (clamp((e.clientY - ly) / dt) - vy) * k;
      lx = e.clientX;
      ly = e.clientY;
      lt = t;
      ctl.swarm?.pointer(e.clientX, e.clientY, vx, vy);
      ctl.energy(Math.min(1, Math.hypot(vx, vy) / 3000));
    };
    addEventListener('pointerdown', reset, { passive: true });
    addEventListener('pointermove', move, { passive: true });
    return () => {
      removeEventListener('pointerdown', reset);
      removeEventListener('pointermove', move);
    };
  }, []);

  // ---- idle the swarm while the game is up (the tab-hidden pause is the engine's own)
  useEffect(() => {
    if (overlay === 'game') ctl.swarm?.pause?.();
    else ctl.swarm?.resume?.();
  }, [overlay]);

  // ---- idle → "or just watch." → tour (SPEC §2.2) ---------------------------
  useEffect(() => {
    if (phase !== 'ready') return;
    const iv = setInterval(() => {
      const s = useStore.getState();
      if (s.idleSpent || s.overlay !== 'none' || s.streaming) return;
      if (Date.now() - s.lastInput < IDLE_MS) return;
      s.spendIdle();
      const at = Date.now();
      void ctl.speakLine(copy.entry.idle).then(async () => {
        await sleep(1400);
        const s2 = useStore.getState();
        if (s2.lastInput > at || s2.overlay !== 'none') return; // any input cancels
        ctl.startTour();
      });
    }, 300);
    const touch = () => useStore.getState().touch();
    addEventListener('keydown', touch, true);
    addEventListener('pointerdown', touch, true);
    addEventListener('wheel', touch, { passive: true, capture: true });
    return () => {
      clearInterval(iv);
      removeEventListener('keydown', touch, true);
      removeEventListener('pointerdown', touch, true);
      removeEventListener('wheel', touch, true);
    };
  }, [phase]);

  // ---- global keys ---------------------------------------------------------
  useEffect(() => {
    const seq: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Konami
      seq.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (seq.length > KONAMI.length) seq.shift();
      if (seq.join() === KONAMI.join()) {
        seq.length = 0;
        ctl.konami();
        return;
      }
      if (e.defaultPrevented) return;
      const typing = typingTarget(e.target);

      if (e.key === 'Escape') {
        // one Esc in full screen only leaves full screen (POLISH1 A3)
        if (document.fullscreenElement || performance.now() - lastFullscreenExit < 400) return;
        if (s.overlay !== 'none' || ctl.runnerActive()) {
          e.preventDefault();
          ctl.closeOverlay();
        }
        return;
      }
      // Runner: ←/→ navigate, any other key skips the tour
      if (ctl.runnerActive()) {
        if (e.key === 'ArrowRight') return ctl.runnerNext();
        // step mode (reduced motion): Enter steps too, unless it is sending a message
        if (e.key === 'Enter' && s.runner?.stepMode && !typing && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          return ctl.runnerNext();
        }
        if (e.key === 'ArrowLeft') return ctl.runnerPrev();
        if (s.overlay === 'tour' && !['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
          ctl.runnerSkip();
          if (e.key.length === 1 && !typing) document.getElementById('y-input')?.focus();
        }
        return;
      }
      if (typing) return;
      if (e.key === 'Enter' && s.overlay === 'none' && ctl.pacing() && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        ctl.advance();
      } else if (e.key === '/' && s.overlay === 'none') {
        e.preventDefault();
        document.getElementById('y-input')?.focus();
      } else if (e.key === '?' && s.overlay === 'none') {
        e.preventDefault();
        void ctl.say('help');
      } else if (s.overlay === 'none' && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== ' ') {
        // typing anywhere goes to the bar
        document.getElementById('y-input')?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // A click anywhere during the tour skips it; in step mode, a click steps;
  // otherwise a click advances a reply's turns (POLISH2 A1).
  const onStageClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    if (!ctl.runnerActive()) {
      if (ctl.pacing() && useStore.getState().overlay === 'none') ctl.advance();
      return;
    }
    const s = useStore.getState();
    if (s.runner?.stepMode) ctl.runnerNext();
    else if (s.overlay === 'tour') ctl.runnerSkip();
  };

  return (
    <div className="y-app" data-overlay={overlay} data-soundchip={soundChipVisible(sound, phase, overlay)} onClick={onStageClick}>
      <a className="y-skip" href="#y-input" onClick={(e) => { e.preventDefault(); document.getElementById('y-input')?.focus(); }}>
        {copy.a11y.skip}
      </a>
      <TopBar voiceSupported={voiceSupported} />
      {/* landmarks (POLISH2 A7): the swarm is decoration inside main; the words are mirrored in the live region */}
      <main className="y-main">
        <div ref={bodyRef} className="y-canvas" role="presentation" />
        <div className="y-stage-layer">
          <Conversation />
          <RunnerControls />
        </div>
      </main>
      <Chips />
      <SoundChip />
      <CommandBar />
      {overlay === 'card' && <Card />}
      {overlay === 'build' && <BuildFrame />}
      {overlay === 'contact' && <Contact />}
      {overlay === 'game' && <GameModal />}
      {overlay === 'history' && <History />}
      <LiveRegion />
    </div>
  );
}
