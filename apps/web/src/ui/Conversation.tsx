// The agent's words (SPEC §2.3, POLISH2 A1). A reply is shown as turns: each
// turn is one block of large type, sized once for its whole text on a hidden
// clone before it is shown (ui/fit.ts), that streams in word by word and
// never retracts a word or changes size while it is read. When the next turn
// arrives the previous one fades to muted beneath (one at most; History has
// the rest). The visitor's line echoes in mono between them. The pacing lives
// in ui/turns.ts, driven by the controller.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore, visibleExchange } from '../state/store';
import { CAPTION_TYPE_MS } from './runner/engine';
import { isMobileWidth, measureOn, toWords } from './fit';

/** ms between words when a whole line lands at once (a notice, a resting line) */
const STAGGER_MS = 45;

interface View {
  key: string;
  text: string;
  /** the whole text when it is known before the words stream (a turn) */
  full: string;
  size: number | undefined;
  streaming: boolean;
  quiet: boolean;
  lead: string;
  caption: boolean;
}

function useViewport(): number {
  const [vw, setVw] = useState(() => (typeof innerWidth === 'number' ? innerWidth : 1440));
  useEffect(() => {
    const on = () => setVw(innerWidth);
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return vw;
}

function useFontsReady(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => live && setN((x) => x + 1));
    return () => {
      live = false;
    };
  }, []);
  return n;
}

/** Where the words must end: above the chips (or the bar when there are none). */
function floorY(): number {
  const chips = document.querySelector('.y-chips[data-hidden="false"] .y-chips-row');
  const bar = document.querySelector('.y-bar');
  const r = (chips ?? bar)?.getBoundingClientRect();
  return r && r.height ? r.top - 20 : innerHeight - 160;
}

