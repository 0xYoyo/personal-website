import { useEffect, useState } from 'react';
import { useFactory } from '../store';
import { CI_CHECKS, type SectionId, type SectionRuntime } from '../types';
import { streamedLines } from '../stream';

/**
 * The one-line state of a PR in plain words, e.g. "building… 41 lines",
 * "checks · typecheck ✓ lint ✓", "review: approve", "waiting on you".
 */
export function describeState(rt: SectionRuntime, totalLines: number, autopilot: boolean, source?: string): string {
  switch (rt.state) {
    case 'queued':
      return 'queued';
    case 'building': {
      const n = streamedLines(rt, totalLines, source);
      return `building… ${n} ${n === 1 ? 'line' : 'lines'}`;
    }
    case 'ci': {
      const passed = CI_CHECKS.slice(0, rt.ciPassed).map((c) => `${c} ✓`);
      const running = CI_CHECKS[rt.ciPassed];
      return ['checks', [...passed, running ? `${running}…` : ''].filter(Boolean).join(' ')].join(' · ');
    }
    case 'review':
      return 'review: reading the diff…';
    case 'awaiting-merge':
      return autopilot ? 'approved · autopilot merging' : 'approved · waiting on you';
    case 'merged':
      return 'merged';
  }
}

/** Live state line for a section; re-renders a few times a second while building. */
export function useStateLine(id: SectionId, totalLines: number): string {
  const rt = useFactory((s) => s.sections[id]);
  const autopilot = useFactory((s) => s.mode === 'autopilot');
  const source = useFactory((s) => s.meta.find((m) => m.id === id)?.source);
  const [, force] = useState(0);
  useEffect(() => {
    if (rt?.state !== 'building') return;
    const t = window.setInterval(() => force((n) => n + 1), 100);
    return () => window.clearInterval(t);
  }, [rt?.state]);
  return rt ? describeState(rt, totalLines, autopilot, source) : '';
}
