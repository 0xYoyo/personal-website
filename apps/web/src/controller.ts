// The conductor: the only module that talks to the swarm, the brain, sound and
// voice. UI components call `ctl.*`; state lives in the zustand store.
import type { Action, ProjectId, Rect, ShapeSpec, StoryId, WorkEra } from '@yoyo/protocol';
import { BrainError, type Brain, type ReplyHandlers } from './agent';
import { BUILD_CHIPS, CONTACT_CHIPS, WATCH_BUILD_CHIP, ENTRY_CHIPS, ROCKET_CHIP, WHO_CHIPS, STORY_CHIPS, changeIntent, projectChips, projectRowAfter, resolveChip, rocketChips } from './content/chips';
import { copy } from './content/copy';
import { projectById, projectsOf } from './content/projects';
import { nextStory, stories, storyById } from './content/stories';
import { SHOW_LINES, showSteps } from './content/show';
import { applyScene, isMobileViewport } from './design';
import { emptyBuild, useStore, type Overlay } from './state/store';
import type { SwarmHandle } from './swarm';
import { createRunner, type Runner, type Step } from './ui/runner/engine';
import { markShowSeen } from './state/visit';
import { meaningOf, moveChipsOn } from './state/answered';
import { classify, MY_PART, PROJECT_INTRO, specificTo } from './agent/client/intents';
import type { Scene } from '@yoyo/protocol';
import type { Sound } from './ui/sound';
import { createChannel, createPacer, readLeft, stripMarks, TURN_WORD_MS, type Pacer, type TurnFit } from './ui/turns';
import { readMs as readTime } from './ui/pace';
import type { Voice } from './ui/voice';

interface Runtime {
  swarm: SwarmHandle | null;
  brain: Brain | null;
  sound: Sound | null;
  voice: Voice | null;
}
const rt: Runtime = { swarm: null, brain: null, sound: null, voice: null };

const S = () => useStore.getState();
const vp = () => ({ w: innerWidth, h: innerHeight });

let turn: AbortController | null = null;
let buildAbort: AbortController | null = null;
let runner: Runner | null = null;
let deferred: Action[] = [];
let lastBuildRect: Rect | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
/** Contact's chips (WAVE4 U6, WAVE6 X4). */
export { CONTACT_CHIPS };
const COPIED_CHIP = 'Email copied';
/** After a build closes (WAVE4 U7). */
const AFTER_BUILD_CHIPS = BUILD_CHIPS;
/** The Work overlay's end-of-shelf link (WAVE4 U8). */
export const MORE_ON_GITHUB = 'https://github.com/0xYoyo?tab=repositories';
const K_SKIP_HINT = 'yoyo.v3.skipHint';
/**
 * The chips row a card put up, and the card (WAVE5 U3). A question asked from the card closes it, but its
 * row stays until something sets new chips: the next chip pressed from that row is still about that card.
 */
let cardRow: { project: ProjectId; key: number } | null = null;
/** Bumped by every card opened; a reply checks it before putting its end row up (a card opened meanwhile keeps its own). */
let cardSeq = 0;
/** The project a message is about: the open card, else the card whose row is still up. */
function contextProject(): ProjectId | null {
  const st = S();
  if (st.overlay === 'card') return st.project;
  return st.overlay === 'none' && cardRow && cardRow.key === st.chipsKey ? cardRow.project : null;
}
/**
 * The row a project's answer leaves once its card has closed (WAVE6 X1/X2): the card's own chips and
 * `Back to <name>`; the project stays the context ("Next one" goes on from it) while the row is up.
 */
function projectRow(id: ProjectId, asked: readonly string[] = []) {
  S().setChips(projectRowAfter(id, projectById(id).name, asked), { project: id });
  cardRow = { project: id, key: S().chipsKey };
}
const normQ = (s: string) => s.trim().toLowerCase().replace(/[?.!…]+$/, '');
/**
 * The chips of `chips` that ask what `text` asks about `project` (WAVE6 X7): the same label, or the same
 * meaning (a typed "what was hardest about it?" is the "What was the hardest part?" chip). `intent`: what
 * the reply played, for words only the router understood. Moves ("Next one", "Play it", Back) never match.
 */
