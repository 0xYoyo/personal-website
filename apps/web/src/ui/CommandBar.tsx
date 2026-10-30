// The one input (SPEC §2.1, §3.3): mono field with a static placeholder,
// hold-to-talk mic (and `space` hold when not typing), send, `/` to focus,
// Esc clears, ↑ recalls, a cobalt hairline while the agent streams, Stop
// during builds.
import { useEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { createMic, recognitionCtor, type Mic } from './voice';

const TAP_MS = 260;

export function CommandBar() {
  const phase = useStore((s) => s.phase);
  const streaming = useStore((s) => s.streaming);
  // the loading line shows only while the reply hasn't started (a visitor line is last), never while words are on screen
  const waiting = useStore((s) => s.streaming && s.lines[s.lines.length - 1]?.role === 'visitor');
  const barMode = useStore((s) => s.barMode);
  const build = useStore((s) => s.build);
  const lines = useStore((s) => s.lines);
  const settling = useStore((s) => s.settling);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const recall = useRef(-1);
  const input = useRef<HTMLInputElement>(null);
  const mic = useRef<Mic | null>(null);
  const pressAt = useRef(0);
  const toggled = useRef(false);

  const micSupported = useMemo(() => !!recognitionCtor(), []);
  const history = useMemo(() => lines.filter((l) => l.role === 'visitor').map((l) => l.text), [lines]);
  const building = build.status === 'ring' || build.status === 'streaming';

  // Mic
  useEffect(() => {
    mic.current = createMic({
      onText: (t) => setValue(t),
      onFinal: (t) => {
        setValue('');
        void submit(t);
      },
      onLevel: (l) => ctl.swarm?.setListeningLevel(l),
      onState: (on) => {
        setListening(on);
        ctl.swarm?.mood(on ? 'listening' : 'idle');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `space` held when not typing → talk
  useEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a instanceof HTMLElement && a.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || typing() || !mic.current?.supported) return;
      if (useStore.getState().overlay !== 'none' && useStore.getState().overlay !== 'tour') return;
      if (document.activeElement instanceof HTMLButtonElement) return;
      e.preventDefault();
      mic.current.start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !mic.current?.listening) return;
      e.preventDefault();
      mic.current.stop(true);
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, []);

  async function submit(raw?: string) {
    const text = (raw ?? value).trim();
    // Enter on an empty bar: the turn on screen has been read (POLISH2 A1)
    if (!text) return ctl.advance();
    setValue('');
    recall.current = -1;
    if (useStore.getState().barMode === 'change') await ctl.changeBuild(text);
    else await ctl.say(text);
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    useStore.getState().touch();
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      if (value) {
        e.preventDefault();
        e.stopPropagation();
        setValue('');
        recall.current = -1;
      } else if (barMode === 'change') {
        e.stopPropagation();
        useStore.getState().setBarMode('chat');
      }
    } else if (e.key === 'ArrowUp' && history.length && (!value || recall.current >= 0)) {
      e.preventDefault();
      const next = recall.current < 0 ? history.length - 1 : Math.max(0, recall.current - 1);
      recall.current = next;
      setValue(history[next] ?? '');
    } else if (e.key === 'ArrowDown' && recall.current >= 0) {
      e.preventDefault();
      const next = recall.current + 1;
      if (next >= history.length) {
        recall.current = -1;
        setValue('');
      } else {
        recall.current = next;
        setValue(history[next] ?? '');
      }
    }
  };

  const micDown = (e: React.PointerEvent) => {
    e.preventDefault();
    pressAt.current = performance.now();
    if (mic.current?.listening && toggled.current) {
      toggled.current = false;
      mic.current.stop(true);
      return;
    }
    mic.current?.start();
  };
  const micUp = () => {
    if (!mic.current?.listening) return;
    const held = performance.now() - pressAt.current;
    if (held < TAP_MS) toggled.current = true; // tap → stays on until the next tap
    else mic.current.stop(true);
  };

  // one static line (WAVE3 S1): the first placeholder; nothing cycles under the visitor's eye
  const placeholder = barMode === 'change' ? copy.bar.changePlaceholder : copy.bar.placeholders[0]!;
  const showPh = !value;

  return (
    <div className="y-bar-wrap" data-ready={phase === 'ready'} data-settling={settling === 'all'}>
      <form
        className="y-bar"
        data-mode={barMode}
        data-focused={focused}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="y-bar-progress" data-on={waiting || building} data-determinate={building && build.status === 'streaming'} aria-hidden="true">
          <span style={building && build.status === 'streaming' ? { transform: `scaleX(${build.progress})` } : undefined} />
        </span>
        <label htmlFor="y-input" className="y-sr">
          {copy.bar.inputLabel}
        </label>
        <div className="y-bar-field">
          <input
            id="y-input"
            ref={input}
            className="y-bar-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            maxLength={600}
            aria-describedby="y-ph"
          />
          {showPh && (
            <span className="y-bar-ph" id="y-ph" aria-hidden="true" key={placeholder}>
              {placeholder}
              <span className="y-caret" />
            </span>
          )}
        </div>
        {micSupported && !building && (
          <button
            type="button"
            className="y-bar-mic"
            data-on={listening}
            aria-label={listening ? copy.bar.micListening : copy.bar.mic}
            aria-pressed={listening}
            onPointerDown={micDown}
            onPointerUp={micUp}
            onPointerLeave={micUp}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (mic.current?.listening) mic.current.stop(true);
                else mic.current?.start();
              }
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {building ? (
          <button type="button" className="y-bar-send" data-live="true" onClick={() => ctl.stopBuild()}>
            {copy.bar.stop}
          </button>
        ) : (
          <button type="submit" className="y-bar-send" data-live={!!value.trim()} disabled={!value.trim()}>
            {copy.bar.send}
          </button>
        )}
      </form>
    </div>
  );
}
