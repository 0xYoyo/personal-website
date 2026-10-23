import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { columnsFor, HORIZONTAL_MIN } from './layout';

interface Props {
  width: number;
  /** Draw the pipeline in once, left to right (or top to bottom). */
  draw: boolean;
}

const CARD = { w: 148, h: 96 };
const VERDICT = '0 must-fix · 0 should-fix · 1 note';

/** Each element appears when the drawing reaches it; `t` is 0..1 along the pipeline. */
const at = (t: number): CSSProperties => ({ ['--t' as string]: t.toFixed(3) });

function Line({ d, t, className }: { d: string; t: number; className?: string }) {
  return <path className={cx('loop-draw', className)} d={d} pathLength={1} style={at(t)} />;
}

function Show({ t, children }: { t: number; children: ReactNode }) {
  return (
    <g className="loop-show" style={at(t)}>
      {children}
    </g>
  );
}

function IssueCard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="loop-card" width={CARD.w} height={CARD.h} rx={6} />
      <text className="loop-t loop-t-fg loop-t-strong" x={12} y={22}>YOY-152</text>
      <text className="loop-t" x={12} y={42}>AC-1 … AC-4</text>
      <text className="loop-t" x={12} y={60}>NG-1</text>
      <rect className="loop-chip loop-chip-agent" x={8} y={68} width={98} height={19} rx={9.5} />
      <text className="loop-t loop-t-agent" x={18} y={81.5}>agent-ready</text>
    </g>
  );
}

function Verdict({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <text className="loop-t loop-t-fg" y={0}>{VERDICT}</text>
      <rect className="loop-chip" y={12} width={118} height={20} rx={10} />
      <circle className="loop-pass" cx={12} cy={22} r={3} />
      <text className="loop-t" x={21} y={26}>loop-approved</text>
      <rect className="loop-chip" y={38} width={148} height={20} rx={10} />
      <text className="loop-t" x={10} y={52}>needs-human-review</text>
    </g>
  );
}

function Node({ x, y, human }: { x: number; y: number; human?: boolean }) {
  return human ? (
    <circle className="loop-node-human" cx={x} cy={y} r={7} />
  ) : (
    <circle className="loop-node" cx={x} cy={y} r={4.5} />
  );
}

// The pipeline: spec, issue, worktree build, PR, review, and the one human step,
// with the feature branch forking off main and merging back into it.
function Horizontal({ width }: { width: number }) {
  const { spec, issue, build, pr, review, merge } = columnsFor(width);
  const row = 84;
  const main = 214;
  const t = (x: number) => x / width;
  const fork = build - 56;
  const back = merge + 56;
  return (
    <>
      <Line className="loop-main" d={`M0 ${main} H${width}`} t={0} />
      <Line d={`M${spec} ${row} H${issue}`} t={t(spec)} />
      <Line d={`M${issue + CARD.w} ${row} H${build}`} t={t(issue + CARD.w)} />
      <Line d={`M${fork} ${main} C${build} ${main} ${build} ${main} ${build} ${row + 5}`} t={t(fork)} />
      <Line d={`M${build} ${row} H${merge}`} t={t(build)} />
      <Line d={`M${merge} ${row + 7} C${merge} ${main} ${merge} ${main} ${back} ${main}`} t={t(merge)} />

      <Show t={0}>
        <text className="loop-t" x={0} y={main - 10}>main</text>
      </Show>
      <Show t={t(spec)}>
        <Node x={spec} y={row} />
        <text className="loop-t loop-t-name" x={spec - 5} y={row - 18}>/yoyo-spec</text>
        <text className="loop-t" x={spec - 5} y={row + 28}>interviews me</text>
      </Show>
      <Show t={t(issue)}>
        <text className="loop-t" x={issue} y={row - CARD.h / 2 - 10}>Linear issue</text>
        <IssueCard x={issue} y={row - CARD.h / 2} />
      </Show>
      <Show t={t(fork)}>
        <circle className="loop-commit" cx={fork} cy={main} r={3.5} />
        <Node x={build} y={row} />
        <text className="loop-t loop-t-name" x={build - 5} y={row - 18}>/yoyo-build</text>
        <text className="loop-t" x={build + 12} y={row + 28}>git worktree</text>
        <text className="loop-t loop-t-agent" x={build + 12} y={row + 46}>feat/yoy-152</text>
      </Show>
      <Show t={t(pr)}>
        <Node x={pr} y={row} />
        <text className="loop-t loop-t-name" x={pr - 5} y={row - 18}>pull request</text>
        <text className="loop-t" x={pr - 5} y={row + 28}>CI runs</text>
      </Show>
      <Show t={t(review)}>
        <Node x={review} y={row} />
        <text className="loop-t loop-t-name" x={review - 5} y={row - 18}>/yoyo-review</text>
        <Verdict x={review - 5} y={row + 28} />
      </Show>
      <Show t={t(merge)}>
        <Node x={merge} y={row} human />
        <text className="loop-t loop-t-fg loop-t-strong" x={merge - 7} y={row - 18}>you merge</text>
        <text className="loop-t" x={merge + 14} y={row + 28}>the only human step</text>
      </Show>
      <Show t={t(back)}>
        <circle className="loop-commit is-merge" cx={back} cy={main} r={4} />
        <text className="loop-t" x={back + 12} y={main - 10}>back to main</text>
      </Show>
    </>
  );
}

