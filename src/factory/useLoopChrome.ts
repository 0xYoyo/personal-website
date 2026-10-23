import { useEffect } from 'react';
import { factoryStore, isComplete, selectFocus, selectLightsLevel, type FactoryState } from './store';
import { LIGHTS } from '../design/lights';

/** "Yoav Zrihan", appended to the loop's tab titles. */
const NAME = 'Yoav Zrihan';

/** What the browser tab says while the loop runs; null means the page's normal title. */
export function loopTitle(s: Pick<FactoryState, 'meta' | 'sections' | 'skipped' | 'mode'>): string | null {
  if (s.skipped || isComplete(s)) return null;
  const focus = selectFocus(s);
  if (!focus) return null;
  const waiting = s.sections[focus.id]?.state === 'awaiting-merge' && s.mode === 'manual';
  return `PR #${focus.pr} ${waiting ? 'waiting on you' : 'building'} — ${NAME}`;
}

/** The favicon mark (same as public/favicon.svg) in the page's current colors. */
export function faviconHref(bg: string, fg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${bg}"/>` +
    `<circle cx="16" cy="16" r="5" fill="${fg}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The browser chrome follows the loop: the tab title says which PR is building
 * or waiting on you, and theme-color and the favicon follow the eight lights
 * states (src/design/lights.ts, the same values as tokens.css), switching when
 * the page's own ease settles.
 */
export function useLoopChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const baseTitle = document.title;
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');

    const setTitle = (s: FactoryState) => {
      const t = loopTitle(s) ?? baseTitle;
      if (document.title !== t) document.title = t;
    };

    let shown = -1;
    const applyLights = (level: number) => {
      const l = LIGHTS[level] ?? LIGHTS[0]!;
      if (level === shown) return;
      shown = level;
      for (const m of metas) m.content = l.bg;
      if (icon) {
        icon.type = 'image/svg+xml';
        icon.href = faviconHref(l.bg, l.fg);
      }
    };

    const dur = () => parseFloat(getComputedStyle(root).getPropertyValue('--dur-light')) || 900;
    let timer = 0;
    const schedule = (level: number, instant: boolean) => {
      window.clearTimeout(timer);
      if (instant) applyLights(level);
      else timer = window.setTimeout(() => applyLights(level), dur());
    };

    setTitle(factoryStore.getState());
    applyLights(selectLightsLevel(factoryStore.getState()));
    let shownRun = factoryStore.getState().runId;
    const unsubscribe = factoryStore.subscribe((s, prev) => {
      setTitle(s);
      const level = selectLightsLevel(s);
      const prevLevel = selectLightsLevel(prev);
      if (level === prevLevel) return;
      // Same rule as App's useLights: skipping and replaying jump, merges ease.
      schedule(level, (s.skipped && !prev.skipped) || (s.runId !== shownRun && level < prevLevel));
      shownRun = s.runId;
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      document.title = baseTitle;
    };
  }, []);
}
