// Pure formatting helpers for the Now section (unit-tested in __tests__).
import { ISRAEL_TZ } from '../../lib/time';

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ISRAEL_TZ,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface IsraelClock {
  /** "Friday" */
  day: string;
  /** "16:42:07" */
  time: string;
  /** 0..23, Israel wall clock */
  hour: number;
}

/** Day name and HH:MM:SS in Israel, plus the hour for the "asleep" check. */
export function israelClock(date: Date): IsraelClock {
  const parts = clockFmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return {
    day: get('weekday'),
    time: `${String(hour).padStart(2, '0')}:${get('minute')}:${get('second')}`,
    hour,
  };
}

const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hourCycle: 'h23' });

export interface QuietWindow {
  /** first hour with no commits, inclusive */
  from: number;
  /** first hour after the window, exclusive */
  to: number;
}

/**
 * The longest run of Israel-time hours in which none of the given commits was
 * made (wrapping past midnight). Null if every hour has at least one commit.
 */
export function quietWindow(isoDates: readonly string[]): QuietWindow | null {
  const counts = new Array<number>(24).fill(0);
  for (const iso of isoDates) counts[Number(hourFmt.format(new Date(iso))) % 24]! += 1;
  if (counts.every((n) => n > 0)) return null;
  if (counts.every((n) => n === 0)) return { from: 0, to: 0 };
  let best: QuietWindow | null = null;
  let bestLen = 0;
  for (let start = 0; start < 24; start++) {
    // only start a run right after a busy hour, so runs are maximal
    if (counts[start] !== 0 || counts[(start + 23) % 24] === 0) continue;
    let len = 0;
    while (len < 24 && counts[(start + len) % 24] === 0) len++;
    if (len > bestLen) {
      bestLen = len;
      best = { from: start, to: (start + len) % 24 };
    }
  }
  return best;
}

export function inWindow(hour: number, w: QuietWindow): boolean {
  return w.from <= w.to ? hour >= w.from && hour < w.to : hour >= w.from || hour < w.to;
}

/** "04:00" */
export function hh(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** 968123 -> "968,123" */
export function formatHeight(height: number): string {
  return new Intl.NumberFormat('en-US').format(height);
}

/**
 * Which characters of `next` differ from `prev`, aligned from the right (so a
 * height gaining a digit still lines up). Used to roll only the changed digits.
 */
export function changedDigits(prev: string, next: string): boolean[] {
  const offset = next.length - prev.length;
  return [...next].map((ch, i) => prev[i - offset] !== ch);
}

export interface EventLine {
  repo: string;
  /** "push", "3 pushes", "commit a72eb1b" */
  what: string;
  /** "4 days ago" */
  when: string;
}

function plural(type: string): string {
  if (type === 'made public') return 'repos made public';
  return /(sh|ch|s|x)$/.test(type) ? `${type}es` : `${type}s`;
}

/**
 * Events as display lines, newest first, with neighbours that would read
 * identically (same repo, type and relative time) folded into one counted line.
 */
export function eventLines(
  items: readonly { repo: string; type: string; at: string }[],
  when: (iso: string) => string,
  limit = 3,
): EventLine[] {
  const out: (EventLine & { type: string; n: number })[] = [];
  for (const e of items) {
    const w = when(e.at);
    const last = out[out.length - 1];
    if (last && last.repo === e.repo && last.type === e.type && last.when === w) {
      last.n += 1;
      last.what = `${last.n} ${plural(e.type)}`;
    } else {
      if (out.length === limit) break;
      out.push({ repo: e.repo, type: e.type, what: e.type, when: w, n: 1 });
    }
  }
  return out.map(({ repo, what, when: w }) => ({ repo, what, when: w }));
}
