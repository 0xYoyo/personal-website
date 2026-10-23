// The agent's words: large type, streamed word by word, split into ≤ 2-line
// beats that replace each other (click to advance). The visitor's line echoes
// in mono beneath. The previous exchange stays faintly above.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { DISPLAY_FONT_FAMILY } from '../design';
import { useStore, visibleExchange } from '../state/store';
import { beatHold, canvasMeasure, packBeats, type Measure } from './beats';

interface Metrics {
  measure: Measure;
  width: number;
}

function useMetrics(ref: React.RefObject<HTMLElement>): Metrics | null {
  const [m, setM] = useState<Metrics | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize) || 56;
      const width = el.clientWidth * 0.985;
      setM({ measure: canvasMeasure(px, DISPLAY_FONT_FAMILY, 600, -0.025), width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    void document.fonts?.ready.then(update);
    return () => ro.disconnect();
  }, [ref]);
  return m;
}

export function Conversation() {
  const lines = useStore((s) => s.lines);
  const runner = useStore((s) => s.runner);
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const entryName = useStore((s) => s.entryName);
  const { prevAgent, agent, visitor } = visibleExchange(lines);
  const textRef = useRef<HTMLDivElement>(null);
  const metrics = useMetrics(textRef);

  const agentText = runner ? runner.say : agent?.text ?? '';
  const agentKey = runner ? `r-${runner.kind}-${runner.say}` : `a-${agent?.id ?? 0}`;
  const beats = useMemo(() => {
    const words = agentText.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    return metrics ? packBeats(words, metrics.measure, metrics.width, 2) : [agentText];
  }, [agentText, metrics]);

  const [beatState, setBeatState] = useState({ key: agentKey, i: 0 });
  const beatIdx = beatState.key === agentKey ? Math.min(beatState.i, beats.length - 1) : 0;
  const complete = beatIdx < beats.length - 1; // the shown beat is full; a later one exists
  const shown = beats[beatIdx] ?? '';

  useEffect(() => {
    if (!complete) return;
    const t = setTimeout(() => setBeatState({ key: agentKey, i: beatIdx + 1 }), beatHold(shown));
    return () => clearTimeout(t);
  }, [complete, beatIdx, agentKey, shown]);

  const advance = () => {
    if (complete) setBeatState({ key: agentKey, i: beatIdx + 1 });
  };

  const hidden = overlay === 'card' || overlay === 'build' || overlay === 'contact' || overlay === 'game' || overlay === 'history';
  const waiting = !runner && lines[lines.length - 1]?.role === 'visitor';
  const echo = runner ? null : visitor;

  return (
    <section className="y-convo" data-hidden={hidden} data-phase={phase}>
      {entryName && <p className="y-entry-name y-mono" aria-hidden="true">{entryName}</p>}
      {prevAgent && !runner && (
        <p className="y-prev" key={`p-${prevAgent.id}`} aria-hidden="true">
          {prevAgent.text}
        </p>
      )}
      <div className="y-agent" ref={textRef} data-waiting={waiting} onClick={advance} aria-hidden="true">
        {shown && (
          <p className="y-agent-line" key={`${agentKey}-${beatIdx}`}>
            {shown}
            {complete && <span className="y-beat-more" aria-hidden="true" />}
          </p>
        )}
      </div>
      {runner?.sub && (
        <p className="y-sub y-mono" key={`s-${runner.sub}`} aria-hidden="true">
          {runner.sub}
        </p>
      )}
      {echo && (
        <p className="y-echo y-mono" key={`e-${echo.id}`} aria-hidden="true">
          {echo.text}
        </p>
      )}
      {!runner && lines.length > 2 && (
        <button className="y-textbtn y-history-toggle" onClick={() => ctl.history()} tabIndex={hidden ? -1 : 0}>
          {copy.history.open}
        </button>
      )}
    </section>
  );
}

/** The runner's controls (tour, stories): Back · Next · Skip, and the step hint. */
export function RunnerControls() {
  const runner = useStore((s) => s.runner);
  if (!runner) return null;
  return (
    <div className="y-runner" role="group" aria-label={runner.kind === 'tour' ? 'Tour' : 'Stories'}>
      {runner.stepMode && <span className="y-runner-hint y-mono">{copy.runner.stepHint}</span>}
      <button className="y-textbtn" onClick={(e) => { e.stopPropagation(); ctl.runnerPrev(); }} disabled={runner.beat <= 0}>
        {copy.runner.prev}
      </button>
      <button className="y-textbtn" onClick={(e) => { e.stopPropagation(); ctl.runnerNext(); }}>
        {copy.runner.next}
      </button>
      <button className="y-textbtn" onClick={(e) => { e.stopPropagation(); ctl.runnerSkip(); }}>
        {copy.runner.skip}
      </button>
    </div>
  );
}
