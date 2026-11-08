import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { Chips } from '../ui/Chips';

vi.mock('../controller', () => ({ ctl: { chip: vi.fn(), startTour: vi.fn() } }));

// the files as written (the web test project sets css: false, so a `?raw` CSS import comes back empty; and the web
// tsconfig has no node types, hence the untyped dynamic import of node:fs)
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(p: URL, enc: 'utf8'): string };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const uiCss = read('../ui/ui.css');
const baseCss = read('../design/base.css');
const indexHtml = read('../../index.html');

/** Top-level blocks of a stylesheet: [prelude, body] pairs (an @media's body holds its own rules). */
function blocks(css: string): [string, string][] {
  const out: [string, string][] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let start = 0;
  let open = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        out.push([src.slice(start, open).trim(), src.slice(open + 1, i)]);
        start = i + 1;
      }
    }
  }
  return out;
}

// WAVE7 M1: iOS zooms into a focused text field whose font-size is under 16 px
describe('the bar on a phone (WAVE7 M1)', () => {
  it('the input is at least 16 px on a coarse pointer and on phone widths', () => {
    const rule = blocks(uiCss).find(([p, body]) => p.startsWith('@media') && p.includes('(pointer: coarse)') && p.includes('max-width: 720px') && body.includes('.y-bar-input'));
    expect(rule).toBeTruthy();
    const fs = /\.y-bar-input\s*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/.exec(rule![1]);
    expect(Number(fs?.[1])).toBeGreaterThanOrEqual(16);
  });

  it('pinch-zoom stays available: the viewport sets no maximum-scale or user-scalable', () => {
    const vp = /<meta name="viewport" content="([^"]+)"/.exec(indexHtml)![1]!;
    expect(vp).not.toMatch(/maximum-scale|user-scalable/);
  });
});

// WAVE7 M3: a tap leaves no hover or focus look behind on a touch screen
describe('no sticky hover or focus from a tap (WAVE7 M3)', () => {
  it('every :hover rule in the shell sits inside @media (hover: hover)', () => {
    expect(uiCss).toContain('.y-chip:hover');
    for (const css of [uiCss, baseCss]) {
      for (const [prelude, body] of blocks(css)) {
        if (prelude.startsWith('@media') && prelude.includes('(hover: hover)')) continue;
        expect(prelude, `bare :hover in "${prelude}"`).not.toMatch(/:hover/);
        if (prelude.startsWith('@media')) expect(body, `:hover inside "${prelude}"`).not.toMatch(/:hover/);
      }
    }
  });

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
    useStore.getState().setChips(['Who are you?', 'What have you built?', 'Spell my name']);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a tapped chip lets go of focus, and the next row gets none', () => {
    const { container } = render(<Chips />);
    const chip = container.querySelector<HTMLButtonElement>('.y-chip')!;
    chip.focus();
    fireEvent.click(chip, { detail: 1 });
    expect(document.activeElement).not.toBe(chip);
    act(() => useStore.getState().setChips(['What are you like?', 'What have you built?', 'How do I reach you?']));
    expect(document.activeElement?.classList.contains('y-chip')).toBe(false);
  });

  it('a keyboard press on a chip (click detail 0) keeps its focus, so the ring stays for keyboard users', () => {
    const { container } = render(<Chips />);
    const chip = container.querySelector<HTMLButtonElement>('.y-chip')!;
    chip.focus();
    fireEvent.click(chip, { detail: 0 });
    expect(document.activeElement).toBe(chip);
  });
});
