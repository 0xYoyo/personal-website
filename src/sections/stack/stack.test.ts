import { describe, expect, it } from 'vitest';
import { GROUPS, languagesByRepo } from './groups';

// SPEC §2 Skills, verbatim.
const SKILLS =
  'TypeScript, JavaScript, Node.js, React, Express, REST, OAuth, PostgreSQL, pgvector, MongoDB, Prisma, Bash, Java, C, Python (basic), HTML/CSS, LLM APIs, MCP, embeddings, agent orchestration, Claude Code, Codex, Cursor, Git, Linux, GitHub Actions, Docker, Vitest, Jest, Playwright, Three.js, Web Audio, Solidity/Hardhat (2022)'.split(
    ', ',
  );

describe('stack', () => {
  it('lists every SPEC skill exactly once and nothing else', () => {
    const items = GROUPS.flatMap((g) => g.items);
    expect([...items].sort()).toEqual([...SKILLS].sort());
  });
  it('ranks languages by repo count', () => {
    const { ranked, earlyJs } = languagesByRepo([
      { language: 'TypeScript', created_at: '2026-01-01' },
      { language: 'JavaScript', created_at: '2023-01-01' },
      { language: 'JavaScript', created_at: '2025-01-01' },
      { language: null, created_at: '2023-01-01' },
    ]);
    expect(ranked).toEqual([
      ['JavaScript', 2],
      ['TypeScript', 1],
    ]);
    expect(earlyJs).toBe(1);
  });
});
