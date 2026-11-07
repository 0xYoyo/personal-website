import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../state/store';
import { Contact } from '../ui/Contact';

// WAVE6 L1: the contact panel no longer covers the chips, and Tab reaches them (and the bar) after its own controls
describe('contact keyboard ring (WAVE6 L1)', () => {
  let desc: PropertyDescriptor | undefined;
  beforeEach(() => {
    // jsdom has no layout: every element counts as rendered
    desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => document.body });
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => (f(0), 1));
    useStore.getState().reset();
  });
  afterEach(() => {
    if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', desc);
    vi.unstubAllGlobals();
  });

  it('Tab goes round the panel, then the chips, then the bar, and back', () => {
    const { container } = render(
      <div>
        <Contact />
        <nav className="y-chips" data-hidden="false">
          <button>Copy my email</button>
          <button>View my CV</button>
        </nav>
        <div className="y-bar-wrap" data-ready="true">
          <input id="y-input" />
        </div>
      </div>,
    );
    const seen: string[] = [];
    const name = () => {
      const a = document.activeElement as HTMLElement;
      return a.id === 'y-input' ? 'bar' : (a.textContent ?? '').trim();
    };
    for (let i = 0; i < 9; i++) {
      act(() => void fireEvent.keyDown(document, { key: 'Tab' }));
      seen.push(name());
    }
    const panel = [...container.querySelectorAll('.y-contact a, .y-contact button')].map((e) => e.textContent!.trim());
    expect(seen).toEqual([...panel, 'Copy my email', 'View my CV', 'bar', panel[0]]);
    act(() => void fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }));
    expect(name()).toBe('bar');
  });

  it('hidden chips are not in the ring', () => {
    render(
      <div>
        <Contact />
        <nav className="y-chips" data-hidden="true">
          <button>Copy my email</button>
        </nav>
      </div>,
    );
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      act(() => void fireEvent.keyDown(document, { key: 'Tab' }));
      seen.add((document.activeElement?.textContent ?? '').trim());
    }
    expect(seen.has('Copy my email')).toBe(false);
  });
});
