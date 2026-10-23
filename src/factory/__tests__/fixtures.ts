import type { SectionMeta } from '../types';

const row = (id: SectionMeta['id'], pr: number, title: string, branch: string): SectionMeta => ({
  id,
  pr,
  title,
  branch,
  reviewNote: 'note',
  sourceLines: 50,
  sourceChars: 2100, // 1.5 s at 1,400 chars/s, clamped up to the 1.6 s minimum
});

export const META: SectionMeta[] = [
  row('hero', 1, 'chore: init', 'yoyo-init'),
  row('loop', 2, 'feat: how I work', 'feat/how-i-work'),
  row('projects', 3, 'feat: projects', 'feat/projects'),
  row('early', 4, 'feat: early', 'feat/early'),
  row('gitlog', 5, 'feat: life as a git log', 'feat/git-log'),
  row('now', 6, 'feat: live now', 'feat/live'),
  row('stack', 7, 'feat: stack', 'feat/stack'),
  row('contact', 8, 'feat: open a PR', 'feat/contact'),
];

export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}
