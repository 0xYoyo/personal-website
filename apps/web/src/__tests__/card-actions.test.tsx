import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { Card } from '../ui/Card';

// WAVE6 L5: the card's actions (Play, links) sit outside the scrolling description, between it and the nav,
// so they stay in view while the description scrolls
describe('card action area (WAVE6 L5)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    useStore.getState().reset();
    useStore.getState().setPhase('ready');
  });

  it('Prompt Racers: Play and GitHub are in .y-card-links, a sibling of the body just before the nav', () => {
    useStore.setState({ project: 'prompt-racers', overlay: 'card' } as never);
    const { container } = render(<Card />);
    const links = container.querySelector('.y-card-links')!;
    expect(links).toBeTruthy();
    expect(container.querySelector('.y-card-body')!.contains(links)).toBe(false);
    expect(links.previousElementSibling?.className).toBe('y-card-body');
    expect(links.nextElementSibling?.className).toBe('y-card-nav');
    expect([...links.children].map((c) => c.textContent)).toEqual(['Play', 'GitHub']);
    vi.unstubAllGlobals();
  });

  it('Vortex ends its shelf: GitHub, then 50+ more on GitHub (no Bot link)', () => {
    useStore.setState({ project: 'vortex', overlay: 'card' } as never);
    const { container } = render(<Card />);
    expect([...container.querySelectorAll('.y-card-links a')].map((c) => c.textContent)).toEqual(['GitHub', '50+ more on GitHub']);
    vi.unstubAllGlobals();
  });
});
