import { useEffect, useLayoutEffect, useRef } from 'react';
import { factoryStore, formatStamp, isComplete, selectFocus, useFactory } from '../store';
import type { LogEntry, SectionMeta } from '../types';
import { cx } from '../../lib/cx';
import { MergeButton } from './MergeButton';
import { AutopilotSwitch } from './TopBar';
import { scrollToSection } from './actions';
import { useStateLine } from './useStateLine';
import { MERGE_KEY } from '../useMergeKey';
import './factory-ui.css';

/**
 * The factory's console. Collapsed: one line with the focused PR, its state
 * and Merge when ready. Expanded: the event log, which only ever records what
 * actually happened in this browser.
 */
export function ControlRoom() {
  const open = useFactory((s) => s.controlRoomOpen);
  const focus = useFactory(selectFocus);
  const complete = useFactory(isComplete);
  const skipped = useFactory((s) => s.skipped);
  const offer = useFactory((s) => s.autopilotOffer);
  const mode = useFactory((s) => s.mode);
  const total = useFactory((s) => s.meta.length - 1);
  const panelId = 'control-room-panel';
  // The offer takes the bar's one row, except while the bar has to carry the only Merge button.
  const needsMerge = useFactory(
    (s) => !!focus && s.sections[focus.id]?.state === 'awaiting-merge' && s.mode !== 'autopilot' && !s.slotButtonsInView.includes(focus.id),
  );
  const showOffer = offer === 'open' && !complete && !needsMerge;

  // Close on Escape when expanded
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && factoryStore.getState().setControlRoomOpen(false, true);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <aside className={cx('control', open && 'is-open', complete && 'is-complete')} aria-label="Control room">
      {open && (
        <div className="control-panel" id={panelId}>
          <div className="control-head">
            <p className="control-title">Control room</p>
            <div className="control-toggles">
              {!complete && <AutopilotSwitch on={mode === 'autopilot'} compact />}
              <SoundToggle />
            </div>
          </div>
          <EventLog />
        </div>
      )}
      <div className="control-bar">
        {showOffer ? (
          <AutopilotOffer />
        ) : focus && !complete ? (
          <FocusLine meta={focus} />
        ) : (
          <p className="control-line mono">
            <span className={cx('status-dot', complete ? 'is-done' : 'is-running')} aria-hidden="true" />
            {!complete ? 'claiming the next PR' : skipped ? 'all PRs merged' : `loop complete · CI green on all ${total}`}
          </p>
        )}
        <button
          type="button"
          className="control-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Collapse control room' : 'Expand control room log'}
          onClick={() => factoryStore.getState().setControlRoomOpen(!open, true)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="control-chevron">
            <path d="M2.5 7.5 6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function FocusLine({ meta }: { meta: SectionMeta }) {
  const state = useFactory((s) => s.sections[meta.id]?.state);
  const autopilot = useFactory((s) => s.mode === 'autopilot');
  const line = useStateLine(meta.id, meta.sourceLines);
  const waiting = state === 'awaiting-merge' && !autopilot;
  // One amber button on screen at a time: while the slot's own button is visible, the bar only says so.
  const slotButtonVisible = useFactory((s) => s.slotButtonsInView.includes(meta.id));
  return (
    <>
      <button type="button" className="control-line mono" onClick={() => scrollToSection(meta.id)} title="Jump to this PR">
        <span className={cx('status-dot', waiting ? 'is-waiting' : 'is-running')} aria-hidden="true" />
        <span className="control-pr">#{meta.pr}</span>
        <span className="control-state">{state === 'awaiting-merge' ? (autopilot ? 'autopilot merging' : 'waiting on you') : line}</span>
      </button>
      {state === 'awaiting-merge' && !slotButtonVisible && <MergeButton id={meta.id} pr={meta.pr} size="sm" shortcut={MERGE_KEY} />}
    </>
  );
}

function AutopilotOffer() {
  const answer = (yes: boolean) => factoryStore.getState().answerAutopilotOffer(yes);
  return (
    <div className="control-offer" role="status">
      <p className="control-offer-q">Let the loop run on its own?</p>
      <div className="control-offer-actions">
        <button type="button" className="console-btn" onClick={() => answer(true)}>
          Autopilot
        </button>
        <button type="button" className="console-btn console-btn--quiet" onClick={() => answer(false)}>
          I'll merge
        </button>
      </div>
    </div>
  );
}

function SoundToggle() {
  const on = useFactory((s) => s.sound);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="switch switch--compact"
      onClick={() => factoryStore.getState().setSound(!on)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">Sound</span>
    </button>
  );
}

function EventLog() {
  const log = useFactory((s) => s.log);
  const ref = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div className="log mono">
      <p className="log-truth">
        Checks here are the site's own gates (ran at build time): typecheck, lint, tests. Review notes are written copy.
        Everything else is logged as it happens in this browser.
      </p>
      <ol className="log-list" ref={ref} aria-live="polite" aria-relevant="additions">
        {log.map((e) => (
          <LogLine key={e.id} entry={e} />
        ))}
      </ol>
    </div>
  );
}

/** Let long file paths wrap at their slashes instead of mid-name. */
function breakPaths(text: string) {
  const parts = text.split('/');
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && '/'}
      {i > 0 && i < parts.length && <wbr />}
      {p}
    </span>
  ));
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <li className={cx('log-line', `log--${entry.tag}`)}>
      <span className="log-t">{formatStamp(entry.t)}</span>
      <span className="log-tag">{entry.tag}</span>
      <span className="log-text">{breakPaths(entry.text)}</span>
    </li>
  );
}
