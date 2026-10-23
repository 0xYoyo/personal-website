// The conductor: the only module that talks to the swarm, the brain, sound and
// voice. UI components call `ctl.*`; state lives in the zustand store.
import type { Action, ProjectId, Rect, ShapeSpec, StoryId } from '@yoyo/protocol';
import { BrainError, type Brain } from './agent';
import { BUILD_CHIPS, ENTRY_CHIPS, WHO_CHIPS, STORY_CHIPS, projectChips, resolveChip } from './content/chips';
import { copy } from './content/copy';
import { neighbour, projectById } from './content/projects';
import { nextStory, stories, storyById } from './content/stories';
import { tour } from './content/tour';
import { applyScene } from './design';
import { useStore, type Overlay } from './state/store';
import type { SwarmHandle } from './swarm';
import { createRunner, type Runner, type Step } from './ui/runner/engine';
import type { Sound } from './ui/sound';
import type { Voice } from './ui/voice';

interface Runtime {
  swarm: SwarmHandle | null;
  brain: Brain | null;
  sound: Sound | null;
  voice: Voice | null;
}
const rt: Runtime = { swarm: null, brain: null, sound: null, voice: null };

const S = () => useStore.getState();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const vp = () => ({ w: innerWidth, h: innerHeight });

let turn: AbortController | null = null;
let buildAbort: AbortController | null = null;
let runner: Runner | null = null;
let deferred: Action[] = [];
let lastBuildRect: Rect | null = null;

/** Overlay-opening actions wait until the line has been said. */
const DEFERRED = new Set<Action['type']>(['show', 'play', 'story', 'tour', 'build', 'contact']);

function swarm(): SwarmHandle | null {
  return rt.swarm;
}

function pulseWord() {
  swarm()?.pulse(0.55);
  rt.sound?.tick();
}

/** Stream a fixed agent line into the conversation (UI-originated lines). */
async function speakLine(text: string, opts: { pace?: number } = {}): Promise<void> {
  const st = S();
  st.startAgent();
  const pace = st.reducedMotion ? 0 : opts.pace ?? 70;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    S().appendAgentWord(w);
    pulseWord();
    if (pace) await sleep(pace);
  }
  S().finishAgent();
  if (S().voice) rt.voice?.speak(text, pulseWord);
}

function closeAll(except?: Overlay) {
  const st = S();
  if (runner?.running() && except !== 'tour' && except !== 'stories') {
    runner.skip();
  }
  if (st.overlay !== 'none' && st.overlay !== except) {
    if (st.overlay === 'build') stopBuild(true);
    st.closeOverlay();
    swarm()?.release();
  }
}

function runAction(a: Action) {
  const st = S();
  switch (a.type) {
    case 'become':
      if (st.overlay === 'none' || st.overlay === 'contact') swarm()?.become(a.shape);
      break;
    case 'mood':
      swarm()?.mood(a.mood);
      st.setMood(a.mood);
      if (a.mood === 'celebrate') rt.sound?.chord();
      break;
    case 'chips':
      st.setChips(a.chips);
      break;
    case 'lights':
      ctl.setScene(a.mode === 'toggle' ? (st.scene === 'dark' ? 'light' : 'dark') : a.mode);
      break;
    case 'show':
      ctl.openProject(a.project);
      break;
    case 'play':
      ctl.play();
      break;
    case 'story':
      ctl.startStory(a.id);
      break;
    case 'tour':
      ctl.startTour();
      break;
    case 'build':
      void ctl.startBuild(a.instruction, { announce: false });
      break;
    case 'contact':
      ctl.contact();
      break;
  }
}

function resolveShape(s: Step['become']): ShapeSpec | null {
  if (!s) return null;
  return typeof s === 'function' ? s(vp()) : s;
}

