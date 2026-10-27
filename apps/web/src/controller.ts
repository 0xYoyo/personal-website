// The conductor: the only module that talks to the swarm, the brain, sound and
// voice. UI components call `ctl.*`; state lives in the zustand store.
import type { Action, ProjectId, Rect, ShapeSpec, StoryId } from '@yoyo/protocol';
import { PROJECT_IDS } from '@yoyo/protocol';
import { BrainError, type Brain, type ReplyHandlers } from './agent';
import { BUILD_CHIPS, ENTRY_CHIPS, ROCKET_CHIP, WHO_CHIPS, STORY_CHIPS, changeIntent, projectChips, resolveChip, rocketChips } from './content/chips';
import { copy } from './content/copy';
import { neighbour, projectById } from './content/projects';
import { nextStory, stories, storyById } from './content/stories';
import { SHOW_LINES, showSteps } from './content/show';
import { applyScene, isMobileViewport } from './design';
import { emptyBuild, useStore, type Overlay } from './state/store';
import type { SwarmHandle } from './swarm';
import { createRunner, type Runner, type Step } from './ui/runner/engine';
import { markShowSeen } from './state/visit';
import type { Scene } from '@yoyo/protocol';
import type { Sound } from './ui/sound';
import { createChannel, createPacer, readLeft, stripMarks, TURN_WORD_MS, type Pacer, type TurnFit } from './ui/turns';
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
let lockTimer: ReturnType<typeof setTimeout> | null = null;
/** A shape the agent formed holds at least this long (POLISH1 A5). */
const READ_FLOOR = 4000;
/** "Now a rocket" has been offered this visit (FIX4 U6). */
let rocketOffered = false;
/** Bumped by every turn; a pending "let the shape go" from an older turn checks it. */
let settleSeq = 0;

/** How long the flock gathers at the stage centre after an overlay closes, before it is let go (POLISH2 A2). */
export const GATHER_MS = 800;
/** Bumped whenever something new takes the body; a pending post-overlay release checks it. */
let bodySeq = 0;
/** App pushes the stage and keep-outs; `restored`: count the conversation and chips even while they are still hidden. */
let stageHook: ((restored: boolean) => void) | null = null;

type Body = SwarmHandle & { gather?: (ms: number) => Promise<void> };
type FrameFn = (rect: Rect, progress: number, opts?: { dim?: boolean }) => void;
/** The engine can gather the flock and hold a dim frame (POLISH2 B3). */
const canGather = (sw: SwarmHandle | null): sw is Body & { gather: (ms: number) => Promise<void> } => typeof (sw as Body | null)?.gather === 'function';

/**
 * A card, the game or a build closed (POLISH2 A2): the restored reply's keep-outs go in first, the
 * flock gathers at the stage centre (so it never crosses the words or the bar), and only then is it
 * let go. The chips — and the bar, if the overlay covered it — come back once the outline is gone.
 */
function settleBody(barCovered: boolean, after?: () => void) {
  const sw = swarm();
  const seq = ++bodySeq;
  stageHook?.(true);
  S().setSettling(barCovered ? 'all' : 'chips');
  const done = () => {
    if (seq !== bodySeq) return;
    S().setSettling('');
    after?.();
  };
  if (canGather(sw)) {
    void sw.gather(GATHER_MS).then(() => {
      if (seq === bodySeq && S().overlay === 'none' && !runner?.running()) sw.release();
      done();
    });
  } else {
    sw?.release();
    setTimeout(done, GATHER_MS);
  }
}
/** Something new takes the body: a pending post-overlay release must not undo it. */
const claimBody = () => {
  bodySeq++;
  if (S().settling) S().setSettling('');
};

// ---- turns (POLISH2 A1) -------------------------------------------------------
/** Sizes a whole turn on the conversation's hidden clone (registered by Conversation). */
let measureFn: ((text: string) => TurnFit | null) | null = null;
/** The turn on screen, shared by every pacer so a UI line still honours its read time. */
const channel = createChannel();
const pacers = new Set<Pacer>();

/** Two frames after a store change the words are on screen (a hidden tab: a second at most). */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') return resolve();
    const t = setTimeout(resolve, 1000);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(t);
        resolve();
      }),
    );
  });
}

/**
 * A pacer that shows its turns in the conversation: one agent line per turn,
 * sized once, words streamed in, the reply's `streaming` flag held until the
 * last turn is on screen.
 */
