import { branchStrength, gitCommits, HEAD_BRANCH, type BranchName, type GitCommit } from '../../content/gitlog';

/** Opaque lane colour from tokens only, so crossing lines never double up. */
export function branchColor(branch: BranchName): string {
  if (branch === 'agents') return 'var(--agent-text)';
  return `color-mix(in srgb, var(--fg) ${branchStrength[branch]}%, var(--bg))`;
}

// Like `--all`: every branch name decorates its tip, newest commit on it.
const tips = new Map<BranchName, string>();
for (const c of [...gitCommits].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) tips.set(c.branch, c.id);

export function refsFor(c: GitCommit): BranchName[] {
  return tips.get(c.branch) === c.id ? [c.branch] : [];
}

export function rowLabel(c: GitCommit, sha: string, real: boolean): string {
  const refs = refsFor(c)
    .map((b) => (b === HEAD_BRANCH ? 'HEAD, main' : `tip of ${b}`))
    .concat(c.tag ? [`tag ${c.tag}`] : []);
  const hash = real ? `real commit ${sha}` : `hash ${sha}`;
  return `${c.date}, on ${c.branch}: ${c.message}. ${refs.length ? refs.join(', ') + '. ' : ''}${hash}`;
}
