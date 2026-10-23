// Visitor memory in localStorage under `yoyo.v3.*`. Every access is guarded:
// storage can throw (private mode, sandboxed iframes) and the site must still work.

export interface StoredBuild {
  instruction: string;
  /** epoch ms */
  at: number;
  ms: number;
  bytes: number;
  mode: 'live' | 'scripted';
  /** example id when the scripted builder answered */
  example?: string;
  /** kept only for the most recent builds and when ≤ 60 kB */
  html?: string;
}

export interface MemorySnapshot {
  name: string | null;
  builds: StoredBuild[];
  summary: string;
  visits: number;
  /** ISO time of the previous visit (before this one), or null on a first visit */
  lastSeen: string | null;
}

export interface Memory extends MemorySnapshot {
  setName(name: string | null): void;
  addBuild(b: StoredBuild): void;
  /** remember one visitor line for the "welcome back" summary */
  noteVisitorLine(text: string): void;
  /** wipe everything under yoyo.v3.* */
  forget(): void;
  snapshot(): MemorySnapshot;
}

export const KEYS = {
  name: 'yoyo.v3.name',
  builds: 'yoyo.v3.builds',
  summary: 'yoyo.v3.summary',
  visits: 'yoyo.v3.visits',
  lastSeen: 'yoyo.v3.lastSeen',
  scriptedDay: 'yoyo.v3.scriptedDay',
  exampleIdx: 'yoyo.v3.exampleIdx',
  session: 'yoyo.v3.session',
} as const;

const MAX_BUILDS = 8;
const MAX_HTML_BUILDS = 3;
const MAX_HTML_BYTES = 60_000;
const SUMMARY_LINES = 3;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function safeStorage(s: StorageLike | null | undefined): StorageLike {
  const mem = new Map<string, string>();
  const fallback: StorageLike = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
  if (!s) return fallback;
  return {
    getItem: (k) => {
      try {
        return s.getItem(k);
      } catch {
        return fallback.getItem(k);
      }
    },
    setItem: (k, v) => {
      try {
        s.setItem(k, v);
      } catch {
        fallback.setItem(k, v);
      }
    },
    removeItem: (k) => {
      try {
        s.removeItem(k);
      } catch {
        fallback.removeItem(k);
      }
    },
  };
}

export function defaultStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | null {
  try {
    return (globalThis as unknown as Record<string, StorageLike | undefined>)[kind] ?? null;
  } catch {
    return null;
  }
}

function readJson<T>(s: StorageLike, k: string, fallback: T): T {
  const raw = s.getItem(k);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Creates the memory view and records this visit: `visits` increments once per
 * browser session (tracked in sessionStorage), and `lastSeen` keeps the time of
 * the previous visit so the UI can say "welcome back".
 */
export function createMemory(opts: { local?: StorageLike | null; session?: StorageLike | null; now?: () => number } = {}): Memory {
  const s = safeStorage(opts.local === undefined ? defaultStorage('localStorage') : opts.local);
  const ss = safeStorage(opts.session === undefined ? defaultStorage('sessionStorage') : opts.session);
  const now = opts.now ?? Date.now;

  let previousSeen: string | null = s.getItem(KEYS.lastSeen);
  const sessionMark = ss.getItem(KEYS.session);
  if (!sessionMark) {
    const visits = (Number(s.getItem(KEYS.visits)) || 0) + 1;
    s.setItem(KEYS.visits, String(visits));
    ss.setItem(KEYS.session, previousSeen ?? 'first');
  } else {
    previousSeen = sessionMark === 'first' ? null : sessionMark;
  }
  s.setItem(KEYS.lastSeen, new Date(now()).toISOString());

  const mem: Memory = {
    get name() {
      const n = s.getItem(KEYS.name);
      return n && n.trim() ? n : null;
    },
    get builds() {
      const b = readJson<StoredBuild[]>(s, KEYS.builds, []);
      return Array.isArray(b) ? b : [];
    },
    get summary() {
      return s.getItem(KEYS.summary) ?? '';
    },
    get visits() {
      return Number(s.getItem(KEYS.visits)) || 0;
    },
    get lastSeen() {
      return previousSeen;
    },
    setName(name) {
      if (name && name.trim()) s.setItem(KEYS.name, name.trim().slice(0, 40));
      else s.removeItem(KEYS.name);
    },
    addBuild(b) {
      const list = [b, ...mem.builds].slice(0, MAX_BUILDS).map((x, i) => {
        if (i < MAX_HTML_BUILDS && x.html && x.html.length <= MAX_HTML_BYTES) return x;
        const { html: _html, ...rest } = x;
        return rest;
      });
      s.setItem(KEYS.builds, JSON.stringify(list));
    },
    noteVisitorLine(text) {
      const line = text.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!line) return;
      const prev = mem.summary ? mem.summary.split(' / ') : [];
      s.setItem(KEYS.summary, [...prev, line].slice(-SUMMARY_LINES).join(' / '));
    },
    forget() {
      for (const k of Object.values(KEYS)) s.removeItem(k);
      ss.removeItem(KEYS.session);
      previousSeen = null;
    },
    snapshot() {
      return { name: mem.name, builds: mem.builds, summary: mem.summary, visits: mem.visits, lastSeen: mem.lastSeen };
    },
  };
  return mem;
}

/** Per-browser state the brain itself needs (not part of the visitor-facing memory). */
export function createBrainState(local: StorageLike) {
  return {
    scriptedDay: () => local.getItem(KEYS.scriptedDay),
    setScriptedDay: (day: string) => local.setItem(KEYS.scriptedDay, day),
    nextExampleIndex: (count: number) => {
      const i = (Number(local.getItem(KEYS.exampleIdx)) || 0) % count;
      local.setItem(KEYS.exampleIdx, String((i + 1) % count));
      return i;
    },
  };
}

/** Local calendar day (the visitor's "today"), YYYY-MM-DD. */
export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
