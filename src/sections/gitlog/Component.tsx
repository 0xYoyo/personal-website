import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { useFactory } from '../../factory/store';
import { cx } from '../../lib/cx';
import { gitCommits, gitFootnote, gitGap, shaOf, type BranchName } from '../../content/gitlog';
import { branchColor, refsFor, rowLabel } from './refs';
import { layoutGraph } from './layout';
import { MOUNT_ANIM_DELAY } from '../../factory/ui/choreography';
import './gitlog.css';

const DRAW_MS = 1400;
/** The draw starts while the merge wipe is still revealing the section (choreography.ts). */
const START_MS = MOUNT_ANIM_DELAY;
/** Proportional gaps stop here; only the 2024 quiet is drawn longer. */
const MAX_GAP = 56;
/** Row padding + half the 22px line: puts a node on the first text line */
const ROW_OFFSET = 5 + 11;

type Mode = 'wide' | 'medium' | 'compact';
const MODES: Record<Mode, { laneGap: number; gutter: number; pxPerDay: number }> = {
  wide: { laneGap: 22, gutter: 176, pxPerDay: 0.34 },
  medium: { laneGap: 20, gutter: 0, pxPerDay: 0.3 },
  compact: { laneGap: 14, gutter: 0, pxPerDay: 0.27 },
};

