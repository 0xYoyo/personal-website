/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { LIGHTS, LIGHTS_ON_AT } from '../../design/lights';
import {
  createFactoryStore,
  factoryStore,
  selectFirstMergeDone,
  selectLightsLevel,
  selectLightsOn,
} from '../store';
import { startScheduler, TIMING, type Scheduler } from '../scheduler';
import { endCardCopy } from '../endCardCopy';
import { isAtBottom, BOTTOM_SLACK } from '../useBottomReach';
import { buildCommands, searchCommands } from '../ui/actions';
import { PaletteDialog } from '../ui/CommandPalette';
import { Slot } from '../ui/Slot';
import { commitLineMeta } from '../ui/commitLine';
import type { MergeCounts, SectionModule, SectionRuntime } from '../types';
import { META, memoryStorage } from './fixtures';

// jsdom has no matchMedia; the palette's /yoyo-diagnose reads it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

const counts = (c: Partial<MergeCounts>): MergeCounts => ({ hand: 0, keyboard: 0, autopilot: 0, scroll: 0, command: 0, ...c });

/** Walk a PR to awaiting-merge by hand. */
function ready(store: ReturnType<typeof createFactoryStore>, id: (typeof META)[number]['id']) {
  const g = store.getState();
  g.advance(id, 'queued', { buildMs: 1600 });
  g.advance(id, 'building');
  g.passCheck(id);
  g.passCheck(id);
  g.passCheck(id);
  g.advance(id, 'ci');
  g.advance(id, 'review');
}

/* ---------- Lights ---------- */

// Read from disk: Vitest does not load CSS, even with ?raw.
const tokensCss = readFileSync(`${process.cwd()}/src/design/tokens.css`, 'utf8');

