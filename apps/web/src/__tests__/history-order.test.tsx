import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Line } from '../state/store';
import { useStore } from '../state/store';
import { History, historyExchanges } from '../ui/History';
import { wrapsWhole } from '../ui/Chips';

const L = (id: number, role: Line['role'], text: string): Line => ({ id, role, text, streaming: false });
const convo: Line[] = [
  L(1, 'agent', 'hey. I am Yoyo.'),
  L(2, 'visitor', 'who are you'),
  L(3, 'agent', 'who 1'),
  L(4, 'agent', 'who 2'),
  L(5, 'visitor', 'why hire you'),
  L(6, 'agent', 'hire 1'),
  L(7, 'agent', 'hire 2'),
  L(8, 'agent', 'hire 3'),
];

// WAVE6 L2: newest exchange first, each question followed by its answers in reading order, the greeting last
describe('History order (WAVE6 L2)', () => {
  it('groups lines into exchanges, newest first', () => {
    expect(historyExchanges(convo).map((g) => g.map((l) => l.text))).toEqual([
      ['why hire you', 'hire 1', 'hire 2', 'hire 3'],
      ['who are you', 'who 1', 'who 2'],
      ['hey. I am Yoyo.'],
    ]);
  });

  it('lines said before any question are the oldest group; an empty conversation has none', () => {
    expect(historyExchanges([])).toEqual([]);
    expect(historyExchanges([L(1, 'visitor', 'q')]).map((g) => g.length)).toEqual([1]);
  });

  it('renders the list in that order and opens at the top (the newest exchange)', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;
    useStore.getState().reset();
    useStore.setState({ lines: convo });
    const { container } = render(<History />);
    const items = [...container.querySelectorAll('.y-history-list li')].map((li) => li.textContent?.replace(/^(you|Yoyo): /, ''));
    expect(items).toEqual(['why hire you', 'hire 1', 'hire 2', 'hire 3', 'who are you', 'who 1', 'who 2', 'hey. I am Yoyo.']);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    vi.unstubAllGlobals();
  });
});

// WAVE6: a phone wraps a project row whole when it carries `Back to <Project>`, so that chip is never off the edge
describe('chip rows that wrap whole on a phone', () => {
  it('three or fewer, or four with Back to', () => {
    expect(wrapsWhole(['a', 'b', 'c'])).toBe(true);
    expect(wrapsWhole(['a', 'b', 'c', 'Back to Unfiltered'])).toBe(true);
    expect(wrapsWhole(['a', 'b', 'c', 'd'])).toBe(false);
    expect(wrapsWhole(['a', 'b', 'c', 'd', 'Back to Unfiltered'])).toBe(false);
  });
});