export default function GitLogSection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [mode, setMode] = useState<Mode>('wide');
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [heights, setHeights] = useState<number[]>(() => gitCommits.map(() => 32));
  const [active, setActive] = useState<string | null>(null);

  const reduced = useReducedMotion();
  const skipped = useFactory((s) => s.skipped);
  const mergedBy = useFactory((s) => s.sections.gitlog?.mergedBy);
  const [drawing] = useState(() => !reduced && !skipped && mergedBy !== 'init');

  const m = MODES[mode];
  const graph = useMemo(
    () => layoutGraph(gitCommits, { ...m, rowHeights: heights, curve: 18, top: ROW_OFFSET, maxGap: MAX_GAP, uncapped: gitGap }),
    [m, heights],
  );
  const textLeft = m.gutter + graph.width + (mode === 'compact' ? 8 : 18);

  // Pick the layout for the available width, then measure every row so the
  // graph spaces itself to the text, never the other way round.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = (w: number) => {
      setWidth(w);
      setMode(w >= 900 ? 'wide' : w >= 560 ? 'medium' : 'compact');
    };
    // Measure once now: a state update in a layout effect lands before the first paint, so the
    // section never paints (or reports a page height) in the wrong mode. The observer follows resizes.
    fit(Math.round(el.clientWidth));
    const ro = new ResizeObserver(([e]) => fit(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => live && setFontsReady(true));
    return () => {
      live = false;
      ro.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const next = rowRefs.current.map((r) => (r ? r.offsetHeight + 6 : 32));
    if (next.some((h, i) => h !== heights[i])) setHeights(next);
  }, [mode, width, fontsReady, heights]);

  const delay = (y: number) => `${START_MS + Math.round(((y - ROW_OFFSET) / graph.height) * DRAW_MS)}ms`;
  const span = (y0: number, y1: number) => `${Math.max(1, Math.round(((y1 - y0) / graph.height) * DRAW_MS))}ms`;

  const gapFrom = graph.rows.find((r) => r.id === gitGap.from);
  const gapTo = graph.rows.find((r) => r.id === gitGap.to);
  const gapY = gapFrom && gapTo && gapFrom.y - gapTo.y > 90 ? (gapFrom.y + gapTo.y) / 2 : null;

  function onKey(e: KeyboardEvent<HTMLLIElement>, i: number) {
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: graph.rows.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    rowRefs.current[Math.max(0, Math.min(graph.rows.length - 1, to))]?.focus();
  }

  return (
    <div ref={rootRef} className={cx('gitlog', `gitlog--${mode}`, drawing && 'is-drawing')}>
      <p className="lede">The short version of my life, the way I would read a repo.</p>

      <div className="gitlog-canvas" style={{ height: graph.height + 8 }}>
        <svg
          className="gitlog-svg"
          width={graph.width}
          height={graph.height + 8}
          style={{ left: m.gutter }}
          aria-hidden="true"
        >
          {graph.edges.map((e) => (
            <path
              key={e.key}
              className="gitlog-edge"
              d={e.d}
              pathLength={1}
              stroke={branchColor(e.branch)}
              style={{ '--d': delay(e.y0), '--t': span(e.y0, e.y1) } as CSSProperties}
            />
          ))}
          {graph.rows.map((c) => (
            <g
              key={c.id}
              className={cx('gitlog-node', c.parents.length > 1 && 'is-merge', c.id === 'head' && 'is-head', active === c.id && 'is-active')}
              style={{ '--d': delay(c.y), color: branchColor(c.branch) } as CSSProperties}
              onMouseEnter={() => setActive(c.id)}
              onMouseLeave={() => setActive(null)}
            >
              <circle className="gitlog-ring" cx={c.x} cy={c.y} r={c.id === 'head' ? 10 : 8} />
              <circle className="gitlog-dot" cx={c.x} cy={c.y} r={c.id === 'head' ? 5.5 : 3.75} />
            </g>
          ))}
        </svg>

        {m.gutter > 0 &&
          graph.rows
            .filter((c) => c.forks)
            .map((c) => (
              <span
                key={c.id}
                className="gitlog-label"
                aria-hidden="true"
                style={{ top: c.y - ROW_OFFSET, width: m.gutter - 14, '--d': delay(c.y), '--b': branchColor(c.branch) } as CSSProperties}
              >
                {c.branch}
              </span>
            ))}

        {gapY !== null && (
          <p className="gitlog-gap" style={{ top: gapY - 11, left: textLeft }}>
            {gitGap.note}
          </p>
        )}

        <ol
          className="gitlog-rows"
          aria-label="Life as a git log, newest first"
          style={{ left: textLeft, right: mode === 'wide' ? 'var(--gitlog-panel)' : 0 }}
        >
          {graph.rows.map((c, i) => {
            const { sha, real } = shaOf(c);
            const refs = refsFor(c);
            const forkInline = m.gutter === 0 && c.forks && c.branch !== 'main' && !refs.includes(c.branch);
            return (
              <li
                key={c.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                className={cx('gitlog-row', active === c.id && 'is-active')}
                style={{ top: c.y - ROW_OFFSET, '--d': delay(c.y) } as CSSProperties}
                tabIndex={0}
                aria-label={rowLabel(c, sha, real)}
                onMouseEnter={() => setActive(c.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(c.id)}
                onBlur={() => setActive(null)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <span className={cx('gitlog-sha', real && 'is-real')}>{sha}</span>
                <span className="gitlog-date">{c.date}</span>
                <span className="gitlog-msg">
                  {refs.length > 0 && <Refs refs={refs} branch={c.branch} tag={c.tag} />}
                  {c.message}
                </span>
                {forkInline && <span className="gitlog-fork">checkout -b {c.branch}</span>}
              </li>
            );
          })}
        </ol>

        {mode === 'wide' && <Show id={active ?? 'head'} />}
      </div>

      <p className="gitlog-note muted">{gitFootnote}</p>
    </div>
  );
}

/** `git show` for the commit under the pointer or focus; HEAD by default. */
function Show({ id }: { id: string }) {
  const c = gitCommits.find((x) => x.id === id)!;
  const { sha, commit } = shaOf(c);
  return (
    <aside className="gitlog-show" aria-label="Commit details">
      <div className="gitlog-show-inner">
        <p className="gitlog-show-head">
          commit {sha}
          {c.tag && <span className="gitlog-tag"> tag: {c.tag}</span>}
        </p>
        <dl className="gitlog-show-meta">
          <dt>Branch:</dt>
          <dd>{c.branch}</dd>
          <dt>Date:</dt>
          <dd>{commit ? commit.d.slice(0, 10) : c.date}</dd>
          {commit && (
            <>
              <dt>Repo:</dt>
              <dd>0xYoyo/{commit.r}</dd>
            </>
          )}
        </dl>
        <p className="gitlog-show-msg">{c.message}</p>
        {commit ? (
          <>
            <p className="gitlog-show-real">First commit in the repo: {commit.m}</p>
            <a href={`https://github.com/0xYoyo/${commit.r}/commit/${commit.s}`} target="_blank" rel="noreferrer">
              View on GitHub
            </a>
          </>
        ) : (
          <p className="gitlog-show-real">No public repo behind this one, so the hash is derived from the message.</p>
        )}
      </div>
    </aside>
  );
}

function Refs({ refs, branch, tag }: { refs: string[]; branch: BranchName; tag?: string }) {
  return (
    <span className={cx('gitlog-refs', branch === 'agents' && 'is-agent')}>
      ({refs.map((r, i) => (
        <span key={r}>
          {i > 0 && ', '}
          {r === 'main' ? <><b>HEAD -&gt;</b> main</> : r}
        </span>
      ))}
      {tag && <span className="gitlog-tag">, tag: {tag}</span>})
    </span>
  );
}