/** The :root[data-lights='N'] values, layered on the :root defaults, straight from tokens.css. */
function cssStates() {
  const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const decl = (block: string) =>
    Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().toLowerCase()]));
  const base = decl(css.match(/(^|\n):root\s*\{([\s\S]*?)\n\}/)![2]!);
  return Array.from({ length: 8 }, (_, n) => {
    const block = css.match(new RegExp(`:root\\[data-lights='${n}'\\]\\s*\\{([^}]*)\\}`));
    const d = { ...base, ...(block ? decl(block[1]!) : {}) };
    return { bg: d['--bg']!, fg: d['--fg']!, muted: d['--muted']!, link: d['--agent-text']!, dur: d['--dur-light']! };
  });
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe('lights: two regimes and one switch', () => {
  const states = cssStates();

  it('has the exact background for each of the eight states, and theme-color uses the same values', () => {
    expect(states.map((s) => s.bg)).toEqual(['#15120e', '#1c1813', '#241f19', '#2d271f', '#ddd9d0', '#e3dfd7', '#e8e5dd', '#edeae3']);
    expect(LIGHTS.map((l) => l.bg)).toEqual(states.map((s) => s.bg));
    expect(LIGHTS.map((l) => l.fg)).toEqual(states.map((s) => s.fg));
  });

  it('keeps paper text in the ink regime and flips to ink text at merged = 4, in 700 ms', () => {
    expect(LIGHTS_ON_AT).toBe(4);
    for (const s of states.slice(0, 4)) expect(s.fg).toBe('#f1ece2');
    for (const s of states.slice(4)) expect(s.fg).toBe('#171411');
    expect(states[4]!.dur).toBe('700ms');
    expect(states[3]!.dur).toBe('900ms');
  });

  it('gets lighter at every step, and every step in the ink regime is visible', () => {
    const L = states.map((s) => luminance(s.bg));
    for (let i = 1; i < L.length; i++) expect(L[i]!).toBeGreaterThan(L[i - 1]!);
    // Each ink-regime step lifts CIELAB lightness by roughly 3 (visible side by side).
    const Lstar = (hex: string) => {
      const Y = luminance(hex);
      return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
    };
    for (let i = 1; i < 4; i++) expect(Lstar(states[i]!.bg) - Lstar(states[i - 1]!.bg)).toBeGreaterThan(2.5);
  });

  it('keeps fg, muted and link text at >= 4.5:1 in all eight states', () => {
    for (const s of states) {
      expect(ratio(s.fg, s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(s.muted, s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(s.link, s.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('maps merges to states, logs "lights on" once at 4 of 7, and exposes the hero flags', () => {
    const store = createFactoryStore({ storage: memoryStorage() });
    store.getState().boot(META);
    const s = () => store.getState();
    expect(selectLightsLevel(s())).toBe(0);
    expect(selectFirstMergeDone(s())).toBe(false);
    META.slice(1, 5).forEach((m, i) => {
      ready(store, m.id);
      s().merge(m.id, 'human');
      expect(selectLightsLevel(s())).toBe(i + 1);
    });
    expect(selectFirstMergeDone(s())).toBe(true);
    expect(selectLightsOn(s())).toBe(true);
    expect(s().lightsOnAt).not.toBeNull();
    const lights = s().log.filter((e) => e.tag === 'lights');
    expect(lights.map((e) => e.text)).toEqual(['on · 4 of 7 merged']);
    // The Lights command forces the ends.
    s().toggleLights();
    expect(selectLightsLevel(s())).toBe(0);
  });
});

/* ---------- Slots ---------- */

describe('compact slots', () => {
  afterEach(cleanup);
  it('lays a slot out the same whatever its minHeight (it is as tall as its PR card)', () => {
    factoryStore.getState().boot(META, { seen: false });
    const mod = (minHeight: number): SectionModule => ({
      id: 'loop',
      pr: 2,
      title: 'feat: how I work',
      branch: 'feat/how-i-work',
      spec: { acceptance: ['a'], nonGoals: ['b'] },
      reviewNote: 'note',
      source: 'const a = 1;\nconst b = 2;',
      Component: () => null,
      minHeight,
    });
    const a = render(<Slot module={mod(320)} heading="How I work" />);
    const stripIds = (html: string) => html.replace(/:r[0-9a-z]+:/g, ':id:');
    const htmlA = stripIds(a.container.innerHTML);
    const slotA = a.container.querySelector<HTMLElement>('.slot')!;
    expect(slotA.style.minHeight).toBe('');
    expect(slotA.getAttribute('style')).toBeNull();
    a.unmount();
    const b = render(<Slot module={mod(5000)} heading="How I work" />);
    expect(stripIds(b.container.innerHTML)).toBe(htmlA);
    // The progress list is a status region, not a landmark inside the section.
    expect(b.container.querySelector('aside')).toBeNull();
    expect(b.container.querySelector('[role="status"]')).not.toBeNull();
  });
});

/* ---------- Bottom reach, merge-all, palette ---------- */

describe('never block: bottom of the page', () => {
  let scheduler: Scheduler | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
  });
  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
    vi.useRealTimers();
  });

  it('detects the bottom within 80 px', () => {
    expect(BOTTOM_SLACK).toBe(80);
    expect(isAtBottom(9000, 844, 9925)).toBe(false);
    expect(isAtBottom(9001, 844, 9925)).toBe(true);
    expect(isAtBottom(9081, 844, 9925)).toBe(true);
  });

  it('fast-forwards and merges every open PR, including #8, then opens the end card', () => {
    const store = createFactoryStore({ storage: memoryStorage() });
    store.getState().boot(META);
    scheduler = startScheduler(store);
    const s = () => store.getState();
    vi.advanceTimersByTime(700); // #2 building, the rest queued
    expect(s().rushAll('scroll')).toBe(7);
    vi.advanceTimersByTime(TIMING.rushTotal);
    expect(META.every((m) => s().sections[m.id]!.state === 'merged')).toBe(true);
    expect(s().sections.contact!.mergedBy).toBe('scroll');
    expect(s().mergeCounts.scroll).toBe(7);
    expect(s().endCard).toBe('open');
  });

  it('lands everything at once, without choreography, and never leaves a PR waiting on you', () => {
    const store = createFactoryStore({ storage: memoryStorage() });
    store.getState().boot(META, { controlRoomOpen: true });
    scheduler = startScheduler(store);
    const s = () => store.getState();
    vi.advanceTimersByTime(700);
    s().rushAll('scroll');
    // Synchronously, with no timers run: every section merged and marked instant.
    expect(META.every((m) => s().sections[m.id]!.state === 'merged')).toBe(true);
    expect(META.slice(1).every((m) => s().sections[m.id]!.instant)).toBe(true);
    expect(s().log.some((e) => e.tag === 'wait')).toBe(false);
    // Stale build timers for the PR that was building do nothing afterwards.
    const logLength = s().log.length;
    vi.advanceTimersByTime(5000);
    expect(s().log.length).toBe(logLength);
  });

  it('collapses the expanded control room on the first merge, whatever made it', () => {
    const store = createFactoryStore({ storage: memoryStorage() });
    store.getState().boot(META, { controlRoomOpen: true });
    expect(store.getState().controlRoomOpen).toBe(true);
    store.getState().merge('loop', 'scroll');
    expect(store.getState().controlRoomOpen).toBe(false);
  });
});

describe('command palette', () => {
  let scheduler: Scheduler | null = null;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
    factoryStore.getState().boot(META, { seen: false });
  });
  afterEach(() => {
    cleanup();
    scheduler?.stop();
    scheduler = null;
    factoryStore.getState().setPaletteOpen(false);
    vi.useRealTimers();
  });

  it('matches names and keywords only: "merge" does not list /yoyo-replay', () => {
    const names = searchCommands(buildCommands(), 'merge').map((c) => c.name);
    expect(names.slice(0, 2).sort()).toEqual(['/yoyo-merge', '/yoyo-merge-all']);
    expect(names).not.toContain('/yoyo-replay');
  });

  it('runs the top result when Enter comes straight after typing', () => {
    const { container } = render(<PaletteDialog />);
    const input = container.querySelector('input')!;
    act(() => {
      fireEvent.change(input, { target: { value: 'diagn' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    const out = container.querySelector('.palette-output')!;
    expect(out.textContent).toContain('$ /yoyo-diagnose');
    expect(out.textContent).toContain('Merges: 0 by hand');
    expect(out.textContent).not.toMatch(/Healthy|Diagnosis/);
  });

  it('/yoyo-merge-all closes the palette before merging, so the end card opens alone', () => {
    scheduler = startScheduler(factoryStore);
    vi.advanceTimersByTime(700);
    act(() => factoryStore.getState().setPaletteOpen(true));
    const cmd = buildCommands().find((c) => c.name === '/yoyo-merge-all')!;
    let out: string[] | void = undefined;
    act(() => {
      out = cmd.run();
    });
    expect(out).toBeUndefined();
    expect(factoryStore.getState().paletteOpen).toBe(false);
    act(() => vi.advanceTimersByTime(TIMING.rushTotal));
    expect(factoryStore.getState().endCard).toBe('open');
    expect(factoryStore.getState().paletteOpen).toBe(false);
    expect(factoryStore.getState().mergeCounts.command).toBe(7);
  });
});

/* ---------- Copy ---------- */

describe('end card copy', () => {
  const base = { total: 7, time: '1:42', url: 'https://example.com/' };

  it('all seven by hand', () => {
    const c = endCardCopy({ ...base, counts: counts({ hand: 6, keyboard: 1 }) });
    expect(c.summary).toBe('You merged 7 PRs by hand in 1:42.');
    expect(c.checks).toBe('CI green on all 7.');
    expect(c.share).toBe("I merged 7 of 7 PRs on 0xYoyo's portfolio in 1:42. His agents built it; I approved it. https://example.com/");
  });

  it('some by hand, the loop merged the rest', () => {
    const c = endCardCopy({ ...base, counts: counts({ hand: 2, autopilot: 3, scroll: 2 }) });
    expect(c.summary).toBe('You merged 2 of 7 by hand in 1:42; the loop merged the rest.');
    expect(c.share).toBe("I merged 2 of 7 PRs on 0xYoyo's portfolio in 1:42. His agents built it. https://example.com/");
    expect(c.share).not.toContain('approved');
  });

  it('by hand, then /yoyo-merge-all', () => {
    const c = endCardCopy({ ...base, counts: counts({ hand: 2, command: 5 }) });
    expect(c.summary).toBe('You merged 2 by hand, then merged the remaining 5 with /yoyo-merge-all.');
  });

  it('everything with /yoyo-merge-all', () => {
    const c = endCardCopy({ ...base, counts: counts({ command: 7 }) });
    expect(c.summary).toBe('You merged all 7 at once with /yoyo-merge-all in 1:42.');
  });

  it('zero by hand', () => {
    const c = endCardCopy({ ...base, counts: counts({ autopilot: 6, scroll: 1 }) });
    expect(c.summary).toBe('The loop merged all 7 in 1:42. You watched.');
    expect(c.share).toBe("I watched 0xYoyo's agents build his portfolio in 1:42. https://example.com/");
  });
});

describe('commit line', () => {
  it('says how and when each section merged, and just "merged" when skipped', () => {
    const rt = (mergedBy: SectionRuntime['mergedBy'], via: 'keyboard' | null = null) => ({
      mergedBy,
      mergedAt: 5_000,
      mergedVia: via,
    });
    expect(commitLineMeta(rt('human'), false)).toBe('merged by you at +0:05');
    expect(commitLineMeta(rt('human', 'keyboard'), false)).toBe('merged by you (keyboard) at +0:05');
    expect(commitLineMeta(rt('autopilot'), false)).toBe('merged by autopilot at +0:05');
    expect(commitLineMeta(rt('scroll'), false)).toBe('merged at +0:05 · you scrolled past');
    expect(commitLineMeta(rt('command'), false)).toBe('merged with /yoyo-merge-all at +0:05');
    expect(commitLineMeta(rt('skip'), true)).toBe('merged');
    expect(commitLineMeta(rt('human'), true)).toBe('merged');
  });
});

describe('log vocabulary', () => {
  it('only states what happened in this browser', () => {
    const store = createFactoryStore({ storage: memoryStorage() });
    store.getState().boot(META);
    ready(store, 'loop');
    store.getState().merge('loop', 'human');
    const lines = store.getState().log.map((e) => `${e.tag}  ${e.text}`);
    expect(lines).toEqual([
      'init  7 sections queued · #1 hero merged at init',
      'build  #2 · writing src/sections/loop/Component.tsx (50 lines)',
      'build  #2 · opened PR',
      'checks  #2 · typecheck ✓ lint ✓ tests ✓ (ran at build time)',
      'review  #2 · approve · 0 must-fix · 0 should-fix · 1 note',
      'wait  #2 · waiting on you',
      'merged  #2 by you',
    ]);
    expect(lines.join('\n')).not.toMatch(/issues filed|agent-ready|worktree/);
  });
});
