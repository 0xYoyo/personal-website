import { odinEra, projects } from '../../content/projects';
import { fmt } from '../../data/stats';
import { ProjectRow } from './ProjectRow';
import { LoopSkills, PlayGame, SearchExample } from './Asides';
import './projects.css';

/** The three lead rows each get one distinguishing element. */
function asideFor(id: string, nameHe?: string) {
  if (id === 'yoyo-loop') return <LoopSkills />;
  if (id === 'unfiltered') return <SearchExample />;
  if (id === 'prompt-racers' && nameHe) return <PlayGame nameHe={nameHe} />;
  return null;
}

const FEATURED = 3;

export default function ProjectsSection() {
  return (
    <div className="projects">
      <p className="lede projects-lede">What each one does, and where it stands today.</p>

      <ol className="projects-list">
        {projects.map((p, i) => (
          <ProjectRow key={p.id} project={p} featured={i < FEATURED} flip={i === 1}>
            {i < FEATURED ? asideFor(p.id, p.nameHe) : null}
          </ProjectRow>
        ))}

        <li className="projects-row is-dense is-era">
          <h3 className="projects-name" id="project-odin-era">
            {odinEra.name}
          </h3>
          <p className="projects-when mono">
            <span>{odinEra.period}</span>
          </p>
          <div className="projects-body">
            <p className="projects-line">{odinEra.summary}</p>
            <p className="projects-era-count">
              {fmt(odinEra.repos2023)} new repos and {fmt(odinEra.commits2023)} commits in 2023.
            </p>
            <p className="projects-stack mono">{odinEra.examples.join(', ')}</p>
            <p className="projects-links">
              {odinEra.links.map((l) => (
                <a key={l.href} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ))}
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}
