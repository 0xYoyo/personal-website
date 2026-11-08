import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectChips, projectRowAfter } from '../content/chips';
import { projects } from '../content/projects';
import { useStore } from '../state/store';
import { Chips, wrapsWhole } from '../ui/Chips';

// WAVE7 W: with a card open a phone's row wraps whole too (no "How does it tea…" cut off at the edge)
describe('a card row wraps whole on a phone (WAVE7 W)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('every card row, and the row its answer leaves, is one that wraps whole', () => {
    for (const p of projects) {
      expect(wrapsWhole(projectChips(p.id))).toBe(true);
      expect(wrapsWhole(projectRowAfter(p.id, p.name))).toBe(true);
    }
  });

  it.each(['card', 'none', 'contact'] as const)('the row is marked to wrap with the overlay %s', (overlay) => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    useStore.getState().reset();
    useStore.setState({ phase: 'ready', overlay, chips: projectChips('prompt-racers'), chipsKey: 1 });
    const { container } = render(<Chips />);
    expect(container.querySelector<HTMLElement>('.y-chips-row')?.dataset.few).toBe('true');
  });

  it('a build keeps its one-line row', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    useStore.getState().reset();
    useStore.setState({ phase: 'ready', overlay: 'build', chips: ['Another build', 'What have you built?', 'How do I reach you?'], chipsKey: 1 });
    const { container } = render(<Chips />);
    expect(container.querySelector<HTMLElement>('.y-chips-row')?.dataset.few).toBe('false');
  });
});
