// WAVE6 Owner X: conversation behaviour.
//   X1 a project's questions stay on its row (and replay), answer-tracking only for general rows, only once completed
//   X2 the project stays the context once its card closes for an answer: "Next one" and `Back to <Project>`
//   X3 newest click wins: a new question or a navigation cancels everything the old reply still had pending
//   X4 contact's chips;  X5 the hire reply's chips
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrain } from '../agent';
import { CONTACT_CHIPS, ENTRY_CHIPS, HAND_WORK_CHIP, MY_PART_CHIP, projectChips, resolveChip } from '../content/chips';
import { copy } from '../content/copy';
import { projectsOf } from '../content/projects';
import { ctl } from '../controller';
import { meaningOf, moveChipsOn } from '../state/answered';
import { useStore } from '../state/store';

const S = () => useStore.getState();
const flush = async () => {
  for (let i = 0; i < 400 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(4000);
};
const agentTexts = () => S().lines.filter((l) => l.role === 'agent').map((l) => l.text);
const firstWord = async () => {
  const n = S().lines.length;
  for (let i = 0; i < 80 && !S().lines.slice(n - 1).some((l) => l.role === 'agent' && l.text); i++) await vi.advanceTimersByTimeAsync(25);
};
/** the AI shelf in order, wherever Owner L puts its cards */
const ai = () => projectsOf('ai').map((p) => p.id);
const after = (id: string) => ai()[(ai().indexOf(id as never) + 1) % ai().length]!;

function setup(brain = createBrain({ speed: 0.001 })) {
  localStorage.clear();
  sessionStorage.clear();
  S().reset();
  S().setPhase('ready');
  ctl.init({ brain, swarm: null, sound: null, voice: null });
}

describe('X1: project rows stay whole and are scoped', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.useRealTimers();
  });

  it('the store never filters, refills or pads a project row; general rows still move on', () => {
    S().markAnswered('Who are you?');
    S().setChips(projectChips('polybot'), { project: 'polybot' });
    expect(S().chips).toEqual(projectChips('polybot'));
    S().setChips(['Next one'], { project: 'polybot' });
    expect(S().chips).toEqual(['Next one']); // fewer stay fewer: nothing from the entry row
    S().setChips(['Who are you?', 'What have you built?', 'Spell my name']);
    expect(S().chips).not.toContain('Who are you?');
  });

  it('"What did you do on this?" stays on its card after its answer, on revisits, and replays; Polybot never touches Vortex', async () => {
    ctl.openProject('polybot');
    ctl.chip(MY_PART_CHIP);
    await flush();
    expect(S().chips).toContain(MY_PART_CHIP);
    const said = agentTexts().length;
    // clicked again from the row the answer left: it replays
    ctl.chip(MY_PART_CHIP);
    await flush();
    expect(agentTexts().length).toBeGreaterThan(said);
    expect(agentTexts().slice(said).join(' ')).toMatch(/collecting prices/);
    ctl.openProject('vortex');
    expect(S().chips).toContain(MY_PART_CHIP);
    ctl.openProject('polybot');
    expect(S().chips).toEqual(projectChips('polybot'));
  });

  it('a question counts only once its answer completed: an interrupted one stays', async () => {
    S().setChips(['Who are you?', 'What have you built?', 'Spell my name']);
    ctl.chip('Who are you?');
    await firstWord();
    void ctl.say('gm'); // cut short
    await flush();
    expect(S().answered).not.toContain(meaningOf('Who are you?'));
    expect(moveChipsOn(['Who are you?'], S().answered)).toEqual(['Who are you?']);
    ctl.chip('Who are you?');
    await flush();
    expect(S().answered).toContain(meaningOf('Who are you?'));
  });

  it('a general question from a card gets its own reply\'s row and ends the project context (QA F1)', async () => {
    ctl.openProject('unfiltered');
    ctl.chip('Who are you?');
    await flush();
    expect(S().chips).toEqual(['What are you like?', 'What have you built?', 'How do I reach you?']);
    expect(S().chips.some((c) => c.startsWith('Back to'))).toBe(false);
  });

  it('the game played from Prompt Racers gives back that project\'s row when it closes', async () => {
    ctl.openProject('prompt-racers');
    ctl.chip('Play it');
    expect(S().overlay).toBe('game');
    ctl.closeOverlay();
    await vi.advanceTimersByTimeAsync(2000);
    expect(S().chips).toEqual([...projectChips('prompt-racers'), 'Back to Prompt Racers']);
    expect(S().chips).not.toContain('What have you built?');
  });
});

