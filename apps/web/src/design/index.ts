// Design system entry: fonts + tokens + base. Imported once by main.tsx.
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-600.css';
import './tokens.css';
import './base.css';

/** Scene palette mirrored for canvas code (the swarm reads these, CSS reads the vars). */
export const SCENE = {
  dark: { scene: '#0B0A09', ink: '#F4EFE6', muted: '#8E877D', particle: '#F4EFE6', fast: '#9DB4FF' },
  light: { scene: '#EDEAE3', ink: '#171411', muted: '#6B645B', particle: '#171411', fast: '#2B4BFF' },
} as const;
export const ACCENT = '#2B4BFF';

export type SceneMode = keyof typeof SCENE;

export function applyScene(mode: SceneMode): void {
  document.documentElement.dataset.scene = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SCENE[mode].scene);
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isMobileViewport = (): boolean => typeof innerWidth === 'number' && innerWidth <= 720;

/** The display font string used by canvas rasterizers (swarm text shapes, beat measurement). */
export const DISPLAY_FONT_FAMILY = "'Bricolage Grotesque Variable', 'Bricolage Grotesque', system-ui, sans-serif";
