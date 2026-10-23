import { useId, useState } from 'react';
import { useFactory } from '../store';
import { CI_CHECKS, type PRState, type SectionModule } from '../types';
import { cx } from '../../lib/cx';
import { DiffStream } from './DiffStream';
import { MergeButton } from './MergeButton';
import { useStateLine } from './useStateLine';
import './factory-ui.css';

interface Props {
  module: SectionModule;
  heading: string;
  headingMono?: boolean;
}

const STATE_CHIP: Record<PRState, string> = {
  queued: 'Queued',
  building: 'Building',
  ci: 'Checks',
  review: 'In review',
  'awaiting-merge': 'Approved',
  merged: 'Merged',
};

/** A pull request as the visitor sees it in a slot: title, diff or spec, checks, verdict, Merge. */
export function PRCard({ module: m, heading, headingMono }: Props) {
  const rt = useFactory((s) => s.sections[m.id]);
  const [tab, setTab] = useState<'diff' | 'spec'>('diff');
  const uid = useId();
  const lines = m.source.split('\n').length;
  const stateLine = useStateLine(m.id, lines);
  if (!rt) return null;

  const st = rt.state;
  const reviewed = st === 'awaiting-merge' || st === 'merged';
  const checksVisible = st === 'ci' || st === 'review' || reviewed;
  // The PR exists once the build finishes; until then the agent is still writing it.
  const opened = st !== 'queued' && st !== 'building';

  return (
    <article className={cx('pr', `pr--${st}`)} aria-label={`Pull request #${m.pr}: ${m.title}`}>
      <header className="pr-head">
        <div className="pr-meta mono">
          <span className={cx('chip', `chip--${st}`)}>
            <span className="chip-dot" aria-hidden="true" />
            {STATE_CHIP[st]}
          </span>
          <span className="pr-num">#{m.pr}</span>
          <span className="pr-commit">{m.title}</span>
        </div>
        <h3 className={cx('pr-title', headingMono && 'pr-title--mono')}>
          <span className="pr-title-text">{heading}</span>
        </h3>
        <p className="pr-sub mono">
          {st === 'queued' ? (
            <>
              queued · <span className="pr-ref">{m.branch}</span> · {m.spec.acceptance.length} acceptance criteria
            </>
          ) : opened ? (
            <>
              <span className="pr-agent">yoyo-build</span> wants to merge into <span className="pr-ref">main</span> from{' '}
              <span className="pr-ref">{m.branch}</span>
            </>
          ) : (
            <>
              <span className="pr-agent">yoyo-build</span> is building <span className="pr-ref">{m.branch}</span>
            </>
          )}
        </p>
      </header>

      <div className="pr-body">
      <div className="pr-fold">
      <div className="pr-tabs mono" role="tablist" aria-label="Pull request views">
        {(['diff', 'spec'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`${uid}-tab-${t}`}
            aria-controls={`${uid}-panel-${t}`}
            aria-selected={tab === t}
            className={cx('pr-tab', tab === t && 'is-active')}
            onClick={() => setTab(t)}
          >
            {t === 'diff' ? 'Diff' : 'Spec'}
            {t === 'spec' && <span className="pr-tab-count">{m.spec.acceptance.length}</span>}
          </button>
        ))}
      </div>

      <div className="pr-panel" role="tabpanel" id={`${uid}-panel-${tab}`} aria-labelledby={`${uid}-tab-${tab}`}>
        {tab === 'diff' ? (
          <DiffStream
            source={m.source}
            filePath={m.sourcePath ?? `src/sections/${m.id}/Component.tsx`}
            state={st}
            buildStartedAt={rt.stateSince}
            buildMs={rt.buildMs}
          />
        ) : (
          <SpecPanel module={m} />
        )}
      </div>
      </div>

      {/* Every line of the footer is reserved from the start, so the Merge button never moves. */}
      <footer className="pr-foot">
        <div className="pr-status mono">
          <p className="pr-stateline" aria-live="polite">
            {stateLine}
          </p>
          <ul className="checks" aria-label="Checks" aria-hidden={!checksVisible}>
            {CI_CHECKS.map((c, i) =>
              i < rt.ciPassed ? (
                <li key={c} className="check is-pass">
                  <span className="check-mark" aria-hidden="true">
                    ✓
                  </span>
                  {c}
                </li>
              ) : i === rt.ciPassed && st === 'ci' ? (
                <li key={c} className="check is-running">
                  <span className="check-mark" aria-hidden="true" />
                  {c}
                </li>
              ) : (
                <li key={c} className="check is-pending">
                  <span className="check-mark" aria-hidden="true" />
                  {c}
                </li>
              ),
            )}
          </ul>
          <div className={cx('verdict', !reviewed && 'is-pending')} aria-hidden={!reviewed}>
            <p>
              <span className="pr-agent">yoyo-review</span> approve · 0 must-fix · 0 should-fix · 1 note
            </p>
            <p className="verdict-note">note: {m.reviewNote}</p>
          </div>
        </div>
        <MergeButton id={m.id} pr={m.pr} allowHint inline />
      </footer>
      </div>
    </article>
  );
}

function SpecPanel({ module: m }: { module: SectionModule }) {
  return (
    <div className="spec mono">
      <p className="spec-head">
        Issue for #{m.pr}, labelled <span className="pr-ref">agent-ready</span>
      </p>
      <ol className="spec-list">
        {m.spec.acceptance.map((a, i) => (
          <li key={i}>
            <span className="spec-key">AC-{i + 1}</span>
            <span>{a}</span>
          </li>
        ))}
      </ol>
      <ol className="spec-list spec-list--ng">
        {m.spec.nonGoals.map((a, i) => (
          <li key={i}>
            <span className="spec-key">NG-{i + 1}</span>
            <span>{a}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
