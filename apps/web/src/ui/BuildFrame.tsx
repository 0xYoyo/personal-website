// Build (SPEC §2.6, POLISH1 A3): construction ring → browser-frame outline →
// the code pours into the frame as it streams (mono, auto-scrolling, tags
// dimmed) while the swarm's border densifies → at done the rendered app
// crossfades in (250 ms) with the lock flash → controls.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { useDialog } from './useDialog';

const streamedTitle = (html: string) => /<title>([^<]{1,60})<\/title>/i.exec(html)?.[1]?.trim() ?? '';
/** Only the tail is drawn while streaming (the view sits scrolled to the bottom anyway). */
const CODE_TAIL = 7000;

/** Split HTML into tag / text runs so tags can be drawn dimmer than the content. */
export function codeRuns(html: string): { tag: boolean; text: string }[] {
  const out: { tag: boolean; text: string }[] = [];
  const re = /<\/?[a-zA-Z!][^>]*>?/g;
  let i = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > i) out.push({ tag: false, text: html.slice(i, m.index) });
    out.push({ tag: true, text: m[0] });
    i = m.index + m[0].length;
  }
  if (i < html.length) out.push({ tag: false, text: html.slice(i) });
  return out;
}

export function BuildFrame() {
  const build = useStore((s) => s.build);
  const lines = useStore((s) => s.lines);
  const ref = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const [flash, setFlash] = useState(false);
  const [maxed, setMaxed] = useState(false);
  const [note, setNote] = useState<{ k: string; t: string } | null>(null);
  useDialog(ref);

  const locked = build.status === 'locked';
  const streaming = build.status === 'streaming';
  const lastAgent = [...lines].reverse().find((l) => l.role === 'agent');
  const caption = streaming ? copy.build.writing : lastAgent?.text ?? '';
  // one element per line said (it streams in word by word), not per word
  const captionKey = streaming ? 'writing' : `a:${lastAgent?.id ?? 0}`;

  // the code view: the tail of what has streamed, tags dimmed
  const runs = useMemo(() => codeRuns(build.html.length > CODE_TAIL ? build.html.slice(-CODE_TAIL) : build.html), [build.html]);
  // at done the code fades out over the rendered app (250 ms), then leaves
  const [codeGone, setCodeGone] = useState(locked);
  useEffect(() => {
    if (!locked) {
      setCodeGone(false);
      return;
    }
    const t = setTimeout(() => setCodeGone(true), 260);
    return () => clearTimeout(t);
  }, [locked]);
  useLayoutEffect(() => {
    const el = codeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runs]);

  // Lock flash
  useEffect(() => {
    if (!locked) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, [locked]);

  // The swarm: ring at the frame's center, then the frame's outline with density = progress;
  // once locked, a dim thin border around it (POLISH2 A4).
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || build.status === 'idle') return;
    const r = el.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    if (locked) ctl.holdLockedFrame(rect);
    else ctl.buildFrameProgress(rect, build.status === 'ring' ? 0 : build.progress);
  }, [build.status, build.progress, locked]);

  const say = (k: string, t: string) => {
    setNote({ k, t });
    setTimeout(() => setNote((n) => (n?.k === k ? null : n)), 1800);
  };

  const fullscreen = async () => {
    const el = frameRef.current;
    try {
      if (el?.requestFullscreen) {
        await el.requestFullscreen();
        return;
      }
    } catch {
      /* fall through to the in-page maximize */
    }
    setMaxed(true);
  };
  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(build.html);
      say('copy', copy.build.controls.copied);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const blob = new Blob([build.html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(build.title || 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    const url = await ctl.shareBuild();
    if (url) say('share', copy.build.controls.shared);
  };

  // in-page maximize: one Esc leaves it and does nothing else
  useEffect(() => {
    if (!maxed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        setMaxed(false);
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [maxed]);

  const visible = build.status !== 'ring' && build.status !== 'idle';
  const c = copy.build.controls;

  return (
    <div className="y-build-wrap">
      <section ref={ref} className="y-build" role="dialog" aria-modal="true" aria-label={copy.build.frameTitle} aria-busy={!locked}>
        {/* desktop: a full agent line above the frame; mobile: one line the flock keeps off */}
        <p className="y-build-caption" aria-live="off" key={captionKey} data-done={locked}>
          {caption}
        </p>
        <div ref={frameRef} className="y-build-frame" data-visible={visible} data-locked={locked} data-flash={flash} data-maxed={maxed}>
          <div className="y-build-chrome y-mono">
            <span className="y-build-title">{build.title || streamedTitle(build.html) || (build.instruction === 'example' ? '' : build.instruction)}</span>
            <span className="y-build-bytes" aria-hidden="true">
              {build.bytes ? `${(build.bytes / 1024).toFixed(1)} kB` : ''}
            </span>
            {maxed && (
              <button className="y-textbtn" onClick={() => setMaxed(false)}>
                {c.close}
              </button>
            )}
          </div>
          <div className="y-build-body">
            <iframe className="y-build-iframe" title={build.title || copy.build.frameTitle} sandbox="allow-scripts" srcDoc={locked ? build.html : ''} data-on={locked} />
            {!codeGone && (
              <pre ref={codeRef} className="y-build-code y-mono" aria-hidden="true" data-off={locked}>
                {runs.map((r, i) => (
                  <Fragment key={i}>{r.tag ? <span className="y-code-tag">{r.text}</span> : r.text}</Fragment>
                ))}
                <span className="y-caret" />
              </pre>
            )}
          </div>
        </div>
        <div className="y-build-controls" data-on={locked} aria-hidden={!locked}>
          <button className="y-textbtn" onClick={() => ctl.beginChange()} disabled={!locked}>
            {c.change}
          </button>
          <button className="y-textbtn" onClick={() => void copyHtml()} disabled={!locked}>
            {note?.k === 'copy' ? note.t : c.copy}
          </button>
          <button className="y-textbtn" onClick={download} disabled={!locked}>
            {c.download}
          </button>
          <button className="y-textbtn" onClick={() => void share()} disabled={!locked}>
            {note?.k === 'share' ? note.t : c.share}
          </button>
          <button className="y-textbtn" onClick={() => void fullscreen()} disabled={!locked}>
            {c.fullscreen}
          </button>
          <button className="y-textbtn" onClick={() => ctl.closeOverlay()}>
            {c.close}
          </button>
        </div>
      </section>
    </div>
  );
}
