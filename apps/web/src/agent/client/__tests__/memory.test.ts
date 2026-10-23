import { describe, expect, it } from 'vitest';
import { createMemory, KEYS, localDay, safeStorage } from '../memory';
import { MemStorage } from './helpers';

describe('memory', () => {
  it('counts visits once per browser session and keeps the previous lastSeen', () => {
    const local = new MemStorage();
    let t = Date.UTC(2026, 9, 20, 10);
    const m1 = createMemory({ local, session: new MemStorage(), now: () => t });
    expect(m1.visits).toBe(1);
    expect(m1.lastSeen).toBeNull();
    // same session, another createMemory (e.g. HMR or a second brain) → no new visit
    const session = new MemStorage();
    t += 1000;
    const m2 = createMemory({ local, session, now: () => t });
    expect(m2.visits).toBe(2);
    expect(m2.lastSeen).toBe(new Date(Date.UTC(2026, 9, 20, 10)).toISOString());
    const m2b = createMemory({ local, session, now: () => t + 5 });
    expect(m2b.visits).toBe(2);
    expect(m2b.lastSeen).toBe(m2.lastSeen);
  });

  it('stores the name under yoyo.v3.name', () => {
    const local = new MemStorage();
    const m = createMemory({ local, session: new MemStorage() });
    m.setName('  Dana ');
    expect(local.getItem(KEYS.name)).toBe('Dana');
    expect(KEYS.name).toBe('yoyo.v3.name');
    expect(m.name).toBe('Dana');
    m.setName(null);
    expect(m.name).toBeNull();
  });

  it('keeps recent builds, with HTML only on the newest three', () => {
    const m = createMemory({ local: new MemStorage(), session: new MemStorage() });
    for (let i = 0; i < 10; i++) m.addBuild({ instruction: `b${i}`, at: i, ms: 1, bytes: 1, mode: 'live', html: `<p>${i}</p>` });
    const b = m.builds;
    expect(b).toHaveLength(8);
    expect(b[0]?.instruction).toBe('b9');
    expect(b.slice(0, 3).every((x) => x.html)).toBe(true);
    expect(b.slice(3).some((x) => x.html)).toBe(false);
  });

  it('keeps a short summary of the last visitor lines', () => {
    const m = createMemory({ local: new MemStorage(), session: new MemStorage() });
    for (const l of ['who is yoyo', 'what has he built', 'tell me about polybot', 'how do I reach him']) m.noteVisitorLine(l);
    expect(m.summary).toBe('what has he built / tell me about polybot / how do I reach him');
  });

  it('works when storage throws (private mode, sandboxed iframe)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const m = createMemory({ local: throwing, session: throwing });
    m.setName('Dana');
    expect(m.name).toBe('Dana'); // in-memory fallback for this page view
    expect(m.visits).toBe(1);
    expect(safeStorage(null).getItem('x')).toBeNull();
  });

  it('forget() wipes everything', () => {
    const local = new MemStorage();
    const m = createMemory({ local, session: new MemStorage() });
    m.setName('Dana');
    m.noteVisitorLine('hi');
    m.forget();
    expect(local.m.size).toBe(0);
    expect(m.snapshot()).toEqual({ name: null, builds: [], summary: '', visits: 0, lastSeen: null });
  });

  it('localDay uses the visitor’s calendar day', () => {
    expect(localDay(new Date(2026, 0, 2, 23, 59).getTime())).toBe('2026-01-02');
  });
});