export function Conversation() {
  const lines = useStore((s) => s.lines);
  const runner = useStore((s) => s.runner);
  const overlay = useStore((s) => s.overlay);
  const phase = useStore((s) => s.phase);
  const entryName = useStore((s) => s.entryName);
  useStore((s) => s.chipsKey); // re-check the room beneath when the chips change
  const { prevAgent, agent, visitor } = visibleExchange(lines);
  const vw = useViewport();
  const fontsN = useFontsReady(); // re-fit once the display font has loaded
  const sectionRef = useRef<HTMLElement>(null);
  const cloneRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const prevRef = useRef<HTMLParagraphElement>(null);
  const sized = useRef({ key: '', vw: 0, fonts: 0 });

  // The pacer sizes each turn on a hidden clone of this line before showing it.
  useEffect(() => {
    ctl.setMeasure((text) => {
      const clone = cloneRef.current;
      return clone ? measureOn(clone, text, innerWidth) : null;
    });
    return () => ctl.setMeasure(null);
  }, []);

  // A runner caption and the line it leaves behind share a key (`t:` + text), so
  // the last caption rests in place when the runner ends instead of re-appearing.
  // Until the runner's first caption lands, the line before it stays (POLISH2 A3).
  const lineView = (): View | null =>
    agent
      ? {
          key: agent.quiet ? `t:${agent.text}` : `a:${agent.id}`,
          text: agent.text,
          full: agent.full ?? agent.text,
          size: agent.size,
          streaming: agent.streaming,
          quiet: !!agent.quiet,
          lead: '',
          caption: false,
        }
      : null;
  const view: View | null =
    runner && runner.say
      ? { key: `t:${runner.say}`, text: runner.say, full: runner.say, size: undefined, streaming: false, quiet: false, lead: runner.lead, caption: true }
      : lineView();

  const words = useMemo(() => toWords(view?.text ?? ''), [view?.text]);
  // words already there when a line mounts arrive staggered (a caption types in); streamed ones as they come
  const stagger = useMemo(
    () => (view && !view.streaming && !view.quiet ? words.length : 0),
    // only when a new line mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view?.key],
  );
  const staggerMs = view?.caption ? CAPTION_TYPE_MS : STAGGER_MS;

  // Size once per turn: the pacer's size, else (a caption, a resting line) one
  // measure of the whole text. Only a new viewport width or the font loading
  // sizes it again — never a streamed word.
  useLayoutEffect(() => {
    const el = lineRef.current;
    const clone = cloneRef.current;
    if (!el || !clone || !view) return;
    const s = sized.current;
    if (s.key === view.key && s.vw === vw && s.fonts === fontsN) return;
    const fresh = s.key !== view.key;
    const px = fresh && view.size ? view.size : measureOn(clone, view.full, vw).px;
    el.style.fontSize = `${px}px`;
    sized.current = { key: view.key, vw, fonts: fontsN };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.key, view?.full, view?.size, vw, fontsN]);

  // Then decide whether the previous turn has room beneath.
  useLayoutEffect(() => {
    const sec = sectionRef.current;
    const prev = prevRef.current;
    const mobile = isMobileWidth(vw);
    if (sec) sec.dataset.tall = 'false';
    const overflows = () => !!sec && sec.scrollHeight > sec.clientHeight + 1;
    if (prev) {
      prev.dataset.room = 'true';
      // the previous reply is the first thing to go when space runs out
      if (prev.getBoundingClientRect().bottom > floorY() || (mobile && overflows())) prev.dataset.room = 'false';
    }
    // mobile: a long reply at the floor size may still outgrow the space between the stage and the chips
    if (sec && mobile && overflows()) sec.dataset.tall = 'true';
  }); // every render: the room beneath changes as words arrive

  const hidden = overlay === 'card' || overlay === 'build' || overlay === 'contact' || overlay === 'game' || overlay === 'history';
  const waiting = !runner && lines[lines.length - 1]?.role === 'visitor';
  const echo = runner ? null : visitor;

  return (
    <>
      {/* outside .y-convo: its transform would make this fixed line relative to it */}
      {entryName && <p className="y-entry-name y-mono" aria-hidden="true">{entryName}</p>}
      <section ref={sectionRef} className="y-convo" data-hidden={hidden} data-phase={phase} data-runner={!!runner}>
        <div className="y-agent" data-waiting={waiting} aria-hidden="true">
          {view?.lead && (
            <p className="y-lead" key={`l-${view.lead}`}>
              {view.lead}
            </p>
          )}
          {view && (
            <p className="y-agent-line" key={view.key} ref={lineRef} data-quiet={view.quiet}>
              {words.map((w, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className="y-w" data-nowrap={w.nowrap || undefined} style={i < stagger ? { animationDelay: `${i * staggerMs}ms` } : undefined}>
                    {w.text}
                  </span>
                </span>
              ))}
            </p>
          )}
          {/* the hidden clone each turn is sized on before it is shown */}
          <p className="y-agent-line y-agent-measure" ref={cloneRef} />
        </div>
        {echo && (
          <p className="y-echo y-mono" key={`e-${echo.id}`} aria-hidden="true">
            {echo.text}
          </p>
        )}
        {prevAgent && !runner && !waiting && (
          <p className="y-prev" key={`p-${prevAgent.id}`} ref={prevRef} aria-hidden="true">
            {prevAgent.text}
          </p>
        )}
        {!runner && lines.length > 2 && (
          // on mobile the toggle lives in the top bar instead (POLISH2 A6)
          <button className="y-textbtn y-history-toggle" onClick={() => ctl.history()} tabIndex={hidden || isMobileWidth(vw) ? -1 : 0}>
            {copy.history.open}
          </button>
        )}
      </section>
    </>
  );
}

/** The runner's controls (tour, stories): Back · Next · Skip, and the step hint. */
export function RunnerControls() {
  const runner = useStore((s) => s.runner);
  if (!runner) return null;
  return (
    <div className="y-runner" role="group" aria-label={runner.kind === 'tour' ? 'Tour' : 'Stories'}>
      {runner.stepMode && <span className="y-runner-hint y-mono">{copy.runner.stepHint}</span>}
      <button className="y-textbtn" onClick={(e) => { e.stopPropagation(); ctl.runnerPrev(); }} disabled={runner.beat <= 0 && !runner.stepMode}>
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