function sameQuestion(chips: readonly string[], text: string, project: ProjectId, intent?: string | null): string[] {
  const k = meaningOf(text, project);
  return chips.filter((c) => {
    if (normQ(c) === normQ(text)) return true;
    const m = meaningOf(c, project);
    // the router's plain `my_part` on a card is that card's `my_part_<project>`
    const played = intent ? [`i:${intent}`, ...(intent === MY_PART ? [`i:${MY_PART}_${project}`] : [])] : [];
    return !!m && (m === k || played.includes(m));
  });
}
/** Whether a reply's intent was about `p` (WAVE6 X1): its intro, a follow-up of its own, or what I did on it. */
const aboutProject = (intent: string | null | undefined, p: ProjectId): boolean =>
  !!intent && (intent === PROJECT_INTRO[p] || intent === MY_PART || specificTo(intent, p));
/** The intent the local classifier reads in `text` asked about `project` (a live reply that names none). */
function localIntent(text: string, project: ProjectId): string | null {
  const c = classify(text, { project });
  return c.kind === 'intent' ? c.id : null;
}
/** The project the game was opened from (Prompt Racers' "Play it"): its row comes back when the game closes. */
let gameFrom: ProjectId | null = null;
/**
 * Newest click wins (WAVE6 X3). Bumped by every question and every navigation (a card, Next, ←/→, Work,
 * the era switch, Contact, History, Close, the game, a build, the show); a reply checks it before any of
 * its actions (a shape, a chips row, a card or contact it was about to open), so an older reply never
 * reopens a card or reclaims the screen once the visitor has moved on. Its words may finish.
 */
let navSeq = 0;
function moveOn() {
  navSeq++;
  deferred = [];
  // a reply holding its last turn before an overlay: let it go now (it finds itself superseded)
  holdSkip?.();
}

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

/** Overlay-opening actions wait until the reply's last turn has been read (WAVE4 U2). */
const DEFERRED = new Set<Action['type']>(['show', 'play', 'story', 'tour', 'build', 'contact', 'work']);

/**
 * A skippable wait (WAVE4 U2/U3): the reply's last turn being read before its overlay opens. A click,
 * Enter, Space or → ends it early (ctl.advance), a new message cancels it.
 */
let holdSkip: (() => void) | null = null;
function hold(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const done = () => {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      if (holdSkip === done) holdSkip = null;
      resolve();
    };
    const t = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    holdSkip = done;
  });
}

/** The once-a-visit "tap to skip" hint (WAVE4 U3): on the first reply that runs to a second turn. */
function skipHintSeen(): boolean {
  try {
    return sessionStorage.getItem(K_SKIP_HINT) === '1';
  } catch {
    return false;
  }
}
function showSkipHint() {
  if (S().skipHint || skipHintSeen()) return;
  try {
    sessionStorage.setItem(K_SKIP_HINT, '1');
  } catch {
    /* blocked storage: once this page load */
  }
  S().setSkipHint(true);
}