describe('X2: the project stays the context once its card closed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.useRealTimers();
  });

  it('no Back chip while the card is open', () => {
    ctl.openProject('unfiltered');
    expect(S().chips.some((c) => c.startsWith('Back to'))).toBe(false);
  });

  it('`Back to Unfiltered` reopens the card without resetting the conversation', async () => {
    ctl.openProject('unfiltered');
    ctl.chip('What was the hardest part?');
    await flush();
    expect(S().overlay).toBe('none');
    expect(S().chips).toContain('Back to Unfiltered');
    const lines = S().lines.map((l) => l.text);
    ctl.chip('Back to Unfiltered');
    expect(S().overlay).toBe('card');
    expect(S().project).toBe('unfiltered');
    expect(S().lines.map((l) => l.text)).toEqual(lines);
    expect(S().chips).toEqual(projectChips('unfiltered'));
  });

  it('"Next one" from the row the answer left goes on from that project', async () => {
    ctl.openProject('polybot');
    ctl.chip(MY_PART_CHIP);
    await flush();
    expect(S().overlay).toBe('none');
    ctl.chip('Next one');
    expect(S().overlay).toBe('card');
    expect(S().project).toBe(after('polybot'));
  });
});

describe('X3: newest click wins', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** "Tell me about Polybot": two turns, then its card opens (a deferred overlay) */
  const POLY = /Polymarket|edge was too small/;
  const ask = () => void ctl.say('Tell me about Polybot');

  for (const when of ['before its first word', 'mid-turn', 'during the final read pause'] as const) {
    it(`a new question ${when} cancels the old reply's turns and its card; the new one starts at once`, async () => {
      ask();
      if (when === 'mid-turn') await firstWord();
      if (when === 'during the final read pause') {
        // the last turn is on screen and done; the card waits for it to be read
        for (let i = 0; i < 400 && !(S().lines.filter((l) => POLY.test(l.text)).length >= 2 && !S().lines.at(-1)!.streaming); i++) await vi.advanceTimersByTimeAsync(50);
        expect(S().overlay).toBe('none');
        expect(ctl.pacing()).toBe(true);
      }
      void ctl.say('gm');
      // the new question is on screen at once
      expect(S().lines.at(-1)).toMatchObject({ role: 'visitor', text: 'gm' });
      await flush();
      const lines = S().lines;
      const gm = lines.findIndex((l) => l.role === 'visitor' && l.text === 'gm');
      expect(lines.slice(gm + 1).some((l) => POLY.test(l.text))).toBe(false);
      expect(lines.slice(gm + 1).some((l) => l.role === 'agent' && l.text)).toBe(true);
      expect(S().overlay).toBe('none'); // Polybot's card never opens
    });
  }

  const navs: [string, () => void, (s: ReturnType<typeof S>) => void][] = [
    ['Contact', () => ctl.contact(), (s) => expect(s.overlay).toBe('contact')],
    ['History', () => ctl.history(), (s) => expect(s.overlay).toBe('history')],
    ['Work', () => ctl.openWork('ai'), (s) => expect(s).toMatchObject({ overlay: 'card', project: ai()[0] })],
    ['Hand-written era', () => ctl.openWork('hand'), (s) => expect(s).toMatchObject({ overlay: 'card', project: projectsOf('hand')[0]!.id })],
    ['Next one (→)', () => ctl.nextProject(1), (s) => expect(s.overlay).toBe('card')],
    ['Close', () => (ctl.openWork('hand'), ctl.closeOverlay()), (s) => expect(s.overlay).toBe('none')],
  ];
  for (const at of ['mid-turn', 'during the pending card open'] as const) {
    for (const [name, nav, check] of navs) {
      it(`${name} ${at}: the old reply never reopens a card or reclaims the screen`, async () => {
        ask();
        if (at === 'mid-turn') await firstWord();
        else for (let i = 0; i < 400 && !(S().lines.filter((l) => POLY.test(l.text)).length >= 2 && !S().lines.at(-1)!.streaming); i++) await vi.advanceTimersByTimeAsync(50);
        nav();
        // the navigation's own row (Close's comes back once the flock has gathered)
        const chips = name === 'Close' ? ENTRY_CHIPS : S().chips;
        await flush();
        check(S());
        expect(S().project === 'polybot' && S().overlay === 'card').toBe(false);
        expect(S().chips).toEqual(chips); // its end row never lands either
      });
    }
  }

  it('History opened mid-reply stays open', async () => {
    ask();
    await firstWord();
    ctl.history();
    await flush();
    expect(S().overlay).toBe('history');
  });

  describe('a slow live call', () => {
    // the router answers after 2 s (inside its budget), and ignores the abort: a stale completion
    const route = (intent: string) =>
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () => resolve(new Response(JSON.stringify({ type: 'route', intent, turns: [], shape: null, chips: [] }), { status: 200, headers: { 'content-type': 'application/json' } })),
              2000,
            ),
          ),
      );
    const live = () => setup(createBrain({ speed: 0.001, agentUrl: 'https://agent.example' }));

    it('a newer question wins: the stale route never plays', async () => {
      vi.stubGlobal('fetch', route('polybot'));
      live();
      void ctl.say('that betting experiment of yours');
      await vi.advanceTimersByTimeAsync(300);
      vi.stubGlobal('fetch', route('who'));
      void ctl.say('so who is behind this');
      await flush();
      const lines = S().lines;
      const q = lines.findIndex((l) => l.role === 'visitor' && l.text === 'so who is behind this');
      expect(lines.slice(q + 1).some((l) => POLY.test(l.text))).toBe(false);
      expect(lines.slice(q + 1).some((l) => /Yoyo/.test(l.text))).toBe(true);
      expect(S().overlay).toBe('none');
    });

    it('navigation during it: the late reply never opens its card over Contact', async () => {
      vi.stubGlobal('fetch', route('polybot'));
      live();
      void ctl.say('that betting experiment of yours');
      await vi.advanceTimersByTimeAsync(300);
      ctl.contact();
      await flush();
      expect(S().overlay).toBe('contact');
      expect(S().chips).toEqual(CONTACT_CHIPS);
    });
  });
});

