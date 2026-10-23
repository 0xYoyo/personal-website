import { act, render } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_LH } from '../ui/fit';
import { Conversation } from '../ui/Conversation';
import { useStore } from '../state/store';

// Wrapped-text stand-in for jsdom: 0.5 em per character over an 880 px column.
const WIDTH = 880;
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const px = parseFloat(this.style.fontSize) || 16;
      const perLine = Math.max(1, Math.floor(WIDTH / (px * 0.5)));
      return Math.max(1, Math.ceil((this.textContent ?? '').length / perLine)) * px * AGENT_LH;
    },
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
});
afterAll(() => {
  if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc);
});
beforeEach(() => {
  useStore.getState().reset();
  useStore.getState().setPhase('ready');
});

const line = (c: HTMLElement) => c.querySelector<HTMLElement>('.y-agent-line');
const WHO = "Yoav Zrihan. Self-taught, building since 2022, crypto since 2021, second-year CS and Entrepreneurship at Reichman. He doesn't write most of his code anymore — he directs the agents that do.";

describe('Conversation', () => {
  it('streams a reply into one block that never retracts a word or replaces itself', () => {
    const { container } = render(<Conversation />);
    const st = useStore.getState();
    act(() => void st.pushVisitor('who is yoyo'));
    act(() => void st.startAgent());
    let node: HTMLElement | null = null;
    let lastCount = 0;
    let lastSize = Infinity;
    for (const w of WHO.split(' ')) {
      act(() => st.appendAgentWord(w));
      const el = line(container)!;
      node ??= el;
      expect(el).toBe(node); // same element for the whole reply
      const count = el.querySelectorAll('.y-w').length;
      expect(count).toBeGreaterThanOrEqual(lastCount); // words only ever arrive
      lastCount = count;
      const px = parseFloat(el.style.fontSize);
      expect(px).toBeLessThanOrEqual(lastSize); // the type only ever steps down
      lastSize = px;
    }
    act(() => st.finishAgent());
    const el = line(container)!;
    expect(el).toBe(node);
    expect(el.textContent?.replace(/\u00a0/g, ' ')).toBe(WHO); // rests whole
    expect(lastSize).toBeGreaterThanOrEqual(30);
    expect(lastSize).toBeLessThan(60);
  });

  it('keeps hyphenated words in nowrap spans', () => {
    const { container } = render(<Conversation />);
    act(() => void useStore.getState().agentLine('Self-taught, LeetCode-style.'));
    const nowrap = [...container.querySelectorAll('.y-w[data-nowrap]')].map((e) => e.textContent);
    expect(nowrap).toEqual(['Self-taught,', 'LeetCode-style.']);
  });

  it('shows the last whole reply again after an overlay closes', () => {
    const { container } = render(<Conversation />);
    const st = useStore.getState();
    act(() => void st.agentLine(WHO));
    act(() => st.openOverlay('build'));
    expect(container.querySelector('.y-convo')?.getAttribute('data-hidden')).toBe('true');
    act(() => st.closeOverlay());
    expect(container.querySelector('.y-convo')?.getAttribute('data-hidden')).toBe('false');
    expect(line(container)?.textContent?.replace(/\u00a0/g, ' ')).toBe(WHO);
  });

  it('a runner caption rests in place when the runner ends (same element, no re-say)', () => {
    const { container } = render(<Conversation />);
    const st = useStore.getState();
    const say = 'Ask me anything. Or tell me what to become.';
    act(() => st.setRunner({ kind: 'tour', say, lead: '', beat: 7, beats: 8, stepMode: false }));
    const during = line(container);
    act(() => {
      st.setRunner(null);
      st.agentLine(say, { quiet: true });
    });
    expect(line(container)).toBe(during);
    expect(line(container)?.getAttribute('data-quiet')).toBe('true');
  });

  it('shows a runner lead above the caption', () => {
    const { container } = render(<Conversation />);
    act(() => useStore.getState().setRunner({ kind: 'tour', say: 'Prompt Racers', lead: "Things I've shipped:", beat: 3, beats: 12, stepMode: false }));
    expect(container.querySelector('.y-lead')?.textContent).toBe("Things I've shipped:");
    expect(line(container)?.textContent).toBe('Prompt Racers');
  });
});
