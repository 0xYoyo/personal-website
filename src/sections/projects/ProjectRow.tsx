import type { ReactNode } from 'react';
import type { Project } from '../../content/projects';
import { fmt } from '../../data/stats';
import { cx } from '../../lib/cx';

/** Below this a commit count reads as a weakness rather than a fact, so only the period shows. */
const MIN_COMMITS_SHOWN = 10;

interface Props {
  project: Project;
  /** The three lead projects get more room and one distinguishing element */
  featured?: boolean;
  /** Featured only: put the aside on the left, so the rows alternate */
  flip?: boolean;
  children?: ReactNode;
}

/** One project, as a full-width editorial row. Status is a plain word. */
export function ProjectRow({ project: p, featured = false, flip = false, children }: Props) {
  const status = p.statusNote ? `${p.status} — ${p.statusNote}` : p.status;
  return (
    <li className={cx('projects-row', featured ? 'is-featured' : 'is-dense', flip && 'is-flip')}>
      <h3 className="projects-name" id={`project-${p.id}`}>
        {p.name} <span className={cx('projects-status', p.statusNote && 'has-note')}>({status})</span>
      </h3>

      <p className="projects-when mono">
        <span>{p.period}</span>
        {p.commits !== undefined && p.commits >= MIN_COMMITS_SHOWN && p.commitSpan && (
          <span className="projects-commits" title={`First commit ${p.commitSpan[0]}, last ${p.commitSpan[1]}`}>
            {fmt(p.commits)} {p.commits === 1 ? 'commit' : 'commits'}
          </span>
        )}
      </p>

      <div className="projects-body">
        <p className="projects-line">{p.oneLiner}</p>
        <ul className="projects-facts">
          {p.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <p className="projects-stack mono">{p.stack.join(', ')}</p>
        <ProjectLinks project={p} />
      </div>

      {children && <div className="projects-aside">{children}</div>}
    </li>
  );
}

function ProjectLinks({ project: p }: { project: Project }) {
  const links = [
    p.links.repo && { label: 'GitHub', href: p.links.repo },
    p.links.npm && { label: 'npm', href: p.links.npm },
    p.links.live && { label: 'Live', href: p.links.live },
    ...(p.links.more ?? []),
  ].filter((l): l is { label: string; href: string } => Boolean(l));
  if (!links.length) return null;
  return (
    <p className="projects-links">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" aria-describedby={`project-${p.id}`}>
          {l.label}
        </a>
      ))}
    </p>
  );
}
