import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../content/copy';
import { useStore } from '../state/store';
import { BuildFrame } from '../ui/BuildFrame';
import { Card } from '../ui/Card';
import { GAME_CLOSE } from '../ui/GameModal';

// WAVE5 QA: a touch device has no Esc key, so its card and build Close buttons say just "Close";
// desktop keeps "Close (Esc)". The game's is "Close" everywhere (focus starts in the game, WAVE5 U2).
const media = (touch: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: touch && (q.includes('coarse') || q.includes('hover: none')),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));

const labels = (c: HTMLElement) => [...c.querySelectorAll('button')].map((b) => b.textContent?.trim());

describe('Close labels', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const touch of [false, true]) {
    const want = touch ? 'Close' : 'Close (Esc)';
    it(`card: ${want} on ${touch ? 'touch' : 'desktop'}`, () => {
      media(touch);
      useStore.getState().showProject('polybot');
      const { container, unmount } = render(<Card />);
      expect(labels(container)).toContain(want);
      expect(labels(container)).not.toContain(touch ? copy.card.close : copy.card.closeTouch);
      unmount();
    });
    it(`build: ${want} on ${touch ? 'touch' : 'desktop'}`, () => {
      media(touch);
      useStore.getState().patchBuild({ status: 'locked', html: '<p>hi</p>', title: 'hi', bytes: 9 });
      useStore.getState().openOverlay('build');
      const { container, unmount } = render(<BuildFrame />);
      expect(labels(container)).toContain(want);
      expect(labels(container)).not.toContain(touch ? copy.build.controls.close : copy.build.controls.closeTouch);
      unmount();
    });
  }
  it('the game says just "Close"', () => expect(GAME_CLOSE).toBe('Close'));
});