function startRunner(kind: 'tour' | 'stories', steps: Step[], storyOf?: (i: number) => StoryId) {
  closeAll();
  runner?.skip();
  const st = S();
  st.openOverlay(kind);
  st.setChips([]);
  let say = '';
  let sub = '';
  const stepMode = st.reducedMotion;
  const r = createRunner(
    steps,
    {
      onStep(step, i, beat) {
        if (step.say !== undefined) {
          say = step.say;
          sub = '';
          pulseWord();
          if (S().voice) rt.voice?.speak(step.say, pulseWord);
        }
        if (step.sub !== undefined) sub = step.sub;
        const shape = resolveShape(step.become);
        if (shape) swarm()?.become(shape);
        if (step.release) swarm()?.release();
        if (step.mood) swarm()?.mood(step.mood);
        if (step.chips) S().setChips(step.chips);
        const storyId = storyOf?.(i);
        if (storyId) rt.brain?.memory.markStory(storyId);
        S().setRunner({ kind, storyId, say, sub, beat, beats: r.beats(), stepMode });
      },
      onEnd(reason) {
        if (runner !== r) return;
        runner = null;
        const s2 = S();
        const lastSay = say;
        s2.setRunner(null);
        if (s2.overlay === kind) s2.closeOverlay();
        swarm()?.release();
        swarm()?.mood('idle');
        // the last line stays in the conversation so the screen isn't empty
        if (lastSay && reason === 'done') s2.agentLine(lastSay);
        s2.setChips(kind === 'stories' ? STORY_CHIPS : ENTRY_CHIPS);
      },
    },
    { stepMode },
  );
  runner = r;
  r.start();
}

