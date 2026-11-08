// WAVE6 X7 (owner, after testing live): a project question leaves its row the moment it is asked.
//   - the chip (or the same question typed) is gone during its answer and after it
//   - the row the answer leaves: `Back to <Project>`, `Next one`, then the card's other chips; three at most
//   - back on the card (Back, Work, ←/→, Next landing on it again) its whole row returns, the asked one too
//   - the same on a phone and on a desktop
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId } from '@yoyo/protocol';
import { createBrain } from '../agent';
import { projectChips, projectRowAfter } from '../content/chips';
import { projectById, projectsOf } from '../content/projects';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { wrapsWhole } from '../ui/Chips';

const S = () => useStore.getState();
const flush = async () => {
  for (let i = 0; i < 400 && ctl.pacing(); i++) await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(4000);
};
const firstWord = async () => {
  const n = S().lines.length;
  for (let i = 0; i < 80 && !S().lines.slice(n - 1).some((l) => l.role === 'agent' && l.text); i++) await vi.advanceTimersByTimeAsync(25);
};
/** every row put up from now on */
function rowsFrom(): { rows: string[][]; stop: () => void } {
  const rows: string[][] = [];
  const stop = useStore.subscribe((st, prev) => {
    if (st.chipsKey !== prev.chipsKey) rows.push(st.chips);
  });
  return { rows, stop };
}
const HARD = 'What was the hardest part?';
const UNF_AFTER = ['Back to Unfiltered', 'Next one', 'Who are you?'];

function setup() {
  localStorage.clear();
  sessionStorage.clear();
  S().reset();
  S().setPhase('ready');
  ctl.init({ brain: createBrain({ speed: 0.001 }), swarm: null, sound: null, voice: null });
}

describe('X7: the question asked leaves its project row', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setup();
  });
  afterEach(() => {
    ctl.closeOverlay();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('the clicked chip is gone at once, during its answer and after it', async () => {
    ctl.openProject('unfiltered');
    const { rows, stop } = rowsFrom();
    ctl.chip(HARD);
    expect(S().chips).not.toContain(HARD); // the moment it is clicked
    await firstWord();
    expect(S().chips).not.toContain(HARD); // during its answer
    await flush();
    stop();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.includes(HARD))).toBe(true);
    expect(S().chips).toEqual(UNF_AFTER);
  });

  it('after a project answer: Back first, then Next one, then the remaining chips, three at most', async () => {
    const ids = [...projectsOf('ai'), ...projectsOf('hand')].map((p) => p.id as ProjectId);
    for (const id of ids) {
      for (const q of projectChips(id).filter((c) => !['Next one', 'Play it', 'Who are you?'].includes(c))) {
        setup();
        ctl.openProject(id);
        ctl.chip(q);
        await flush();
        const row = S().chips;
        expect(row, `${id}: ${q}`).toEqual(projectRowAfter(id, projectById(id).name, [q]));
        expect(row[0]).toBe(`Back to ${projectById(id).name}`);
        expect(row[1]).toBe('Next one');
        expect(row.length).toBeLessThanOrEqual(3);
        expect(row).not.toContain(q);
      }
    }
  });

  for (const [how, back] of [
    ['Back to Unfiltered', () => ctl.chip('Back to Unfiltered')],
    ['Work', () => ctl.openWork('ai')],
    ['Next one then ←', () => (ctl.chip('Next one'), ctl.nextProject(-1))],
    ['→ round the shelf', () => {
      ctl.chip('Next one');
      for (let i = 1; i < projectsOf('ai').length; i++) ctl.nextProject(1);
    }],
  ] as const) {
    it(`back on the card (${how}): its whole row, the asked question too, and it replays from there`, async () => {
      expect(projectsOf('ai')[0]!.id).toBe('unfiltered');
      ctl.openProject('unfiltered');
      ctl.chip(HARD);
      await flush();
      expect(S().chips).toEqual(UNF_AFTER);
      back();
      expect(S()).toMatchObject({ overlay: 'card', project: 'unfiltered' });
      expect(S().chips).toEqual(projectChips('unfiltered'));
      const said = S().lines.length;
      ctl.chip(HARD);
      await flush();
      expect(S().lines.length).toBeGreaterThan(said);
      expect(S().chips).toEqual(UNF_AFTER);
    });
  }

  for (const typed of [HARD, 'what was the hardest part']) {
    it(`typed "${typed}" over the card does what the chip does`, async () => {
      ctl.openProject('unfiltered');
      const { rows, stop } = rowsFrom();
      void ctl.say(typed);
      expect(S().chips).not.toContain(HARD);
      await flush();
      stop();
      expect(rows.every((r) => !r.includes(HARD))).toBe(true);
      expect(S().chips).toEqual(UNF_AFTER);
    });
  }

  it('asked again from the row its answer left (typed): still gone, the row stays three', async () => {
    ctl.openProject('unfiltered');
    ctl.chip(HARD);
    await flush();
    void ctl.say(HARD);
    await flush();
    expect(S().chips).toEqual(UNF_AFTER);
  });

  it('the same rows on a phone and on a desktop', async () => {
    const run = async (w: number, h: number) => {
      vi.stubGlobal('innerWidth', w);
      vi.stubGlobal('innerHeight', h);
      setup();
      ctl.openProject('unfiltered');
      const { rows, stop } = rowsFrom();
      ctl.chip(HARD);
      await flush();
      ctl.chip('Back to Unfiltered');
      stop();
      return rows.map((r) => r.join('|'));
    };
    const phone = await run(390, 844);
    const desk = await run(1280, 720);
    expect(phone).toEqual(desk);
    expect(phone).toContain(UNF_AFTER.join('|'));
    // three chips: a phone shows the after-row whole, never scrolled sideways
    expect(wrapsWhole(UNF_AFTER)).toBe(true);
  });
});
