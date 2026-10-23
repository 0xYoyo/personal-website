import fontUrl from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url';
import { DISPLAY_FONT } from './shapes';

let loading: Promise<void> | null = null;

/** Load Bricolage Grotesque (variable, local file via npm) under a private family name. Never blocks > 2.5 s. */
export function loadDisplayFont(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
      const ff = new FontFace(DISPLAY_FONT, `url(${fontUrl}) format('woff2')`, { weight: '200 800', style: 'normal' });
      const done = ff.load().then((f) => { document.fonts.add(f); });
      await Promise.race([done, new Promise((r) => setTimeout(r, 2500))]);
    } catch (e) {
      console.warn('[swarm] display font failed to load; using fallback', e);
    }
  })();
  return loading;
}