function turnPacer(opts: { onBegin?: () => void } = {}): Pacer {
  let id = -1; // this pacer's line: two pacers never write into each other's turn
  const p = createPacer(
    {
      begin(t) {
        opts.onBegin?.();
        id = S().startAgent({ ...(t.px ? { size: t.px } : {}), full: t.text });
        if (S().voice) rt.voice?.speak(t.text, pulseWord);
      },
      word(w) {
        S().appendAgentWord(w, id);
        pulseWord();
      },
      end() {
        S().finishAgent({ keepStreaming: true, id });
      },
    },
    {
      measure: (text) => measureFn?.(text) ?? { px: 0, fits: true },
      pace: S().reducedMotion ? 0 : TURN_WORD_MS,
      channel,
      painted,
    },
  );
  pacers.add(p);
  S().setStreaming(true);
  return p;
}

/** The pacer is done (or cancelled): drop it; the bar's hairline goes when the last one does. */
function retire(p: Pacer) {
  if (!pacers.delete(p)) return;
  if (!pacers.size) S().setStreaming(false);
}

/** Overlay-opening actions wait until the line has been said. */
const DEFERRED = new Set<Action['type']>(['show', 'play', 'story', 'tour', 'build', 'contact']);

function swarm(): SwarmHandle | null {
  return rt.swarm;
}

function pulseWord() {
  swarm()?.pulse(0.55);
  rt.sound?.tick();
}

