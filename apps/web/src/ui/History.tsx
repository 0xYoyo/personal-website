import { useEffect, useRef } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore, type Line } from '../state/store';
import { useDialog } from './useDialog';

/**
 * WAVE6 L2: the conversation as exchanges, newest first. An exchange is the visitor's question followed by
 * every line said after it (in reading order) up to the next question; whatever was said before the first
 * question (the opening greeting) is the oldest group, at the end.
 */
export function historyExchanges(lines: readonly Line[]): Line[][] {
  const groups: Line[][] = [];
  for (const l of lines) {
    if (l.role === 'visitor' || groups.length === 0) groups.push([l]);
    else groups[groups.length - 1]!.push(l);
  }
  return groups.reverse();
}

export function History() {
  const lines = useStore((s) => s.lines);
  const ref = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useDialog(ref);
  // opens on the newest exchange, which is at the top
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, []);
  const exchanges = historyExchanges(lines);
  return (
    <div className="y-history-wrap">
      <section ref={ref} className="y-history" role="dialog" aria-modal="true" aria-labelledby="y-history-title">
        <div className="y-history-head">
          <h2 id="y-history-title" className="y-history-title">
            {copy.history.title}
          </h2>
          <button className="y-textbtn" onClick={() => ctl.closeOverlay()}>
            {copy.history.close}
          </button>
        </div>
        <ol ref={list} className="y-history-list" tabIndex={0}>
          {lines.length === 0 && <li className="y-history-empty y-mono">{copy.history.empty}</li>}
          {exchanges.flatMap((group) =>
            group.map((l, i) => (
              <li
                key={l.id}
                className={l.role === 'agent' ? 'y-history-agent' : 'y-history-visitor y-mono'}
                data-first={i === 0 ? 'true' : undefined}
              >
                <span className="y-sr">{l.role === 'agent' ? copy.history.agent : copy.history.you}: </span>
                {l.text}
              </li>
            )),
          )}
        </ol>
      </section>
    </div>
  );
}

/** Screen-reader mirror of everything the agent says (SPEC §1.8). */
export function LiveRegion() {
  const lines = useStore((s) => s.lines);
  const runner = useStore((s) => s.runner);
  const done = lines.filter((l) => !l.streaming).slice(-6);
  return (
    <div className="y-sr" role="log" aria-live="polite" aria-label={copy.a11y.liveLabel}>
      {done.map((l) => (
        <p key={l.id}>
          {l.role === 'agent' ? '' : `${copy.history.you}: `}
          {l.text}
        </p>
      ))}
      {runner?.say && <p key={`r-${runner.say}`}>{runner.lead ? `${runner.lead} ` : ''}{runner.say}</p>}
    </div>
  );
}
