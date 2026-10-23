import { useEffect, useRef } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { useDialog } from './useDialog';

export function History() {
  const lines = useStore((s) => s.lines);
  const ref = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useDialog(ref);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, []);
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
          {lines.map((l) => (
            <li key={l.id} className={l.role === 'agent' ? 'y-history-agent' : 'y-history-visitor y-mono'}>
              <span className="y-sr">{l.role === 'agent' ? copy.history.agent : copy.history.you}: </span>
              {l.text}
            </li>
          ))}
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
      {runner?.say && <p key={`r-${runner.say}`}>{runner.say}</p>}
      {runner?.sub && <p key={`rs-${runner.sub}`}>{runner.sub}</p>}
    </div>
  );
}