describe('X4: contact actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Copy my email | View my CV | Why should we hire you?; never "What have you built?", even once hire was answered', async () => {
    ctl.contact();
    expect(S().chips).toEqual(['Copy my email', 'View my CV', 'Why should we hire you?']);
    ctl.chip('Why should we hire you?');
    await flush();
    ctl.contact();
    expect(S().chips).not.toContain('What have you built?');
    expect(S().chips).toContain('View my CV');
  });

  it('View my CV opens the panel\'s CV in a new tab; Copy my email still says "Email copied"', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    ctl.contact();
    ctl.chip('View my CV');
    expect(open).toHaveBeenCalledWith('/Yoav_Zrihan_CV.pdf', '_blank', expect.any(String));
    expect(copy.contact.cvHref).toBe('/Yoav_Zrihan_CV.pdf');
    expect(S().overlay).toBe('contact');
    ctl.chip('Copy my email');
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith(copy.contact.email);
    expect(S().chips[0]).toBe('Email copied');
  });
});

describe('X5: the hire chips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.useRealTimers();
  });

  it('"Show my hand-written work" opens Work on the Hand-written era at its first card', () => {
    expect(resolveChip(HAND_WORK_CHIP, { project: null, hasBuild: false })).toEqual({ kind: 'work', era: 'hand' });
    S().setChips([HAND_WORK_CHIP, 'Tell me about Polybot', 'How do I reach you?']);
    ctl.chip(HAND_WORK_CHIP);
    expect(S()).toMatchObject({ overlay: 'card', era: 'hand', project: projectsOf('hand')[0]!.id });
  });

  it('the hire row survives the general filter whatever was answered ("What have you built?" too)', () => {
    S().markAnswered('What have you built?');
    S().markAnswered('How do you work?');
    S().setChips([HAND_WORK_CHIP, 'Tell me about Polybot', 'How do I reach you?']);
    expect(S().chips).toEqual([HAND_WORK_CHIP, 'Tell me about Polybot', 'How do I reach you?']);
  });

  it('"Tell me about Polybot" asks, and its card opens after the answer', async () => {
    ctl.chip('Tell me about Polybot');
    await flush();
    expect(S()).toMatchObject({ overlay: 'card', project: 'polybot' });
  });
});

