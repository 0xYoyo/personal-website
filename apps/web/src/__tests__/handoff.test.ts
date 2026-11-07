// WAVE6 T1: the entrance flows straight into the show on an automatic first presentation; anything the visitor does
// before it starts calls it off for good (the page lands on the greeting); a tab that already saw the show greets.
import { describe, expect, it } from 'vitest';
import { armHandoff } from '../ui/runner/handoff';

const idle = { overlay: 'none', idleSpent: false };
const key = (k: string) => Object.assign(new Event('keydown'), { key: k });

describe('armHandoff (WAVE6 T1)', () => {
  it('untouched: the show starts at the entrance end, once', () => {
    const t = new EventTarget();
    const h = armHandoff({ eligible: true, target: t });
    expect(h.cancelled).toBe(false);
    expect(h.take(idle)).toBe(true);
    // spent: it never starts again by itself
    expect(h.cancelled).toBe(true);
    expect(h.take(idle)).toBe(false);
  });

  it('a show already seen in this tab (or ?skipEntry): never by itself', () => {
    const h = armHandoff({ eligible: false, target: new EventTarget() });
    expect(h.cancelled).toBe(true);
    expect(h.take(idle)).toBe(false);
  });

  it.each(['pointerdown', 'wheel'])('a %s during the entrance calls the show off', (type) => {
    const t = new EventTarget();
    const h = armHandoff({ eligible: true, target: t });
    t.dispatchEvent(new Event(type));
    expect(h.cancelled).toBe(true);
    expect(h.take(idle)).toBe(false);
  });

  it('a key during the entrance calls it off; a modifier held alone does not', () => {
    const t = new EventTarget();
    const h = armHandoff({ eligible: true, target: t });
    for (const k of ['Shift', 'Meta', 'Control', 'Alt']) t.dispatchEvent(key(k));
    expect(h.cancelled).toBe(false);
    t.dispatchEvent(key('h'));
    expect(h.take(idle)).toBe(false);
    const h2 = armHandoff({ eligible: true, target: t });
    t.dispatchEvent(key('ArrowRight'));
    expect(h2.take(idle)).toBe(false);
  });

  it('a card or panel open at the entrance end, or a message already sent: no show', () => {
    expect(armHandoff({ eligible: true, target: new EventTarget() }).take({ overlay: 'card', idleSpent: false })).toBe(false);
    expect(armHandoff({ eligible: true, target: new EventTarget() }).take({ overlay: 'build', idleSpent: false })).toBe(false);
    expect(armHandoff({ eligible: true, target: new EventTarget() }).take({ overlay: 'none', idleSpent: true })).toBe(false);
  });

  it('stops listening once taken or disarmed', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const t = {
      addEventListener: (type: string) => void added.push(type),
      removeEventListener: (type: string) => void removed.push(type),
    };
    armHandoff({ eligible: true, target: t }).take(idle);
    expect(added.sort()).toEqual(['keydown', 'pointerdown', 'wheel']);
    expect(removed.sort()).toEqual(['keydown', 'pointerdown', 'wheel']);
    removed.length = 0;
    armHandoff({ eligible: true, target: t }).disarm();
    expect(removed.sort()).toEqual(['keydown', 'pointerdown', 'wheel']);
  });
});
