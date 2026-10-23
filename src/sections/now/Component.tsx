import { useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { commits, commitCount, fmt, lastCommit } from '../../data/stats';
import { reichmanSemester, relativeTime } from '../../lib/time';
import { changedDigits, eventLines, formatHeight, hh, inWindow, israelClock, quietWindow } from './format';
import { useBlockHeight, useClock, useGitHubActivity } from './useLive';
import './now.css';

// Computed from the baked commits: the longest stretch of the day with none.
const QUIET = quietWindow(commits.map((c) => c.d));
const LAST_KNOWN = [...commits]
  .sort((a, b) => Date.parse(b.d) - Date.parse(a.d))
  .slice(0, 3)
  .map((c) => ({ repo: c.r, type: `commit ${c.s}`, at: c.d }));

function Height({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const text = formatHeight(value);
  // derive-from-props: remember the last height shown and which digits moved
  const [seen, setSeen] = useState<{ text: string; changed: boolean[] | null }>({ text, changed: null });
  if (seen.text !== text) setSeen({ text, changed: reduce ? null : changedDigits(seen.text, text) });
  const changed = seen.text === text ? seen.changed : null;
  return (
    <span className="now-height mono" aria-label={text}>
      {[...text].map((ch, i) => (
        <span
          // a new key restarts the roll, once, for each digit that changed
          key={changed?.[i] ? `${i}-${text}` : i}
          className={changed?.[i] ? 'now-digit is-rolling' : 'now-digit'}
          aria-hidden="true"
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

export default function NowSection() {
  const now = useClock();
  const height = useBlockHeight();
  const live = useGitHubActivity();
  const clock = israelClock(now);
  const asleep = QUIET !== null && inWindow(clock.hour, QUIET);
  const activity = eventLines(live ?? LAST_KNOWN, (iso) => relativeTime(iso, now.getTime()));
  const lastPush = live?.find((e) => e.type === 'push');

  return (
    <div className="now">
      <p className="lede now-lede">Live where it can be, last known where it can't.</p>
      <dl className="now-list">
        <div className="now-row">
          <dt>Time in Israel</dt>
          <dd>
            <time className="now-clock" dateTime={now.toISOString()}>
              <span className="now-day">{clock.day}</span> <span className="mono now-time">{clock.time}</span>
            </time>
            {asleep && QUIET && (
              <p className="now-note muted">
                Probably asleep. None of my {fmt(commitCount)} public commits were made between {hh(QUIET.from)}{'\u00a0'}and{'\u00a0'}
                {hh(QUIET.to)}.
              </p>
            )}
          </dd>
        </div>
        <div className="now-row">
          <dt>University</dt>
          <dd>Semester {reichmanSemester(now)} of 6 at Reichman University</dd>
        </div>
        <div className="now-row">
          <dt>
            GitHub activity
            {!live && <span className="now-tag"> (last known)</span>}
          </dt>
          <dd>
            <ul className="now-events mono">
              {activity.map((e) => (
                <li key={`${e.repo}-${e.what}-${e.when}`}>
                  <span>{e.repo}</span>
                  <span className="now-sep" aria-hidden="true"> · </span>
                  <span className="muted">{e.what}</span>
                  <span className="now-sep" aria-hidden="true"> · </span>
                  <span className="muted">{e.when}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {height !== null && (
          <div className="now-row">
            <dt>Block height</dt>
            <dd>
              Bitcoin is at block <Height value={height} />. I've been watching since 2021.
            </dd>
          </div>
        )}
        <div className="now-row">
          <dt>Looking for</dt>
          <dd>A student software role, 2–3 days a week</dd>
        </div>
        <div className="now-row">
          <dt>{lastPush ? 'Last public push' : 'Last public commit'}</dt>
          <dd>
            {lastPush
              ? `${relativeTime(lastPush.at, now.getTime())} (${lastPush.repo})`
              : lastCommit && `${relativeTime(lastCommit.d, now.getTime())} (${lastCommit.r})`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