describe('QA F1/F2: the project row only for answers about that project', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.useRealTimers();
  });
  const UNF_ROW = [...projectChips('unfiltered'), 'Back to Unfiltered'];
  const noBack = () => expect(S().chips.some((c) => c.startsWith('Back to'))).toBe(false);

  for (const [how, ask, row] of [
    ['the "Who are you?" chip', () => ctl.chip('Who are you?'), ['What are you like?', 'What have you built?', 'How do I reach you?']],
    ['typed "What are you bad at?"', () => void ctl.say('What are you bad at?'), ['Why should we hire you?', 'And crypto?', 'What have you built?']],
  ] as const) {
    it(`after a project answer, ${how} gets its own row; the project context is over`, async () => {
      ctl.openProject('unfiltered');
      ctl.chip('What was the hardest part?');
      await flush();
      expect(S().chips).toEqual(UNF_ROW);
      ask();
      await flush();
      expect(S().chips).toEqual(row);
      noBack();
      // and "Next one" no longer goes on from Unfiltered (no stale context)
      expect(resolveChip('Next one', { project: null, hasBuild: false })).toEqual({ kind: 'say', text: 'What have you built?' });
    });

    it(`${how} interrupting the project answer: its own row, and Back never comes back later`, async () => {
      ctl.openProject('unfiltered');
      ctl.chip('What was the hardest part?');
      await firstWord();
      const rows: string[][] = [];
      const unsub = useStore.subscribe((st, prev) => {
        if (st.chipsKey !== prev.chipsKey) rows.push(st.chips);
      });
      ask();
      await flush();
      await vi.advanceTimersByTimeAsync(10_000);
      unsub();
      expect(S().chips).toEqual(row);
      expect(rows.some((r) => r.some((c) => c.startsWith('Back to')))).toBe(false);
    });
  }

  it('a project follow-up still keeps its row, Back included', async () => {
    ctl.openProject('prompt-racers');
    ctl.chip('How does it teach prompting?');
    await flush();
    expect(S().chips).toEqual([...projectChips('prompt-racers'), 'Back to Prompt Racers']);
  });

  for (const how of ['typed', 'the hire chip'] as const) {
    it(`"Tell me about Polybot" (${how}) after "Who are you?": Polybot's own row, never "What have you built?"`, async () => {
      void ctl.say('Who are you?');
      await flush();
      const rows: string[][] = [];
      const unsub = useStore.subscribe((st, prev) => {
        if (st.chipsKey !== prev.chipsKey) rows.push(st.chips);
      });
      if (how === 'typed') void ctl.say('Tell me about Polybot');
      else {
        S().setChips([HAND_WORK_CHIP, 'Tell me about Polybot', 'How do I reach you?']);
        ctl.chip('Tell me about Polybot');
      }
      await flush();
      unsub();
      expect(S()).toMatchObject({ overlay: 'card', project: 'polybot' });
      expect(S().chips).toEqual(projectChips('polybot'));
      expect(rows.filter((r) => r.includes('Next one')).every((r) => !r.includes('What have you built?'))).toBe(true);
      expect(rows.filter((r) => r.includes('Next one')).every((r) => r.join('|') === projectChips('polybot').join('|'))).toBe(true);
    });
  }
});