function Vertical({ height }: { height: number }) {
  const main = 6;
  const col = 44;
  const tx = 62;
  const y = { spec: 52, issue: 112, build: 268, pr: 324, review: 380, merge: 492 };
  const t = (v: number) => v / height;
  return (
    <>
      <Line className="loop-main" d={`M${main} 26 V${height}`} t={0} />
      <Line d={`M${col} ${y.spec} V${y.merge - 7}`} t={t(y.spec)} />
      <Line d={`M${col} ${y.issue + 10 + CARD.h / 2} H${tx}`} t={t(y.issue)} />
      <Line d={`M${main} ${y.build - 56} C${main} ${y.build} ${main} ${y.build} ${col - 5} ${y.build}`} t={t(y.build - 56)} />
      <Line d={`M${col - 7} ${y.merge} C${main} ${y.merge} ${main} ${y.merge} ${main} ${y.merge + 56}`} t={t(y.merge)} />

      <Show t={0}>
        <text className="loop-t" x={0} y={14}>main</text>
      </Show>
      <Show t={t(y.spec)}>
        <Node x={col} y={y.spec} />
        <text className="loop-t loop-t-name" x={tx} y={y.spec + 4}>/yoyo-spec</text>
        <text className="loop-t" x={tx} y={y.spec + 22}>interviews me</text>
      </Show>
      <Show t={t(y.issue)}>
        <text className="loop-t" x={tx} y={y.issue}>Linear issue</text>
        <IssueCard x={tx} y={y.issue + 10} />
      </Show>
      <Show t={t(y.build - 56)}>
        <circle className="loop-commit" cx={main} cy={y.build - 56} r={3.5} />
        <Node x={col} y={y.build} />
        <text className="loop-t loop-t-name" x={tx} y={y.build + 4}>/yoyo-build</text>
        <text className="loop-t" x={tx} y={y.build + 22}>git worktree, <tspan className="loop-t-agent">feat/yoy-152</tspan></text>
      </Show>
      <Show t={t(y.pr)}>
        <Node x={col} y={y.pr} />
        <text className="loop-t loop-t-name" x={tx} y={y.pr + 4}>pull request</text>
        <text className="loop-t" x={tx} y={y.pr + 22}>CI runs</text>
      </Show>
      <Show t={t(y.review)}>
        <Node x={col} y={y.review} />
        <text className="loop-t loop-t-name" x={tx} y={y.review + 4}>/yoyo-review</text>
        <Verdict x={tx} y={y.review + 22} />
      </Show>
      <Show t={t(y.merge)}>
        <Node x={col} y={y.merge} human />
        <text className="loop-t loop-t-fg loop-t-strong" x={tx} y={y.merge + 4}>you merge</text>
        <text className="loop-t" x={tx} y={y.merge + 22}>the only human step</text>
      </Show>
      <Show t={t(y.merge + 56)}>
        <circle className="loop-commit is-merge" cx={main} cy={y.merge + 56} r={4} />
        <text className="loop-t" x={main + 14} y={y.merge + 60}>back to main</text>
      </Show>
    </>
  );
}

export function LoopDiagram({ width, draw }: Props) {
  const horizontal = width >= HORIZONTAL_MIN;
  const w = horizontal ? width : 340;
  const h = horizontal ? 236 : 584;
  return (
    <svg
      className={cx('loop-dia', draw && 'is-drawing', horizontal ? 'is-h' : 'is-v')}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-labelledby="loop-dia-title"
    >
      <title id="loop-dia-title">
        The loop: /yoyo-spec files a Linear issue labelled agent-ready, /yoyo-build implements it in a git worktree off
        main and opens a pull request, /yoyo-review posts a verdict, and a human merges it back into main.
      </title>
      {horizontal ? <Horizontal width={w} /> : <Vertical height={h} />}
    </svg>
  );
}
