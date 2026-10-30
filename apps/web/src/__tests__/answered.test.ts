import { beforeEach, describe, expect, it } from 'vitest';
import { meaningOf, moveChipsOn, PRIORITY, withAnswered } from '../state/answered';
import { useStore } from '../state/store';

// WAVE4 U5/U6: chips never go backwards.
describe('chips never go backwards (WAVE4 U5)', () => {
  it('a question typed in other words answers its chip', () => {
    expect(meaningOf('Who are you?')).toBe(meaningOf('who are you'));
    expect(meaningOf('Next one')).toBeNull();
  });

  it('an answered chip gives its place to the next unanswered one, in priority order', () => {
    let a = withAnswered([], 'Who are you?');
    expect(moveChipsOn(['Who are you?', 'What have you built?', 'Spell my name'], a)).toEqual([
      'Why should we hire you?',
      'What have you built?',
      'Spell my name',
    ]);
    a = withAnswered(a, 'Why should we hire you?');
    expect(moveChipsOn(['Who are you?', 'What have you built?', 'Spell my name'], a)[0]).toBe('What are you like?');
  });

  it('"What have you built?" may always stay; moves with no answer of their own stay too', () => {
    const a = withAnswered([], 'What have you built?');
    expect(moveChipsOn(['Next one', 'What have you built?', 'Build me something'], a)).toEqual(['Next one', 'What have you built?', 'Build me something']);
  });

  it('with everything answered a chip is dropped, never repeated', () => {
    const a = [...PRIORITY, 'Who are you?'].reduce<string[]>((x, q) => withAnswered(x, q), []);
    expect(moveChipsOn(['Who are you?', 'What are you like?', 'Next one'], a)).toEqual(['What have you built?', 'Next one']);
  });

  it('contact never offers "How do I reach you?" while it is open (U6)', () => {
    expect(moveChipsOn(['How do I reach you?', 'Copy my email'], [], { contactOpen: true })).not.toContain('How do I reach you?');
  });
});

describe('the store applies it to every row', () => {
  beforeEach(() => useStore.getState().reset());
  it('never shows "Who are you?" after it was answered', () => {
    const st = useStore.getState();
    st.markAnswered('who are you');
    st.setChips(['Who are you?', 'What have you built?', 'Spell my name']);
    expect(useStore.getState().chips).not.toContain('Who are you?');
    // the entry row padding ("Who are you?" is an ENTRY chip) is filtered too
    st.setChips(['Next one']);
    expect(useStore.getState().chips).not.toContain('Who are you?');
  });
});