/** The Work overlay's shelf a project sits on, and that shelf in order (WAVE4 U8). */
const eraOf = (id: ProjectId): WorkEra => projectById(id).era;
const shelf = (era: WorkEra): ProjectId[] => projectsOf(era).map((p) => p.id);
/** Where `id` sits on its shelf, 1-based (WAVE5 U5: the card's `3 / 6`). */
export const shelfPosition = (id: ProjectId): { at: number; of: number } => {
  const ids = shelf(eraOf(id));
  return { at: ids.indexOf(id) + 1, of: ids.length };
};
/** The card `dir` steps from `id`, round its shelf. */
const stepShelf = (id: ProjectId, dir: 1 | -1): ProjectId => {
  const ids = shelf(eraOf(id));
  const n = ids.length;
  return ids[(((ids.indexOf(id) + dir) % n) + n) % n]!;
};
/** Whether `id` is the last card of its shelf (the "50+ more on GitHub" link sits there). */
export const lastOfShelf = (id: ProjectId): boolean => {
  const ids = shelf(eraOf(id));
  return ids[ids.length - 1] === id;
};

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
    if (st.overlay === 'game') gameFrom = null;
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
    case 'work':
      ctl.openWork(a.era);
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
  moveOn();
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
  async say(text: string, opts: { echo?: string } = {}) {
    const clean = text.trim();
    if (!clean || !rt.brain) return;
    const st = S();
    st.touch();
    st.spendIdle();
    // a build is open: changes aren't on here yet (WAVE4 U7); the frame stays as it is
    const edit = changeIntent(clean, st.overlay === 'build' && st.build.status === 'locked' && !!st.build.html);
    if (edit) {
      st.pushVisitor(clean);
      await speakLine(copy.build.noChanges);
      return;
    }
    // the card open when they asked (or whose row is still up) is what "this" means (WAVE5 U3); the answer closes it below
    const open = contextProject();
    // typed with a card or contact open (the bar stays up over them, FIX4 U2): the answer needs the words
    if (st.overlay === 'card' || st.overlay === 'contact') closeAll();
    // a question from a project's row leaves that row the moment it is asked (WAVE6 X7): never shown
    // during or after its own answer (the card's whole row comes back when the visitor goes back to it)
    if (open) {
      const row = S().chips;
      const asked = sameQuestion(row, clean, open);
      if (asked.length) {
        S().setChips(row.filter((c) => !asked.includes(c)), { project: open });
        cardRow = { project: open, key: S().chipsKey };
      }
    }
    skipForAnswer();
    turn?.abort();
    for (const p of pacers) p.cancel();
    holdSkip?.();
    S().setSkipHint(false);
    S().finishAgent({ keepStreaming: true }); // a turn cut short rests as far as it got
    // the visitor moved on: the next turn does not wait for the one on screen
    channel.last = null;
    moveOn();
    const ac = new AbortController();
    turn = ac;
    const navAtAsk = navSeq;
    /** this reply is still the newest thing the visitor did (WAVE6 X3) */
    const mine = () => turn === ac && navSeq === navAtAsk;
    // a chip that asks in other words ("Another build") shows the visitor what they tapped
    st.pushVisitor(opts.echo?.trim() || clean);
    settleSeq++;
    swarm()?.mood('thinking');
    st.setMood('thinking');
    let lastTurn = '';
    let turnsBegun = 0;
    const cardsAtAsk = cardSeq;
    const pacer = turnPacer({
      onBegin() {
        if (S().mood === 'thinking') {
          swarm()?.mood('speaking');
          S().setMood('speaking');
        }
        // a reply that runs to a second turn is a long one: the once-a-visit hint that a tap moves on
        if (++turnsBegun === 2 && !S().reducedMotion) showSkipHint();
      },
    });
    ac.signal.addEventListener('abort', () => pacer.cancel(), { once: true });
    let chipsSet = false;
    /** a chips tag of a reply asked from a project's row, held until it is known what the answer was about */
    let heldChips: string[] | null = null;
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
        // the visitor has moved on: nothing of this reply's may still act (WAVE6 X3)
        if (!mine()) return;
        if (a.type === 'become') {
          if (a.shape.kind === 'text') spelled = true;
          if (a.shape.kind === 'emoji' && a.shape.emoji === '🚀') rocket = true;
        }
        if (a.type === 'chips') {
          // asked from a project's row: whether the answer was about that project decides at the end (WAVE6 X1)
          if (open) {
            heldChips = a.chips;
            return;
          }
          chipsSet = true;
          // a card opened while the reply streams keeps its own row (as at the reply's end, below)
          if (cardSeq !== cardsAtAsk) return;
          const chips = rocketChips(a.chips, { spelled, rocket, offered: rocketOffered });
          if (chips.includes(ROCKET_CHIP)) rocketOffered = true;
          a = { ...a, chips };
        }
        if (a.type === 'show') opened = a.project;
        if (DEFERRED.has(a.type)) deferred.push(a);
        // a turn's own shape morphs at that turn's first word (WAVE4 U10)
        else if (a.type === 'become') {
          const act = a;
          pacer.cue(() => {
            if (mine()) runAction(act);
          });
        } else runAction(a);
      },
      onNotice(t) {
        pacer.line(t);
      },
    };
    try {
      const reply = await rt.brain.send(clean, handlers, ac.signal, { project: open });
      if (turn !== ac) return;
      const text = stripMarks(reply.text);
      lastTurn = text;
      // every turn on screen, in order, each after the previous one's read time
      await pacer.close();
      retire(pacer);
      if (turn !== ac) return;
      lastTurn = [...S().lines].reverse().find((l) => l.role === 'agent')?.text ?? lastTurn;
      S().setMood('idle');
      // the answer completed (WAVE6 X1): only now does the question count as answered (an interrupted one
      // stays). By what the reply played too (the router can read words the local classifier misses), so a
      // typed question retires its chip just as tapping it does.
      if (mine()) {
        S().markAnswered(clean, open);
        if (reply.intent) S().markIntent(reply.intent);
        // a general row the reply put up while it was said: the question just answered moves on there too
        const row = S().chips;
        if (chipsSet && !open && cardSeq === cardsAtAsk && moveChipsOn(row, S().answered, { contactOpen: S().overlay === 'contact' }).join('|') !== row.join('|')) S().setChips(row);
      }
      // The last turn rests on screen; keep its shape up while it is read (the one clock, ui/pace.ts),
      // reduced motion too.
      const seq = ++settleSeq;
      setTimeout(() => {
        // the hint goes once the last turn has been read
        if (seq === settleSeq) S().setSkipHint(false);
        if (seq !== settleSeq || turn || S().overlay !== 'none' || runner?.running()) return;
        swarm()?.mood('idle');
      }, readTime(lastTurn));
      // the visitor moved on while it was said (a card, contact, History, Close …): the rest of this reply is theirs no more
      if (!mine()) return;
      // the rocket is up: its chip goes from the row the reply left (it set none of its own)
      if (rocket && S().chips.includes(ROCKET_CHIP)) S().setChips(rocketChips(S().chips, { spelled, rocket, offered: true }));
      // a card opened while this reply was still being said ("Next one", ←/→, Work) has put up its own row:
      // the reply's end row (the previous card's follow-ups, or Who's) must not replace it
      const movedOn = cardSeq !== cardsAtAsk;
      // asked from a project's row: only an answer about that project (its intro, its own follow-ups, what I
      // did on it) keeps the project the context; a general one (who, hire, bad at …) ends it (WAVE6 X1/X2)
      const scoped = !!open && aboutProject(reply.intent ?? localIntent(clean, open), open);
      if (open && !scoped) {
        if (cardRow?.project === open) cardRow = null;
        if (heldChips && !movedOn) {
          chipsSet = true;
          const chips = rocketChips(heldChips, { spelled, rocket, offered: rocketOffered });
          if (chips.includes(ROCKET_CHIP)) rocketOffered = true;
          S().setChips(chips);
        }
      }
      if (!chipsSet && !movedOn) {
        if (opened) {
          // the project the reply shows is the context before its card opens: its own row, never refilled
          S().setChips(projectChips(opened), { project: opened });
          cardRow = { project: opened, key: S().chipsKey };
        }
        // a follow-up from a card (or from its row): that project's row stays, every chip of it, with the way
        // back to the card; it stays about that card (WAVE6 X1/X2)
        else if (scoped && !deferred.length) projectRow(open!, sameQuestion(projectChips(open!), clean, open!, reply.intent));
        else if (/who/i.test(clean) && !deferred.length) S().setChips(WHO_CHIPS);
        // a general answer with no row of its own: never the project's row it was asked from
        else if (open && !deferred.length) S().setChips(ENTRY_CHIPS);
      }
      const queue = deferred;
      deferred = [];
      if (queue.length) {
        // the reply's last turn is read in full before an overlay takes the stage (WAVE4 U2); a tap moves on
        if (text) await hold(readLeft(channel, performance.now()), ac.signal);
        if (!mine()) return;
        S().setSkipHint(false);
        for (const a of queue) runAction(a);
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

  /** A click, Enter, Space or →: the turn on screen has been read, the next one (or the reply's overlay) now (POLISH2 A1, WAVE4 U3). */
  advance() {
    if (S().skipHint) S().setSkipHint(false);
    if (pacers.size) for (const p of pacers) p.advance();
    else holdSkip?.();
  },
  /** Whether a reply is still pacing its turns or holding its last one before an overlay (a tap advances it). */
  pacing: () => pacers.size > 0 || !!holdSkip,
  /** Conversation registers the hidden clone each turn is sized on. */
  setMeasure(fn: ((text: string) => TurnFit | null) | null) {
    measureFn = fn;
  },

  chip(label: string) {
    const st = S();
    st.touch();
    st.spendIdle();
    skipForAnswer();
    // contact's and the build's own moves (WAVE4 U6, U7)
    const low = label.trim().toLowerCase();
    if (low === 'copy my email' || low === COPIED_CHIP.toLowerCase()) return void ctl.copyEmail();
    if (low === 'close' && st.overlay !== 'none') return ctl.closeOverlay();
    const about = contextProject();
    const cmd = resolveChip(label, { project: about, name: st.visitor.name ?? rt.brain?.memory.name(), hasBuild: !!st.build.html, hasStoredBuild: !!rt.brain?.memory.builds().some((b) => b.html) });
    switch (cmd.kind) {
      case 'say':
        void ctl.say(cmd.text, cmd.echo !== undefined ? { echo: cmd.echo } : {});
        break;
      case 'play':
        st.markAnswered(label, about);
        ctl.play();
        break;
      case 'back':
        // WAVE6 X2: the card the row is about, reopened; the conversation stays as it is
        if (about) ctl.openProject(about);
        break;
      case 'cv':
        // WAVE6 X4: the panel's CV link, in a new tab (from the click itself, so no popup blocker stops it)
        window.open(copy.contact.cvHref, '_blank', 'noopener,noreferrer');
        break;
      case 'work':
        // WAVE6 X5: `[[work:hand]]`
        runAction({ type: 'work', era: cmd.era });
        break;
      case 'next-project':
        // from a card's row that outlived its card: the one after that card
        if (st.overlay !== 'card' && about) ctl.openProject(stepShelf(about, 1));
        else ctl.nextProject(1);
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
        st.markAnswered(label, about);
        moveOn();
        S().pushVisitor(cmd.text);
        claimBody();
        swarm()?.become(cmd.shape);
        void speakLine('done.');
        break;
      case 'ask-name':
        // one line everywhere (FIX4 U6)
        st.markAnswered(label, about);
        moveOn();
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
    moveOn();
    claimBody();
    closeAll('card');
    S().setEra(eraOf(id));
    S().showProject(id);
    cardSeq++;
    const row = () => {
      S().setChips(projectChips(id));
      cardRow = { project: id, key: S().chipsKey };
    };
    if (opts.chipsAfter === undefined) return row();
    const key = S().chipsKey;
    setTimeout(() => {
      const s = S();
      // unless something else has set the chips (or the card moved on / closed) in the meantime
      if (s.chipsKey === key && s.overlay === 'card' && s.project === id) row();
    }, opts.chipsAfter);
  },
  /** ←/→ and "Next one": round the active shelf (WAVE4 U8); no card open yet, its first card. */
  nextProject(dir: 1 | -1) {
    const cur = S().project;
    ctl.openProject(cur ? stepShelf(cur, dir) : shelf(S().era)[0]!);
  },
  /** The Work overlay on a shelf, at its first card (the toggle; `[[work:hand]]`). */
  openWork(era: WorkEra) {
    const first = shelf(era)[0];
    if (first) ctl.openProject(first);
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
    moveOn();
    const was = st.overlay;
    if (was === 'build') stopBuild(true);
    st.closeOverlay();
    swarm()?.mood('idle');
    if (was === 'card' || was === 'game' || was === 'build') {
      // the game covers the bar; a card (the phone's sheet too, FIX4 U2) and the build frame don't
      const covered = was === 'game';
      // the build's row ("Share it", "Close") means nothing once it is closed (WAVE4 U7)
      // the game opened from a project ("Play it"): that project's row comes back, still about it (WAVE6 X1/X2)
      const from = was === 'game' ? gameFrom : null;
      gameFrom = null;
      const chips = was === 'card' ? ENTRY_CHIPS : was === 'game' ? ['Next one', 'Who are you?', 'What have you built?'] : AFTER_BUILD_CHIPS;
      S().setChips([]);
      settleBody(covered, () => (from ? projectRow(from, ['Play it']) : S().setChips(chips)));
    } else {
      swarm()?.release();
    }
  },
  play() {
    // from a card, or a project's row: the game belongs to that project's journey
    const from = contextProject();
    moveOn();
    claimBody();
    closeAll('game');
    gameFrom = from;
    S().openOverlay('game');
    swarm()?.mood('asleep');
  },
  contact() {
    moveOn();
    claimBody();
    closeAll('contact');
    S().openOverlay('contact');
    S().setChips(CONTACT_CHIPS);
    swarm()?.become({ kind: 'glyph', id: 'envelope' });
    setTimeout(() => {
      if (S().overlay === 'contact') swarm()?.become({ kind: 'glyph', id: 'envelope-open' });
    }, S().reducedMotion ? 0 : 900);
  },
  /** Contact's "Copy my email" chip: the address on the clipboard, the chip says so (WAVE4 U6). */
  async copyEmail() {
    try {
      await navigator.clipboard.writeText(copy.contact.email);
    } catch {
      /* clipboard blocked: the address is on screen */
    }
    const chips = S().chips;
    if (chips.some((c) => c.toLowerCase() === 'copy my email')) S().setChips(chips.map((c) => (c.toLowerCase() === 'copy my email' ? COPIED_CHIP : c)));
  },
  history() {
    moveOn();
    closeAll('history');
    S().openOverlay(S().overlay === 'history' ? 'none' : 'history');
  },
  home() {
    moveOn();
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
    moveOn();
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
          onAccepted(source) {
            if (buildAbort !== ac) return;
            // a prebuilt example says what it is (WAVE5 U4)
            if (source === 'example') S().patchBuild({ replay: true });
            said = said.then(() => speakLine(copy.build.onIt));
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
        S().patchBuild({ status: 'locked', html: res.html, bytes: res.bytes, progress: 1, title: res.title, replay: res.source === 'example' });
      } else {
        S().patchBuild({ status: 'locked', html: res.html, bytes: res.bytes, progress: 1, seconds, title: res.title, replay: res.source === 'example' });
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
      S().setChips([WATCH_BUILD_CHIP, 'Who are you?', 'What have you built?']);
    } finally {
      if (buildAbort === ac) buildAbort = null;
    }
  },
  /** Reopen the visitor's last build from memory (returning visitor chip, POLISH1 A6). */
  openStoredBuild() {
    const last = rt.brain?.memory.builds().find((b) => b.html);
    if (!last) return;
    moveOn();
    claimBody();
    closeAll('build');
    const st = S();
    st.patchBuild({ ...emptyBuild, status: 'locked', instruction: last.instruction, html: last.html, bytes: last.html.length, progress: 1, title: last.title, replay: !!last.example });
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
  /** Changes aren't on here yet (WAVE4 U7): the build stays as it is and says so. */
  beginChange() {
    if (!S().build.html) return;
    void speakLine(copy.build.noChanges);
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
