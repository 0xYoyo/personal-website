// The live half of "Now": a source that fails returns null and the section keeps what it knows.
import { useEffect, useState } from 'react';
import { fetchRecentActivity, type ActivityItem } from '../../lib/github';

const TIP_URL = 'https://mempool.space/api/blocks/tip/height';
const TIP_TIMEOUT_MS = 2_500;
const TIP_POLL_MS = 60_000;

/** The current time, re-rendered on every second boundary. */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

/** Bitcoin tip height from mempool.space, or null after 2.5 s or any failure. */
export async function fetchTipHeight(): Promise<number | null> {
  const ctrl = new AbortController();
  const timeout = window.setTimeout(() => ctrl.abort(), TIP_TIMEOUT_MS);
  try {
    const res = await fetch(TIP_URL, { signal: ctrl.signal });
    if (!res.ok) return null;
    const height = Number((await res.text()).trim());
    return Number.isInteger(height) && height > 0 ? height : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Polls the tip once a minute while the tab is visible. Keeps the last good value. */
export function useBlockHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.hidden) return;
      const h = await fetchTipHeight();
      if (alive && h !== null) setHeight(h);
    };
    void poll();
    const timer = window.setInterval(poll, TIP_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return height;
}

/** Latest public GitHub events, newest first; null until (and unless) they arrive. */
export function useGitHubActivity(): ActivityItem[] | null {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchRecentActivity(20, ctrl.signal).then((list) => {
      if (!ctrl.signal.aborted && list && list.length > 0) setItems(list);
    });
    return () => ctrl.abort();
  }, []);
  return items;
}
