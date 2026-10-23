import { useCallback, useEffect, useRef, useState } from 'react';
import { factoryStore, formatDuration, useFactory } from '../store';
import { useFocusTrap } from '../../lib/focusTrap';
import { hireMailto } from '../../content/profile';
import { burst } from '../../data/stats';
import { replayBuild, shareUrl } from './actions';
import { endCardCopy } from '../endCardCopy';
import './factory-ui.css';

/** Shown once after #8 merges. Dismissible; never reopens by itself. */
export function EndCard() {
  const open = useFactory((s) => s.endCard === 'open');
  if (!open) return null;
  return <EndCardDialog />;
}

const days = (a: string, b: string) => Math.ceil((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** "3–7 Oct 2026" (UTC), or "30 Sep – 3 Oct 2026" across a month boundary. */
function dateRange(a: string, b: string): string {
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return sameMonth
    ? `${fmt(a, { day: 'numeric' })}–${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function EndCardDialog() {
  const counts = useFactory((s) => s.mergeCounts);
  const total = useFactory((s) => s.meta.length - 1);
  // Timed from loop start (the log's `init`, +00:00.0), the same clock as the log, so "in M:SS"
  // reads the same as the final log line's timestamp (truncated to whole seconds, as the log reads).
  const elapsed = useFactory((s) => (s.completedAt ?? Date.now()) - s.startedAt);
  const ref = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => factoryStore.getState().setEndCard('dismissed'), []);
  useFocusTrap(ref, true, close);
  useEffect(() => headingRef.current?.focus(), []);

  const time = formatDuration(Math.floor(elapsed / 1000) * 1000);
  const url = shareUrl();
  const copyText = endCardCopy({ counts, total, time, url });
  const shareHref = `https://x.com/intent/post?text=${encodeURIComponent(copyText.share)}`;
  const comparison = burst
    ? `Yoyo's loop shipped ${burst.prs.length} PRs across ${burst.issues.length} issues in ${days(burst.start, burst.end)} days (Unfiltered repo, ${dateRange(burst.start, burst.end)}).`
    : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overlay overlay--end" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="endcard" role="dialog" aria-modal="true" aria-labelledby="endcard-title" ref={ref}>
        <button type="button" className="endcard-close" onClick={close} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id="endcard-title" className="endcard-title" tabIndex={-1} ref={headingRef}>
          Loop complete.
        </h2>
        <p className="endcard-summary">
          {copyText.summary} {copyText.checks}
        </p>
        {comparison && (
          <p className="endcard-compare mono">{comparison}</p>
        )}
        <div className="endcard-actions">
          <a className="btn btn--solid" href={hireMailto}>
            Open a PR to hire me
          </a>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a className="btn" href={shareHref} target="_blank" rel="noopener noreferrer">
            Share on X
          </a>
          <button
            type="button"
            className="btn btn--text"
            onClick={() => {
              close();
              replayBuild();
            }}
          >
            Replay the build
          </button>
        </div>
      </div>
    </div>
  );
}
