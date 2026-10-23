// Stand-in until the showcases part lands: the project name, large, in a
// muted box. Same contract as the real showcases.
import { copy } from '../content/copy';
import type { ShowcaseProps } from './types';

export function PlaceholderShowcase({ project }: ShowcaseProps) {
  return (
    <div className="y-showcase-ph" aria-hidden="true">
      <span className="y-showcase-ph-name">{project.name}</span>
      {project.nameHe && (
        <span className="y-showcase-ph-he he" lang="he" dir="rtl">
          {project.nameHe}
        </span>
      )}
      <span className="y-showcase-ph-tag y-mono">{copy.card.showcase}</span>
    </div>
  );
}
