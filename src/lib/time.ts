export const ISRAEL_TZ = 'Asia/Jerusalem';

/** "16:42" in Israel. */
export function israelTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit' }).format(date);
}

/**
 * Semester N of 6 at Reichman. The degree started Oct 2025 and ends Jul 2028:
 * two semesters a year, fall from October, spring from March.
 */
export function reichmanSemester(date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1..12
  const academicYear = (m >= 10 ? y : y - 1) - 2025; // 0 for 2025/26
  const spring = m >= 3 && m < 10;
  const n = academicYear * 2 + (spring ? 2 : 1);
  return Math.min(6, Math.max(1, n));
}

/** "3 hours ago", "yesterday", "5 days ago". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const min = Math.round(diff / 60_000);
  if (min < 60) return rtf.format(-Math.max(1, min), 'minute');
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  const d = Math.round(h / 24);
  if (d < 30) return rtf.format(-d, 'day');
  const mo = Math.round(d / 30);
  if (mo < 12) return rtf.format(-mo, 'month');
  return rtf.format(-Math.round(mo / 12), 'year');
}