/** Say a fixed agent line (UI-originated) as its own turn(s); resolves once it is on screen. */
async function speakLine(text: string): Promise<void> {
  const p = turnPacer();
  p.line(text);
  try {
    await p.close();
  } finally {
    retire(p);
  }
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
      if (st.overlay === 'none' || st.overlay === 'contact') {
        claimBody();
        swarm()?.become(a.shape);
      }
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

/** A show step's scene, laid out for the swarm's free stage (the viewport when the engine has no stage). */
function resolveScene(s: Step['perform']): Scene | null {
  if (!s) return null;
  if (typeof s !== 'function') return s;
  const box = swarm()?.stageBox?.() ?? { x: 0, y: 0, ...vp() };
  return s({ w: box.w, h: box.h });
}

/** The show was stopped by a message or a chip: the swarm morphs from the scene straight into the reply. */
let keepBodyOnSkip = false;
/** Stop a running show / story for an answer (no release: the reply's shape takes the body from where it is). */
function skipForAnswer() {
  if (!runner?.running()) return;
  keepBodyOnSkip = true;
  try {
    runner.skip();
  } finally {
    keepBodyOnSkip = false;
  }
}

function startRunner(kind: 'tour' | 'stories', steps: Step[], storyOf?: (i: number) => StoryId) {
  closeAll();
  runner?.skip();
  claimBody();
  const st = S();
  st.openOverlay(kind);
  // the show keeps the chips (and the bar) up the whole time: any of them stops it and answers (wave 3 SHOW)
  if (kind !== 'tour') st.setChips([]);
  let say = '';
  let lead = '';
  let storyId: StoryId | undefined;
  let beatNo = 0;
  /** the chips the run's last chip-setting step offered (the tour's end chips) */
  let endChips: string[] | null = null;
  const stepMode = st.reducedMotion;
  const view = () => S().setRunner({ kind, storyId, say, lead, beat: beatNo, beats: r.beats(), stepMode });
  const r = createRunner(
    steps,
    {
      // the shape goes first …
      onStep(step, i, beat) {
        beatNo = beat;
        const shape = resolveShape(step.become);
        if (shape) swarm()?.become(shape);
        const scene = resolveScene(step.perform);
        const body = swarm();
        if (scene && body) {
          if (body.perform) void body.perform(scene);
          else {
            // an engine without groups: the scene's first shape stands in for it
            const g = scene.groups[0]?.shape;
            if (g && g.kind !== 'bar' && g.kind !== 'rect' && g.kind !== 'parts') body.become(g);
          }
        }
        if (step.release) swarm()?.release();
        if (step.mood) swarm()?.mood(step.mood);
        if (step.chips) {
          S().setChips(step.chips);
          endChips = step.chips;
        }
        storyId = storyOf?.(i);
        if (storyId) rt.brain?.memory.markStory(storyId);
        view();
      },
      // … and the caption lands once it has knitted
      onSay(step, _i, beat) {
        beatNo = beat;
        say = step.say ?? say;
        lead = step.lead ?? '';
        pulseWord();
        if (S().voice) rt.voice?.speak(say, pulseWord);
        view();
      },
      onEnd(reason) {
        if (runner !== r) return;
        runner = null;
        const s2 = S();
        const lastSay = say;
        const forAnswer = reason === 'skip' && keepBodyOnSkip;
        // the show never hands the words back to the greeting (FIX4 W1, W8): its caption rests where it is (the
        // same key, so it is not typed again) — skipped, it jumps to its end line — and History keeps it.
        // Stopped by a message or a chip, nothing shows until the reply's first word (visibleExchange).
        if (kind === 'tour') {
          const rest = reason === 'skip' && !forAnswer ? SHOW_LINES[SHOW_LINES.length - 1]! : lastSay;
          if (rest) s2.agentLine(rest, { quiet: true, show: true });
        } else if (lastSay && reason === 'done') s2.agentLine(lastSay, { quiet: true });
        s2.setRunner(null);
        if (s2.overlay === kind) s2.closeOverlay();
        // stopped for an answer: the reply's shape morphs straight from the scene (no release burst)
        if (!forAnswer) {
          // the keep-outs go in first, so a reduced-motion field rests off the words and chips (FIX4 W3)
          stageHook?.(false);
          swarm()?.release();
          swarm()?.mood('idle');
        }
        // a show that ran to its end keeps its own end chips; skipped, the entry three return (WAVE3 S1);
        // stopped by a chip or a message, the answer sets its own
        if (!forAnswer) {
          const next = kind === 'stories' ? STORY_CHIPS : reason === 'done' && endChips ? endChips : ENTRY_CHIPS;
          // the same row already up (the show's end chips): leave it, so it does not pop in again (FIX4 W8)
          if (next.join('|') !== S().chips.join('|')) s2.setChips(next);
        }
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
    // a build is open: "change it" / "make it dark" edits it (FIX4 U1)
    const edit = changeIntent(clean, st.overlay === 'build' && st.build.status === 'locked' && !!st.build.html);
    if (edit === 'begin') return ctl.beginChange();
    if (edit === 'apply') return ctl.changeBuild(clean);
    // typed with a card or contact open (the bar stays up over them, FIX4 U2): the answer needs the words
    if (st.overlay === 'card' || st.overlay === 'contact') closeAll();
    skipForAnswer();
    turn?.abort();
    for (const p of pacers) p.cancel();
    S().finishAgent({ keepStreaming: true }); // a turn cut short rests as far as it got
    // the visitor moved on: the next turn does not wait for the one on screen
    channel.last = null;
    deferred = [];
    const ac = new AbortController();
    turn = ac;
    st.pushVisitor(clean);
    settleSeq++;
    swarm()?.mood('thinking');
    st.setMood('thinking');
    let lastTurn = '';
    const pacer = turnPacer({
      onBegin() {
        if (S().mood === 'thinking') {
          swarm()?.mood('speaking');
          S().setMood('speaking');
        }
      },
    });
    ac.signal.addEventListener('abort', () => pacer.cancel(), { once: true });
    let chipsSet = false;
    let opened: ProjectId | null = null;
    // the rocket chip follows a spelled name, once, and never the rocket itself (FIX4 U6)
    let spelled = false;
    let rocket = false;
    // `onTurn` is the brain's turn boundary (POLISH2 C1); until it lands, `||` in the words marks the turns
    const handlers: ReplyHandlers & { onTurn?(): void } = {
      onWord(w) {
        pacer.push(w);
      },
      onTurn() {
        pacer.boundary();
      },
      onAction(a) {
        if (a.type === 'become') {
          if (a.shape.kind === 'text') spelled = true;
          if (a.shape.kind === 'emoji' && a.shape.emoji === '🚀') rocket = true;
        }
        if (a.type === 'chips') {
          chipsSet = true;
          const chips = rocketChips(a.chips, { spelled, rocket, offered: rocketOffered });
          if (chips.includes(ROCKET_CHIP)) rocketOffered = true;
          a = { ...a, chips };
        }
        if (a.type === 'show') opened = a.project;
        if (DEFERRED.has(a.type)) deferred.push(a);
        else runAction(a);
      },
      onNotice(t) {
        pacer.line(t);
      },
    };
    try {
      const reply = await rt.brain.send(clean, handlers, ac.signal);
      if (turn !== ac) return;
      const text = stripMarks(reply.text);
      lastTurn = text;
      // every turn on screen, in order, each after the previous one's read time
      await pacer.close();
      retire(pacer);
      if (turn !== ac) return;
      lastTurn = [...S().lines].reverse().find((l) => l.role === 'agent')?.text ?? lastTurn;
      S().setMood('idle');
      // The last turn rests on screen; keep its shape up while it is read (300 ms a word),
      // and never less than 4 s after it lands — reduced motion too.
      const readMs = Math.max(READ_FLOOR, lastTurn.split(/\s+/).length * 300);
      const seq = ++settleSeq;
      setTimeout(() => {
        if (seq !== settleSeq || turn || S().overlay !== 'none' || runner?.running()) return;
        swarm()?.mood('idle');
      }, readMs);
      // the rocket is up: its chip goes from the row the reply left (it set none of its own)
      if (rocket && S().chips.includes(ROCKET_CHIP)) S().setChips(rocketChips(S().chips, { spelled, rocket, offered: true }));
      if (!chipsSet) {
        if (opened) S().setChips(projectChips(opened));
        else if (/who/i.test(clean) && !deferred.length) S().setChips(WHO_CHIPS);
      }
      const queue = deferred;
      deferred = [];
      if (queue.length) {
        // let the line land before an overlay takes the stage
        await sleep(text ? Math.min(1400, 500 + lastTurn.split(' ').length * 40) : 0);
        if (turn !== ac) return;
        for (const a of queue) {
          if (a.type !== 'show') runAction(a);
          // the reply's own chips stay until its last turn has been read, then the card's (FIX4 U3)
          else ctl.openProject(a.project, chipsSet ? { chipsAfter: readLeft(channel, performance.now()) } : {});
        }
      }
    } catch (e) {
      if (e instanceof BrainError && e.reason === 'aborted') return;
      // whatever arrived before the failure is still said
      await pacer.close();
      swarm()?.mood('idle');
    } finally {
      retire(pacer);
      if (turn === ac) turn = null;
    }
  },

  /** A click or Enter: the turn on screen has been read — the next one now (POLISH2 A1). */
  advance() {
    for (const p of pacers) p.advance();
  },
  /** Whether a reply is still pacing its turns (Enter on an empty bar advances it). */
  pacing: () => pacers.size > 0,
  /** Conversation registers the hidden clone each turn is sized on. */
  setMeasure(fn: ((text: string) => TurnFit | null) | null) {
    measureFn = fn;
  },

  chip(label: string) {
    const st = S();
    st.touch();
    st.spendIdle();
    skipForAnswer();
    const cmd = resolveChip(label, { project: st.project, name: st.visitor.name ?? rt.brain?.memory.name(), hasBuild: !!st.build.html, hasStoredBuild: !!rt.brain?.memory.builds().some((b) => b.html) });
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
      case 'open-build':
        ctl.openStoredBuild();
        break;
      case 'become':
        S().pushVisitor(cmd.text);
        claimBody();
        swarm()?.become(cmd.shape);
        void speakLine('done.');
        break;
      case 'ask-name':
        // one line everywhere (FIX4 U6)
        S().pushVisitor(label);
        claimBody();
        swarm()?.become({ kind: 'glyph', id: 'question' });
        void speakLine(copy.askName);
        break;
    }
  },

  dispatch: runAction,

  become(shape: ShapeSpec) {
    claimBody();
    swarm()?.become(shape);
  },
  /** App's stage push (keep-outs), so a closing overlay can place them before the flock moves. */
  onStage(fn: ((restored: boolean) => void) | null) {
    stageHook = fn;
  },

  // ---- projects ------------------------------------------------------------
  /** `chipsAfter`: a reply opened the card and its chips stay this many ms more before the card's take over. */
  openProject(id: ProjectId, opts: { chipsAfter?: number } = {}) {
    claimBody();
    closeAll('card');
    S().showProject(id);
    if (opts.chipsAfter === undefined) return S().setChips(projectChips(id));
    const key = S().chipsKey;
    setTimeout(() => {
      const s = S();
      // unless something else has set the chips (or the card moved on / closed) in the meantime
      if (s.chipsKey === key && s.overlay === 'card' && s.project === id) s.setChips(projectChips(id));
    }, opts.chipsAfter);
  },
  nextProject(dir: 1 | -1) {
    const cur = S().project;
    // no card open yet: "next" starts at the first project (Unfiltered), not a neighbour of it
    ctl.openProject(cur ? neighbour(cur, dir).id : PROJECT_IDS[0]);
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
    swarm()?.mood('idle');
    if (was === 'card' || was === 'game' || was === 'build') {
      // the game covers the bar; a card (the phone's sheet too, FIX4 U2) and the build frame don't
      const covered = was === 'game';
      const chips = was === 'card' ? ENTRY_CHIPS : was === 'game' ? ['Next one', 'Who are you?', 'What have you built?'] : null;
      if (chips) S().setChips([]);
      settleBody(covered, () => chips && S().setChips(chips));
    } else {
      swarm()?.release();
    }
  },
  play() {
    claimBody();
    closeAll('game');
    S().openOverlay('game');
    swarm()?.mood('asleep');
  },
  contact() {
    claimBody();
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
    claimBody();
    closeAll();
    const st = S();
    st.setBarMode('chat');
    swarm()?.release();
    swarm()?.mood('idle');
    st.setChips(ENTRY_CHIPS);
  },

  // ---- the show (wave 3; `[[tour]]`, "tour", "show me around", "watch again") & stories ----
  startTour() {
    markShowSeen(); // once a visit by itself (FIX4 W10)
    startRunner('tour', showSteps(S().reducedMotion));
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
    claimBody();
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
    let html = '';
    // progress = bytes / expected, expected = max(8 kB, the previous build's size); ≤ 0.95 until done
    const fallbackExpected = buildExpected(opts.previousHtml ?? brain.memory.builds()[0]?.html);
    let said: Promise<void> = Promise.resolve();
    try {
      const res = await brain.build(
        instruction,
        {
          onChunk(chunk, bytes, exp) {
            html += chunk;
            const expected = exp ?? fallbackExpected;
            S().patchBuild({ status: 'streaming', html, bytes, expected, progress: buildProgress(bytes, expected) });
          },
          // "on it." only once the builder has actually taken the request (POLISH1 C5)
          onAccepted() {
            if (buildAbort === ac) said = said.then(() => speakLine(copy.build.onIt));
          },
          onNotice(text) {
            if (buildAbort === ac) said = said.then(() => speakLine(text));
          },
        },
        { signal: ac.signal, ...(opts.previousHtml ? { previousHtml: opts.previousHtml } : {}) },
      );
      if (buildAbort !== ac) return;
      const seconds = Math.max(1, Math.round(res.ms / 1000));
      if (res.unchanged) {
        // scripted "Change it" to the example already on screen: nothing re-streams, no re-lock, no new build
        S().patchBuild({ status: 'locked', html: res.html, bytes: res.bytes, progress: 1, title: res.title });
      } else {
        S().patchBuild({ status: 'locked', html: res.html, bytes: res.bytes, progress: 1, seconds, title: res.title });
        rt.sound?.thump();
        swarm()?.pulse(1);
        brain.memory.addBuild({ title: res.title, instruction, html: res.html });
      }
      // after the lock flash the outline thins to a dim border (BuildFrame reports the rect → holdLockedFrame)
      await said;
      await speakLine(res.line || copy.build.done(seconds));
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
      S().setChips(['Build me something', 'Who are you?', 'What have you built?']);
    } finally {
      if (buildAbort === ac) buildAbort = null;
    }
  },
  /** Reopen the visitor's last build from memory (returning visitor chip, POLISH1 A6). */
  openStoredBuild() {
    const last = rt.brain?.memory.builds().find((b) => b.html);
    if (!last) return;
    claimBody();
    closeAll('build');
    const st = S();
    st.patchBuild({ ...emptyBuild, status: 'locked', instruction: last.instruction, html: last.html, bytes: last.html.length, progress: 1, title: last.title });
    st.openOverlay('build');
    st.setChips(BUILD_CHIPS);
  },
  stopBuild: () => stopBuild(false),
  buildFrameProgress(rect: Rect, progress: number) {
    lastBuildRect = rect;
    swarm()?.buildFrame(rect, progress);
  },
  /**
   * The frame locked (or a stored / shared build opened locked): after the lock flash the outline
   * thins to a dim border around it and the rest of the flock idles off the frame (POLISH2 A4).
   * Engines without the dim frame: desktop lets go; on a phone the full outline stays (a free flock
   * would roost over the frame's header and the top bar).
   */
  holdLockedFrame(rect: Rect) {
    lastBuildRect = rect;
    if (lockTimer) clearTimeout(lockTimer);
    const seq = bodySeq;
    lockTimer = setTimeout(() => {
      lockTimer = null;
      const sw = swarm();
      if (seq !== bodySeq || S().overlay !== 'build' || S().build.status !== 'locked' || !sw) return;
      if (canGather(sw)) (sw.buildFrame as FrameFn).call(sw, rect, 1, { dim: true });
      else if (!isMobileViewport()) sw.release();
      else sw.buildFrame(rect, 1);
      sw.mood('idle');
    }, 650);
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

/** Bytes a build is expected to reach: the previous build's size, at least 8 kB. */
export const buildExpected = (previousHtml?: string): number => Math.max(8192, previousHtml?.length ?? 0);
/** Build progress while streaming: bytes / expected, held at ≤ 0.95 until the build is done. */
export const buildProgress = (bytes: number, expected: number): number => Math.max(0, Math.min(0.95, bytes / expected));

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