export const ctl = {
  init(r: Partial<Runtime>) {
    Object.assign(rt, r);
  },
  get swarm() {
    return rt.swarm;
  },
  get brain() {
    return rt.brain;
  },
  speakLine,

  /** A visitor message: echo it, stream the reply, run its actions. */
  async say(text: string) {
    const clean = text.trim();
    if (!clean || !rt.brain) return;
    const st = S();
    st.touch();
    st.spendIdle();
    if (runner?.running()) runner.skip();
    turn?.abort();
    deferred = [];
    const ac = new AbortController();
    turn = ac;
    st.pushVisitor(clean);
    swarm()?.mood('thinking');
    st.setMood('thinking');
    let started = false;
    const ensureLine = () => {
      if (!started) {
        started = true;
        S().startAgent();
        swarm()?.mood('speaking');
        S().setMood('speaking');
      }
    };
    let chipsSet = false;
    let opened: ProjectId | null = null;
    try {
      const reply = await rt.brain.send(
        clean,
        {
          onWord(w) {
            ensureLine();
            S().appendAgentWord(w);
            pulseWord();
          },
          onAction(a) {
            if (a.type === 'chips') chipsSet = true;
            if (a.type === 'show') opened = a.project;
            if (DEFERRED.has(a.type)) deferred.push(a);
            else runAction(a);
          },
          onNotice(t) {
            S().agentLine(t);
          },
        },
        ac.signal,
      );
      if (turn !== ac) return;
      S().finishAgent();
      swarm()?.mood('idle');
      S().setMood('idle');
      if (reply.text && S().voice) rt.voice?.speak(reply.text, pulseWord);
      if (!chipsSet) {
        if (opened) S().setChips(projectChips(opened));
        else if (/who/i.test(clean) && !deferred.length) S().setChips(WHO_CHIPS);
      }
      const queue = deferred;
      deferred = [];
      if (queue.length) {
        // let the line land before an overlay takes the stage
        await sleep(reply.text ? Math.min(1400, 500 + reply.text.split(' ').length * 40) : 0);
        if (turn !== ac) return;
        queue.forEach(runAction);
      }
    } catch (e) {
      if (e instanceof BrainError && e.reason === 'aborted') return;
      S().finishAgent();
      swarm()?.mood('idle');
    } finally {
      if (turn === ac) turn = null;
    }
  },

  chip(label: string) {
    const st = S();
    st.touch();
    st.spendIdle();
    const cmd = resolveChip(label, { project: st.project, name: st.visitor.name ?? rt.brain?.memory.name(), hasBuild: !!st.build.html });
    switch (cmd.kind) {
      case 'say':
        void ctl.say(cmd.text);
        break;
      case 'play':
        ctl.play();
        break;
      case 'next-project':
        ctl.nextProject(1);
        break;
      case 'build':
        void ctl.startBuild(cmd.instruction, { announce: true });
        break;
      case 'change-build':
        ctl.beginChange();
        break;
      case 'share-build':
        void ctl.shareBuild();
        break;
      case 'story-next':
        ctl.startStory('next');
        break;
      case 'sound-on':
        void ctl.setSound(true);
        break;
      case 'become':
        S().pushVisitor(cmd.text);
        swarm()?.become(cmd.shape);
        void speakLine('done.');
        break;
    }
  },

  dispatch: runAction,

  become(shape: ShapeSpec) {
    swarm()?.become(shape);
  },

  // ---- projects ------------------------------------------------------------
  openProject(id: ProjectId) {
    closeAll('card');
    S().showProject(id);
    S().setChips(projectChips(id));
  },
  nextProject(dir: 1 | -1) {
    const cur = S().project ?? 'prompt-racers';
    ctl.openProject(neighbour(cur, dir).id);
  },
  /** The open card reports its rect; the swarm holds its outline. */
  frameFor(rect: Rect) {
    swarm()?.buildFrame(rect, 1);
  },

  // ---- overlays ------------------------------------------------------------
  closeOverlay() {
    const st = S();
    if (runner?.running()) {
      runner.skip();
      return;
    }
    if (st.overlay === 'none') return;
    const was = st.overlay;
    if (was === 'build') stopBuild(true);
    st.closeOverlay();
    swarm()?.release();
    swarm()?.mood('idle');
    if (was === 'card') st.setChips(ENTRY_CHIPS);
    if (was === 'game') st.setChips(['Next one', 'Who is Yoyo?', 'Build me something']);
  },
  play() {
    closeAll('game');
    S().openOverlay('game');
    swarm()?.mood('asleep');
  },
  contact() {
    closeAll('contact');
    S().openOverlay('contact');
    swarm()?.become({ kind: 'glyph', id: 'envelope' });
    setTimeout(() => {
      if (S().overlay === 'contact') swarm()?.become({ kind: 'glyph', id: 'envelope-open' });
    }, S().reducedMotion ? 0 : 900);
  },
  history() {
    closeAll('history');
    S().openOverlay(S().overlay === 'history' ? 'none' : 'history');
  },
  home() {
    turn?.abort();
    closeAll();
    const st = S();
    st.setBarMode('chat');
    swarm()?.release();
    swarm()?.mood('idle');
    st.setChips(ENTRY_CHIPS);
  },

  // ---- tour & stories ------------------------------------------------------
  startTour() {
    startRunner('tour', tour);
  },
  startStory(id: StoryId | 'next') {
    const seen = rt.brain?.memory.seenStories() ?? [];
    const story = id === 'next' ? nextStory(seen) : storyById(id);
    startRunner('stories', story.steps, () => story.id);
  },
  /** Menu "Stories": all five in a row, starting from the next unseen one. */
  startAllStories() {
    const seen = rt.brain?.memory.seenStories() ?? [];
    const first = stories.indexOf(nextStory(seen));
    const order = [...stories.slice(first), ...stories.slice(0, first)];
    const steps: Step[] = [];
    const owner: StoryId[] = [];
    let t = 0;
    for (const s of order) {
      for (const step of s.steps) {
        const isLast = step === s.steps[s.steps.length - 1];
        const { chips: _chips, ...rest } = step;
        steps.push({ ...rest, at: t + step.at, ...(isLast && s === order[order.length - 1] ? { chips: STORY_CHIPS } : {}) });
        owner.push(s.id);
      }
      t += s.steps.reduce((m, x) => Math.max(m, x.at + x.hold), 0);
    }
    startRunner('stories', steps, (i) => owner[i]!);
  },
  runnerNext: () => runner?.next(),
  runnerPrev: () => runner?.prev(),
  runnerSkip: () => runner?.skip(),
  runnerActive: () => !!runner?.running(),

  // ---- build ---------------------------------------------------------------
  async startBuild(instruction: string, opts: { announce?: boolean; previousHtml?: string } = {}) {
    const brain = rt.brain;
    if (!brain) return;
    if (brain.memory.recentBuilds().length >= 5) {
      await speakLine(copy.build.capped);
      return;
    }
    closeAll('build');
    buildAbort?.abort();
    const ac = new AbortController();
    buildAbort = ac;
    const st = S();
    st.resetBuild();
    st.patchBuild({ status: 'ring', instruction, startedAt: performance.now() });
    st.openOverlay('build');
    st.setChips([]);
    swarm()?.mood('building');
    if (opts.announce) void speakLine(copy.build.onIt);
    let html = '';
    try {
      const res = await brain.build(
        instruction,
        {
          onChunk(chunk, bytes, expected) {
            html += chunk;
            const progress = expected ? Math.min(0.98, bytes / expected) : Math.min(0.95, 1 - Math.exp(-bytes / 9000));
            S().patchBuild({ status: 'streaming', html, bytes, expected, progress });
          },
        },
        { signal: ac.signal, ...(opts.previousHtml ? { previousHtml: opts.previousHtml } : {}) },
      );
      if (buildAbort !== ac) return;
      const seconds = Math.max(1, Math.round(res.ms / 1000));
      S().patchBuild({ status: 'locked', html: res.html, bytes: res.bytes, progress: 1, seconds, title: res.title });
      rt.sound?.thump();
      swarm()?.pulse(1);
      brain.memory.addBuild({ title: res.title, instruction, html: res.html });
      setTimeout(() => {
        if (S().build.status === 'locked') {
          swarm()?.release();
          swarm()?.mood('idle');
        }
      }, 650);
      await speakLine(copy.build.done(seconds));
      S().setChips(BUILD_CHIPS);
    } catch (e) {
      if (buildAbort !== ac) return;
      const reason = e instanceof BrainError ? e.reason : 'failed';
      swarm()?.release();
      swarm()?.mood('idle');
      if (reason === 'aborted') {
        S().patchBuild({ status: html ? 'locked' : 'idle', progress: html ? 1 : 0 });
        if (!html) S().closeOverlay();
        await speakLine(copy.build.stopped);
      } else {
        S().resetBuild();
        S().closeOverlay();
        await speakLine(reason === 'cap' ? copy.build.capped : copy.build.failed);
      }
      S().setChips(['Build me something', 'Who is Yoyo?', 'What has he built?']);
    } finally {
      if (buildAbort === ac) buildAbort = null;
    }
  },
  stopBuild: () => stopBuild(false),
  buildFrameProgress(rect: Rect, progress: number) {
    lastBuildRect = rect;
    swarm()?.buildFrame(rect, progress);
  },
  get lastBuildRect() {
    return lastBuildRect;
  },
  beginChange() {
    const st = S();
    if (!st.build.html) return;
    if (st.overlay !== 'build') st.openOverlay('build');
    st.setBarMode('change');
    document.getElementById('y-input')?.focus();
  },
  async changeBuild(text: string) {
    const st = S();
    const prev = st.build.html;
    st.setBarMode('chat');
    st.pushVisitor(text);
    await ctl.startBuild(text, { announce: true, previousHtml: prev });
  },
  async shareBuild(): Promise<string | null> {
    const html = S().build.html;
    if (!html || !rt.brain) return null;
    const url = await rt.brain.share(html);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked: the URL still lands in the address bar below */
    }
    return url;
  },

  // ---- scene, sound, voice -------------------------------------------------
  setScene(mode: 'dark' | 'light') {
    S().setScene(mode);
    applyScene(mode);
    swarm()?.setScene(mode);
  },
  async setSound(on: boolean) {
    S().setSound(on);
    rt.brain?.memory.setSound(on);
    if (on) await rt.sound?.enable();
    else rt.sound?.disable();
  },
  setVoice(on: boolean) {
    S().setVoice(on);
    rt.brain?.memory.setVoice(on);
    if (!on) rt.voice?.cancel();
  },
  energy(e: number) {
    rt.sound?.energy(e);
  },
  konami() {
    swarm()?.mood('celebrate');
    rt.sound?.chord();
    setTimeout(() => {
      swarm()?.become({ kind: 'text', text: copy.konami });
      void speakLine(copy.konami);
    }, S().reducedMotion ? 0 : 3000);
  },
  projectById,
};

function stopBuild(silent: boolean) {
  if (!buildAbort) return;
  if (silent) {
    const ac = buildAbort;
    buildAbort = null;
    ac.abort();
    return;
  }
  buildAbort.abort();
}

export type Controller = typeof ctl;
