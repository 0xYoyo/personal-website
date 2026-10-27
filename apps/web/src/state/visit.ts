// Returning visitors (POLISH1 A6): a visit counts when the previous one was
// last seen more than 30 minutes ago, not once per browser session, so a reload
// or a second tab is the same visit and a lunch break is a new one. The page
// keeps `lastSeen` fresh while it is open (heartbeat + pagehide), so the gap is
// measured from when the visitor actually left.
//
// Reads/writes the same `yoyo.v3.*` keys the agent client keeps (visits,
// lastSeen as an ISO string); every access is guarded.

export const VISIT_GAP_MS = 30 * 60_000;
const K_VISITS = 'yoyo.v3.visits';
const K_LAST = 'yoyo.v3.lastSeen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const read = (s: Store | null, k: string): string | null => {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
const write = (s: Store | null, k: string, v: string) => {
  try {
    s?.setItem(k, v);
  } catch {
    /* blocked storage: forget */
  }
};

export interface VisitInfo {
  /** a previous visit exists and ended more than 30 min ago */
  returning: boolean;
  /** visits including this one */
  visits: number;
  /** whether this page load started a new visit */
  newVisit: boolean;
}

/**
 * Decides whether this load is a new visit (a 30-minute gap since lastSeen) and
 * whether the visitor is returning. Read-only: call it before the agent client
 * starts (the client stamps `lastSeen` itself), then `settleVisits` after.
 */
export function readVisit(now = Date.now(), s: Store | null = storage()): VisitInfo {
  const prevVisits = Number(read(s, K_VISITS)) || 0;
  const lastRaw = read(s, K_LAST);
  const last = lastRaw ? Date.parse(lastRaw) : NaN;
  // no lastSeen on record (older builds of the site): treat the earlier visit as long gone
  const gapOk = !Number.isFinite(last) || now - last > VISIT_GAP_MS;
  const newVisit = prevVisits === 0 || gapOk;
  const visits = newVisit ? prevVisits + 1 : prevVisits;
  return { returning: prevVisits > 0 && gapOk, visits, newVisit };
}

let thisLoad: VisitInfo | null = null;
/**
 * `readVisit` once per page load: the boot effect may run twice (React StrictMode
 * in dev), and by the second run the agent client has already stamped lastSeen.
 */
export function readVisitOnce(): VisitInfo {
  return (thisLoad ??= readVisit());
}

/** Keep `lastSeen` current while the page is open. Returns a stop function. */
export function keepSeen(s: Store | null = storage(), everyMs = 60_000): () => void {
  const stamp = () => write(s, K_LAST, new Date().toISOString());
  const iv = setInterval(stamp, everyMs);
  addEventListener('pagehide', stamp);
  return () => {
    clearInterval(iv);
    removeEventListener('pagehide', stamp);
  };
}

/**
 * Store the count this rule decided (the agent client counts once per browser
 * session on its own, so this runs after it has started) and stamp lastSeen.
 */
export function settleVisits(info: VisitInfo, now = Date.now(), s: Store | null = storage()): void {
  write(s, K_VISITS, String(info.visits));
  write(s, K_LAST, new Date(now).toISOString());
}

// ---- the show once a visit (FIX4 W10): a same-tab reload is the same visit, and the show does not start by
// itself a second time in it; the visitor gets "watch again" instead.
const K_SHOW = 'yoyo.v3.showSeen';

function session(): Store | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Whether the show has started already in this tab's session. */
export function showSeen(s: Store | null = session()): boolean {
  return read(s, K_SHOW) === '1';
}

/** The show started: remember it for this tab's session. */
export function markShowSeen(s: Store | null = session()): void {
  write(s, K_SHOW, '1');
}
