// Orchestrates SPEC §2.1 (entry), §2.2 (idle → tour), global keys, pointer,
// stage layout and the overlays. Everything stateful goes through ctl/store.
import { useEffect, useRef, useState } from 'react';
import type { Rect } from '@yoyo/protocol';
import { createBrain, readSharedFromHash } from './agent';
import { ENTRY_CHIPS } from './content/chips';
import { copy } from './content/copy';
import { ctl } from './controller';
import { isMobileViewport, prefersReducedMotion } from './design';
import { useStore } from './state/store';
import { createSwarm } from './swarm';
import { BuildFrame } from './ui/BuildFrame';
import { Card } from './ui/Card';
import { Chips, SoundChip } from './ui/Chips';
import { CommandBar } from './ui/CommandBar';
import { Contact } from './ui/Contact';
import { Conversation, RunnerControls } from './ui/Conversation';
import { GameModal } from './ui/GameModal';
import { History, LiveRegion } from './ui/History';
import { createSound } from './ui/sound';
import { TopBar } from './ui/TopBar';
import { createVoice } from './ui/voice';

const IDLE_MS = 4000;
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Where shapes should form: right of the words on desktop, above them on mobile. */
function stageRect(): Rect {
  const w = innerWidth;
  const h = innerHeight;
  if (isMobileViewport()) return { x: 16, y: 64, w: w - 32, h: Math.max(180, h * 0.36) };
  const x = w * 0.6;
  return { x, y: 72, w: w - x - 40, h: h - 72 - 200 };
}

const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const [voiceSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);

  // ---- boot: swarm, brain, sound, voice; then the entry -------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = useStore.getState();
    const reduced = prefersReducedMotion();
    st.setReducedMotion(reduced);
    const params = new URLSearchParams(location.search);
    const speed = Number(params.get('speed') ?? '1') || 1; // QA only: ?speed=0.2 runs timings 5× faster
    const brain = createBrain({ agentUrl: import.meta.env.VITE_AGENT_URL as string | undefined, speed });
    const sound = createSound();
    const voice = createVoice();
    let cancelled = false;
    let swarm: Awaited<ReturnType<typeof createSwarm>> | null = null;

    void (async () => {
      swarm = await Promise.resolve(createSwarm(canvas));
      if (cancelled) {
        swarm.destroy();
        return;
      }
      ctl.init({ swarm, brain, sound, voice });
      const scene = params.get('scene') === 'light' ? 'light' : 'dark';
      ctl.setScene(scene);
      swarm.setStage?.(stageRect());
      if (reduced) swarm.mood('asleep');

      // memory
      const before = brain.memory.recordVisit();
      const name = brain.memory.name();
      const returning = before > 0;
      st.setVisitor({ name, returning, visits: before + 1 });
      if (brain.memory.voice()) st.setVoice(true);
      const soundWanted = brain.memory.sound();

      // shared build link (#b=...)
      const shared = await readSharedFromHash();

      // ---- entry (SPEC §2.1)
      st.setPhase('entry');
      const nameLine = setTimeout(() => useStore.getState().setEntryName(copy.entry.nameLine), reduced ? 0 : 1100);
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
      if (returning) {
        const last = brain.memory.builds()[0];
        line = name ? copy.entry.welcomeBack(name) : copy.entry.welcomeBackAnon;
        if (last) line += ` ${copy.entry.lastBuild(last.title.toLowerCase())}`;
      }
      useStore.getState().setChips(ENTRY_CHIPS);
      await ctl.speakLine(line);
      useStore.getState().touch();
    })();

    return () => {
      cancelled = true;
      swarm?.destroy();
    };
  }, []);

  // ---- stage layout --------------------------------------------------------
  useEffect(() => {
    const onResize = () => ctl.swarm?.setStage?.(stageRect());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  // ---- pointer → swarm (and sound energy) ----------------------------------
  useEffect(() => {
    let lx = 0;
    let ly = 0;
    let lt = performance.now();
    const move = (e: PointerEvent) => {
      const t = performance.now();
      const dt = Math.max(1, t - lt) / 1000;
      const vx = (e.clientX - lx) / dt;
      const vy = (e.clientY - ly) / dt;
      lx = e.clientX;
      ly = e.clientY;
      lt = t;
      ctl.swarm?.pointer(e.clientX, e.clientY, vx, vy);
      ctl.energy(Math.min(1, Math.hypot(vx, vy) / 3000));
    };
    addEventListener('pointermove', move, { passive: true });
    return () => removeEventListener('pointermove', move);
  }, []);

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
        if (s.overlay !== 'none' || ctl.runnerActive()) {
          e.preventDefault();
          ctl.closeOverlay();
        }
        return;
      }
      // Runner: ←/→ navigate, any other key skips the tour
      if (ctl.runnerActive()) {
        if (e.key === 'ArrowRight') return ctl.runnerNext();
        if (e.key === 'ArrowLeft') return ctl.runnerPrev();
        if (s.overlay === 'tour' && !['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
          ctl.runnerSkip();
          if (e.key.length === 1 && !typing) document.getElementById('y-input')?.focus();
        }
        return;
      }
      if (typing) return;
      if (e.key === '/' && s.overlay === 'none') {
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

  // A click anywhere during the tour skips it; in step mode, a click steps.
  const onStageClick = (e: React.MouseEvent) => {
    if (!ctl.runnerActive()) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input')) return;
    const s = useStore.getState();
    if (s.runner?.stepMode) ctl.runnerNext();
    else if (s.overlay === 'tour') ctl.runnerSkip();
  };

  return (
    <div className="y-app" data-overlay={overlay} onClick={onStageClick}>
      <a className="y-skip" href="#y-input" onClick={(e) => { e.preventDefault(); document.getElementById('y-input')?.focus(); }}>
        {copy.a11y.skip}
      </a>
      <canvas ref={canvasRef} className="y-canvas" aria-label={copy.a11y.swarm} role="img" />
      <TopBar voiceSupported={voiceSupported} />
      <main className="y-main">
        <Conversation />
        <RunnerControls />
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
