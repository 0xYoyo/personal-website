// Build (SPEC §2.6): construction ring → browser-frame outline → streamed
// HTML in a sandboxed srcdoc iframe → lock flash → controls.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { copy } from '../content/copy';
import { ctl } from '../controller';
import { useStore } from '../state/store';
import { useDialog } from './useDialog';

const SRCDOC_EVERY_MS = 650;
const streamedTitle = (html: string) => /<title>([^<]{1,60})<\/title>/i.exec(html)?.[1]?.trim() ?? '';

export function BuildFrame() {
  const build = useStore((s) => s.build);
  const lines = useStore((s) => s.lines);
  const ref = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState('');
  const [flash, setFlash] = useState(false);
  const [maxed, setMaxed] = useState(false);
  const [note, setNote] = useState<{ k: string; t: string } | null>(null);
  const lastPaint = useRef(0);
  useDialog(ref);

  const caption = [...lines].reverse().find((l) => l.role === 'agent')?.text ?? '';

  // Throttled srcdoc updates while streaming; final on lock.
  useEffect(() => {
    if (build.status === 'locked') {
      setSrcdoc(build.html);
      return;
    }
    if (build.status !== 'streaming') return;
    const now = performance.now();
    const due = SRCDOC_EVERY_MS - (now - lastPaint.current);
    if (due <= 0) {
      lastPaint.current = now;
      setSrcdoc(build.html);
      return;
    }
    const t = setTimeout(() => {
      lastPaint.current = performance.now();
      setSrcdoc(useStore.getState().build.html);
    }, due);
    return () => clearTimeout(t);
  }, [build.html, build.status]);

  // Lock flash
  useEffect(() => {
    if (build.status !== 'locked') return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 700);
    return () => clearTimeout(t);
  }, [build.status]);

  // The swarm: ring at the frame's center, then the frame's outline with density = progress.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || build.status === 'locked' || build.status === 'idle') return;
    const r = el.getBoundingClientRect();
    ctl.buildFrameProgress({ x: r.left, y: r.top, w: r.width, h: r.height }, build.status === 'ring' ? 0 : build.progress);
  }, [build.status, build.progress]);

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

  useEffect(() => {
    if (!maxed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setMaxed(false);
      }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [maxed]);

  const locked = build.status === 'locked';
  const visible = build.status !== 'ring' && build.status !== 'idle';

  return (
    <div className="y-build-wrap">
      <section ref={ref} className="y-build" role="dialog" aria-modal="true" aria-label={copy.build.frameTitle} aria-busy={!locked}>
        <p className="y-build-caption" aria-live="off">
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
                {copy.build.controls.close}
              </button>
            )}
          </div>
          <iframe
            ref={iframeRef}
            className="y-build-iframe"
            title={build.title || copy.build.frameTitle}
            sandbox="allow-scripts"
            srcDoc={srcdoc}
          />
        </div>
        <div className="y-build-controls" data-on={locked} aria-hidden={!locked}>
          <button className="y-textbtn" onClick={() => void fullscreen()} disabled={!locked}>
            {copy.build.controls.fullscreen}
          </button>
          <button className="y-textbtn" onClick={() => void copyHtml()} disabled={!locked}>
            {note?.k === 'copy' ? note.t : copy.build.controls.copy}
          </button>
          <button className="y-textbtn" onClick={download} disabled={!locked}>
            {copy.build.controls.download}
          </button>
          <button className="y-textbtn" onClick={() => void share()} disabled={!locked}>
            {note?.k === 'share' ? note.t : copy.build.controls.share}
          </button>
          <button className="y-textbtn" onClick={() => ctl.beginChange()} disabled={!locked}>
            {copy.build.controls.change}
          </button>
          <button className="y-textbtn" onClick={() => ctl.closeOverlay()}>
            {copy.build.controls.close}
          </button>
        </div>
      </section>
    </div>
  );
}
