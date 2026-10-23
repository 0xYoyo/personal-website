import { factoryStore, formatDuration, mergeByHand, selectAwaiting, selectFocus } from '../store';
import { session } from '../useBottomReach';
import type { SectionId } from '../types';
import { hireMailto, profile } from '../../content/profile';

export function scrollToSection(id: SectionId | 'top') {
  const el = id === 'top' ? document.body : document.getElementById(id);
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (id === 'top') window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  else el?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

export function replayBuild() {
  window.scrollTo({ top: 0, behavior: 'auto' });
  // Drop ?skip=1 so a reload after replay plays the show again.
  const url = new URL(window.location.href);
  if (url.searchParams.has('skip')) {
    url.searchParams.delete('skip');
    window.history.replaceState(null, '', url);
  }
  factoryStore.getState().replay();
}

/** The public page URL for sharing: VITE_SITE_URL when non-empty, else this page without its query. */
export function shareUrl(): string {
  const site = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').trim();
  return site !== '' ? site : window.location.origin + window.location.pathname;
}

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export interface Command {
  name: string;
  description: string;
  /** Extra words the command answers to. Search matches the name and these only, never the description. */
  keywords?: string[];
  /** Returns lines to print in the palette, or nothing to close it. */
  run: () => string[] | void;
}

const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

export function buildCommands(): Command[] {
  const s = () => factoryStore.getState();
  return [
    {
      name: '/yoyo-status',
      description: "What's waiting on you",
      keywords: ['status', 'waiting'],
      run: () => {
        const st = s();
        const awaiting = selectAwaiting(st);
        const counts = { queued: 0, inFlight: 0, merged: 0 };
        for (const m of st.meta) {
          const x = st.sections[m.id]?.state;
          if (x === 'queued') counts.queued++;
          else if (x === 'merged') counts.merged++;
          else if (x !== 'awaiting-merge') counts.inFlight++;
        }
        return [
          awaiting ? `#${awaiting.pr} ${awaiting.title} is waiting on you.` : 'Nothing is waiting on you.',
          `${counts.merged} merged, ${counts.inFlight} in flight, ${counts.queued} queued. Mode: ${st.mode}.`,
        ];
      },
    },
    {
      name: '/yoyo-build',
      description: 'Start the next queued PR now',
      keywords: ['build', 'start'],
      run: () => {
        const next = s().requestBuild();
        return [next ? `Claimed #${next.pr} ${next.title} on ${next.branch}.` : 'Nothing left in the queue.'];
      },
    },
    {
      name: '/yoyo-review',
      description: 'Jump to the PR in review',
      keywords: ['review'],
      run: () => {
        const focus = selectFocus(s());
        if (!focus) return ['Nothing is in review.'];
        scrollToSection(focus.id);
      },
    },
    {
      name: '/yoyo-merge',
      description: 'Merge the PR that is waiting on you',
      keywords: ['merge'],
      run: () => {
        const awaiting = selectAwaiting(s());
        if (!awaiting) return ['Nothing is ready to merge yet.'];
        mergeByHand(awaiting.id);
        return [`Merged #${awaiting.pr} ${awaiting.title}. By you.`];
      },
    },
    {
      name: '/yoyo-merge-all',
      description: 'Fast-forward every open PR and merge it',
      keywords: ['merge', 'all', 'finish'],
      run: () => {
        const st = s();
        const open = st.meta.filter((m) => st.sections[m.id]?.state !== 'merged');
        if (open.length === 0) return ['Everything is already merged.'];
        // Close first: the end card opens when the last PR lands, and two dialogs never stack.
        st.setPaletteOpen(false);
        st.rushAll('command');
      },
    },
    {
      name: '/yoyo-replay',
      description: 'Unmerge everything and run the loop again',
      keywords: ['replay', 'restart', 'again'],
      run: () => replayBuild(),
    },
    {
      name: '/yoyo-diagnose',
      description: 'Measured facts about this session',
      keywords: ['diagnose', 'session', 'stats'],
      run: () => diagnose(),
    },
    { name: 'git log', description: 'Jump to life as a git log', keywords: ['history', 'life'], run: () => scrollToSection('gitlog') },
    {
      name: 'play prompt-racers',
      description: 'Play the real contest build',
      keywords: ['game', 'play'],
      run: () => s().setGameOpen(true),
    },
    { name: 'open cv', description: 'Download the CV (PDF)', keywords: ['resume', 'pdf'], run: () => void open(assetUrl(profile.links.cv)) },
    {
      name: 'lights',
      description: 'Lights: flip between the build-site dark and the finished light',
      keywords: ['theme', 'dark', 'light'],
      run: () => s().toggleLights(),
    },
    {
      name: 'contact',
      description: 'Email, GitHub, LinkedIn, CV',
      keywords: ['hire', 'email'],
      run: () => {
        scrollToSection('contact');
      },
    },
    { name: 'github', description: 'github.com/0xYoyo', run: () => void open(profile.links.github) },
    { name: 'linkedin', description: 'linkedin.com/in/yoavzrihan', run: () => void open(profile.links.linkedin) },
    { name: 'email', description: profile.email, run: () => void (window.location.href = hireMailto) },
  ];
}

/** Real, measured facts only: no verdicts. */
export function diagnose(): string[] {
  const st = factoryStore.getState();
  const c = st.mergeCounts;
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const viewport = typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : 'unknown';
  return [
    `Time on page: ${formatDuration(Date.now() - st.startedAt)}.`,
    `Merges: ${c.hand} by hand, ${c.keyboard} by keyboard, ${c.autopilot} by autopilot, ${c.scroll} by scrolling past, ${c.command} by /yoyo-merge-all.`,
    `Deepest scroll: ${Math.round(session.maxScrollDepth * 100)}% of the page. Viewport ${viewport}. Reduced motion ${reduced ? 'on' : 'off'}.`,
    `Command palette opened ${st.paletteOpens} ${st.paletteOpens === 1 ? 'time' : 'times'} this run.`,
  ];
}

/** Score a query against a command's name and keywords (never its description). */
export function commandScore(query: string, cmd: Pick<Command, 'name' | 'keywords'>): number | null {
  let best: number | null = fuzzyScore(query, cmd.name);
  for (const k of cmd.keywords ?? []) {
    // Keywords match by prefix only, so "merge" never reaches a command via a word like "unmerge".
    const q = query.trim().toLowerCase();
    if (q && k.toLowerCase().startsWith(q)) best = Math.max(best ?? -1, 2 + q.length * 3);
  }
  return best;
}

/** Commands matching a query, best first. Matches command names and keywords only. */
export function searchCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  return commands
    .map((c, i) => ({ c, i, score: commandScore(query, c) }))
    .filter((x): x is { c: Command; i: number; score: number } => x.score !== null && x.score >= 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Fuzzy match: every query character must appear in order. Scores favour
 * prefix matches and consecutive runs. Returns null when it does not match.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  const t = target.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    run = found === ti ? run + 1 : 0;
    score += 1 + run * 2 - Math.min(found - ti, 5) * 0.2;
    if (found === 0 || /[\s/-]/.test(t[found - 1] ?? '')) score += 3;
    ti = found + 1;
  }
  return score;
}
