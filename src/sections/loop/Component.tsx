import { useReducedMotion } from 'motion/react';
import { agentCoAuthoredCommits, burst, commitCount, fmt, mergeCommitCount, mergedPRs } from '../../data/stats';
import { useFactory } from '../../factory/store';
import { cx } from '../../lib/cx';
import { BurstReplay } from './BurstReplay';
import { LoopDiagram } from './LoopDiagram';
import { columnsFor, HORIZONTAL_MIN } from './layout';
import { median, openToMerge } from './burst';
import { useWidth } from './useWidth';
import './loop.css';

// What each part of the pipeline does, in order; the legend under the diagram.
const LEGEND = [
  { name: '/yoyo-spec', does: 'Interviews me and files a Linear issue with AC-N acceptance criteria and NG-N non-goals.' },
  { name: 'agent-ready', does: 'The one label that lets an agent pick the issue up.' },
  { name: '/yoyo-build', does: 'Claims it, implements in an isolated git worktree, opens a pull request.' },
  { name: '/yoyo-review', does: 'A second agent posts a three-group verdict tied to the exact commit and CI.' },
  { name: 'you merge', does: 'A human reads the verdict and presses the button.' },
];

const share = Math.round((agentCoAuthoredCommits / commitCount) * 100);
const medianMinutes = Math.round(median(mergedPRs.filter((p) => p.repo === 'unfiltered').map(openToMerge)));

export default function LoopSection() {
  const skipped = useFactory((s) => s.skipped);
  const reduced = useReducedMotion() ?? false;
  const animate = !skipped && !reduced;
  const [figRef, width] = useWidth<HTMLDivElement>(1240);
  const horizontal = width >= HORIZONTAL_MIN;
  const c = columnsFor(width);
  const legendColumns = horizontal
    ? `${c.issue}px ${c.build - 5 - c.issue}px ${c.review - c.build}px ${c.merge - 2 - c.review}px minmax(0, 1fr)`
    : undefined;

  return (
    <div className="loop grid-12">
      <p className="lede loop-lede">
        I spec the behavior until it's unambiguous. Agents build it in isolated worktrees and open a pull request. A second
        agent reviews against the spec and CI. I merge. Nothing merges without a human.
      </p>

      <div ref={figRef} className={cx('loop-figure', horizontal ? 'is-h' : 'is-v', width >= 640 && 'is-roomy')}>
        <div className="loop-dia-wrap">
          <LoopDiagram width={width} draw={animate} />
        </div>
        <ol className="loop-legend" style={{ gridTemplateColumns: legendColumns }}>
          {LEGEND.map((s) => (
            <li key={s.name} className={cx('loop-legend-item', s.name === 'you merge' && 'is-human')}>
              <span className="loop-legend-name mono">{s.name}</span>
              <span className="loop-legend-does">{s.does}</span>
            </li>
          ))}
        </ol>
      </div>

      {burst && (
        <div className="loop-burst-wrap">
          <BurstReplay burst={burst} width={width} autoplay={animate} still={reduced} />
        </div>
      )}

      <div className="loop-proof">
        <p className="loop-proof-line">
          <span className="loop-proof-num">{share}%</span> of my public commits are co-authored with an agent. All of
          them were merged by me.
        </p>
        <p className="loop-proof-data mono muted">
          <span>
            {fmt(agentCoAuthoredCommits)} of {fmt(commitCount)} commits carry a Co-Authored-By trailer ·
          </span>{' '}
          <span>{fmt(mergeCommitCount)} merge commits ·</span>{' '}
          <span>median open→merge on Unfiltered ≈ {medianMinutes} min</span>
        </p>
      </div>

      <figure className="loop-quote">
        <blockquote className="mono">One approval label, one rule: humans merge.</blockquote>
        <figcaption className="mono muted">yoyo-loop README</figcaption>
      </figure>
    </div>
  );
}
