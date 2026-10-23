import { GROUPS, languagesByRepo } from './groups';
import './stack.css';

const { ranked, earlyJs } = languagesByRepo();
const byRepo = ranked.map(([lang, n]) => `${lang} ${n}`).join(', ');

/**
 * Stack: a typeset list, not a chip cloud. Each group is a small heading and
 * one comma-separated run of keywords, so a recruiter's scanner (or eye)
 * reads every term as plain text.
 */
export default function StackSection() {
  return (
    <div className="stack">
      <p className="lede stack-lede">
        Strongest in TypeScript end to end; Java and C from the degree; Python basic.
      </p>

      <dl className="stack-groups">
        {GROUPS.map((group) => (
          <div key={group.name} className="stack-group">
            <dt className="stack-name">{group.name}</dt>
            <dd className="stack-items">{group.items.join(', ')}</dd>
          </div>
        ))}
      </dl>

      {ranked.length > 0 && (
        <p className="stack-byrepo mono">
          By repo: {byRepo}.
          {earlyJs > 0 && ` ${earlyJs} of the JavaScript repos are from 2022–23.`}
        </p>
      )}
    </div>
  );
}
