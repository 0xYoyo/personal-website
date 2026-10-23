import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PRState } from '../types';
import { tokenizeLines, type Token } from './tokenize';
import { lineStarts as startsOf, streamedChars, visibleLines as visibleOf } from '../stream';
import './factory-ui.css';

interface Props {
  source: string;
  filePath: string;
  state: PRState;
  /** Date.now() when building started */
  buildStartedAt: number;
  buildMs: number;
}

/**
 * Streams the section's own source as an all-addition unified diff. The
 * stream is paced by the clock, not by frames, so it ends exactly when the
 * scheduler moves the PR out of "building".
 */
export function DiffStream({ source, filePath, state, buildStartedAt, buildMs }: Props) {
  const lines = useMemo(() => tokenizeLines(source), [source]);
  const lineStarts = useMemo(() => startsOf(source), [source]);

  const total = source.length;
  const shown = useStreamedChars(state, buildStartedAt, buildMs, total);
  const streaming = state === 'building' && shown < total;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lines fully or partly revealed
  const visibleLines = Math.min(lines.length, visibleOf(lineStarts, shown));
  const partialChars = visibleLines > 0 ? shown - lineStarts[visibleLines - 1]! : 0;

  // Follow the stream, including its last line (the frame it finishes is the frame streaming ends).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && state !== 'queued') el.scrollTop = el.scrollHeight;
  }, [visibleLines, state]);

  return (
    <div className="diff" aria-label={`Diff of ${filePath}`}>
      <div className="diff-head mono">
        <span className="diff-path">{filePath}</span>
        <span className="diff-count">+{state === 'queued' ? 0 : visibleLines}</span>
      </div>
      <div className="diff-body mono" ref={scrollRef} tabIndex={0} aria-busy={streaming}>
        {state === 'queued' ? (
          <p className="diff-empty">Waiting for a free builder.</p>
        ) : (
          <table className="diff-table" role="presentation">
            <tbody>
              {lines.slice(0, visibleLines).map((tokens, i) => {
                const last = i === visibleLines - 1;
                return (
                  <DiffLine
                    key={i}
                    n={i + 1}
                    tokens={tokens}
                    limit={last && streaming ? partialChars : Infinity}
                    caret={last && streaming}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const DiffLine = memo(function DiffLine({
  n,
  tokens,
  limit,
  caret,
}: {
  n: number;
  tokens: Token[];
  limit: number;
  caret: boolean;
}) {
  const parts: JSX.Element[] = [];
  let used = 0;
  for (let i = 0; i < tokens.length && used < limit; i++) {
    const t = tokens[i]!;
    const text = used + t.text.length > limit ? t.text.slice(0, limit - used) : t.text;
    used += text.length;
    parts.push(
      t.kind === 'plain' ? (
        <span key={i}>{text}</span>
      ) : (
        <span key={i} className={`syn-${t.kind}`}>
          {text}
        </span>
      ),
    );
  }
  return (
    <tr className="diff-line">
      <td className="diff-n" aria-hidden="true">
        {n}
      </td>
      <td className="diff-sign" aria-hidden="true">
        +
      </td>
      <td className="diff-code">
        {parts}
        {caret && <span className="diff-caret" aria-hidden="true" />}
      </td>
    </tr>
  );
});

function useStreamedChars(state: PRState, startedAt: number, buildMs: number, total: number): number {
  const target = state === 'queued' ? 0 : state === 'building' ? null : total;
  const [chars, setChars] = useState(() => (target ?? streamedChars(state, startedAt, buildMs, total)));

  useEffect(() => {
    if (target !== null) {
      setChars(target);
      return;
    }
    let raf = 0;
    const tick = () => {
      const c = streamedChars('building', startedAt, buildMs, total);
      setChars(c);
      if (c < total) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [target, startedAt, buildMs, total]);

  return chars;
}
