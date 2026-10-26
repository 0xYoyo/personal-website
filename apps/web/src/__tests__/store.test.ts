import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, visibleExchange } from '../state/store';

const S = () => useStore.getState();

describe('store', () => {
  beforeEach(() => S().reset());

  it('streams an agent line word by word and finishes it', () => {
    S().pushVisitor('who is yoyo');
    S().startAgent();
    expect(S().streaming).toBe(true);
    S().appendAgentWord('Yoav');
    S().appendAgentWord('Zrihan.');
    S().finishAgent();
    const last = S().lines.at(-1)!;
    expect(last).toMatchObject({ role: 'agent', text: 'Yoav Zrihan.', streaming: false });
    expect(S().streaming).toBe(false);
  });

  it('drops an empty agent line (action-only reply)', () => {
    S().startAgent();
    S().finishAgent();
    expect(S().lines).toHaveLength(0);
  });

  it('opens and closes overlays; closing a card clears the project', () => {
    S().showProject('polybot');
    expect(S()).toMatchObject({ overlay: 'card', project: 'polybot' });
    S().closeOverlay();
    expect(S()).toMatchObject({ overlay: 'none', project: null });
  });

  it('closing the build overlay returns the bar to chat mode', () => {
    S().openOverlay('build');
    S().setBarMode('change');
    S().closeOverlay();
    expect(S().barMode).toBe('chat');
  });

  it('clamps chips to 3–5 and bumps the key', () => {
    const k = S().chipsKey;
    S().setChips(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(S().chips).toHaveLength(5);
    expect(S().chipsKey).toBe(k + 1);
    S().setChips([]);
    expect(S().chips).toEqual([]);
  });

  it('shows the last two exchanges', () => {
    S().agentLine('hey.');
    S().pushVisitor('who');
    S().agentLine('Yoav.');
    let v = visibleExchange(S().lines);
    expect(v.prevAgent?.text).toBe('hey.');
    expect(v.agent?.text).toBe('Yoav.');
    expect(v.visitor?.text).toBe('who');
    S().pushVisitor('and?');
    v = visibleExchange(S().lines);
    expect(v.agent?.text).toBe('Yoav.');
    expect(v.visitor?.text).toBe('and?');
    // the muted turn stays until the next reply (WAVE3 S2)
    expect(v.prevAgent?.text).toBe('hey.');
  });
});
