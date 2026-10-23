// Visitor memory in localStorage under `yoyo.v3.*` (SPEC §2.3, §3.2).
// Every access is guarded: private windows and blocked storage just forget.
import { isStoryId, type StoryId } from '@yoyo/protocol';
import type { Memory, StoredBuild } from './types';

const P = 'yoyo.v3.';
const HOUR = 3_600_000;
const MAX_BUILDS = 3;
const MAX_BUILD_BYTES = 60_000;

export function createMemory(storage?: Storage): Memory {
  let s: Storage | null = null;
  try {
    s = storage ?? globalThis.localStorage ?? null;
  } catch {
    s = null;
  }
  const mem = new Map<string, string>(); // fallback when storage throws

  const get = (k: string): string | null => {
    try {
      return s ? s.getItem(P + k) : mem.get(k) ?? null;
    } catch {
      return mem.get(k) ?? null;
    }
  };
  const set = (k: string, v: string) => {
    mem.set(k, v);
    try {
      s?.setItem(P + k, v);
    } catch {
      /* quota or blocked: keep the in-memory copy */
    }
  };
  const json = <T>(k: string, fb: T): T => {
    const v = get(k);
    if (!v) return fb;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fb;
    }
  };

  return {
    name: () => get('name') ?? undefined,
    setName: (n) => set('name', n.trim().slice(0, 24)),
    visits: () => Number(get('visits') ?? 0) || 0,
    recordVisit() {
      const prev = Number(get('visits') ?? 0) || 0;
      set('visits', String(prev + 1));
      return prev;
    },
    builds: () => json<StoredBuild[]>('builds', []),
    addBuild(b) {
      const build: StoredBuild = { ...b, html: b.html.slice(0, MAX_BUILD_BYTES), id: Math.random().toString(36).slice(2, 10), at: Date.now() };
      const list = [build, ...json<StoredBuild[]>('builds', [])].slice(0, MAX_BUILDS);
      set('builds', JSON.stringify(list));
      const times = [...json<number[]>('buildTimes', []), build.at].filter((t) => build.at - t < HOUR);
      set('buildTimes', JSON.stringify(times));
      return build;
    },
    summary: () => get('summary') ?? undefined,
    setSummary: (v) => set('summary', v.slice(0, 280)),
    seenStories: () => json<string[]>('stories', []).filter(isStoryId),
    markStory(id: StoryId) {
      const seen = new Set(json<string[]>('stories', []));
      seen.add(id);
      set('stories', JSON.stringify([...seen]));
    },
    sound: () => get('sound') === '1',
    setSound: (on) => set('sound', on ? '1' : '0'),
    voice: () => get('voice') === '1',
    setVoice: (on) => set('voice', on ? '1' : '0'),
    recentBuilds: (now = Date.now()) => json<number[]>('buildTimes', []).filter((t) => now - t < HOUR),
    clear() {
      mem.clear();
      try {
        if (!s) return;
        const keys: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k?.startsWith(P)) keys.push(k);
        }
        keys.forEach((k) => s!.removeItem(k));
      } catch {
        /* ignore */
      }
    },
  };
}
