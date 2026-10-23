import { repos, type Repo } from '../../data/stats';

// SPEC §2 Skills, every keyword, grouped. Edit here; the component only typesets.
export const GROUPS: { name: string; items: string[] }[] = [
  {
    name: 'Languages',
    items: ['TypeScript', 'JavaScript', 'Java', 'C', 'Python (basic)', 'Bash', 'HTML/CSS', 'Solidity/Hardhat (2022)'],
  },
  {
    name: 'Web & data',
    items: ['Node.js', 'React', 'Express', 'REST', 'OAuth', 'PostgreSQL', 'pgvector', 'MongoDB', 'Prisma', 'Three.js', 'Web Audio'],
  },
  {
    name: 'AI & tooling',
    items: ['LLM APIs', 'MCP', 'embeddings', 'agent orchestration', 'Claude Code', 'Codex', 'Cursor'],
  },
  {
    name: 'Infra & testing',
    items: ['Git', 'Linux', 'GitHub Actions', 'Docker', 'Vitest', 'Jest', 'Playwright'],
  },
];

/** Primary language of each public repo, most common first. Computed from repos.json. */
export function languagesByRepo(list: Pick<Repo, 'language' | 'created_at'>[] = repos) {
  const counts = new Map<string, number>();
  let earlyJs = 0; // JavaScript repos created in the 2022–23 learning era
  for (const r of list) {
    if (!r.language) continue;
    counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    if (r.language === 'JavaScript' && r.created_at < '2024') earlyJs++;
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { ranked, earlyJs };
}
