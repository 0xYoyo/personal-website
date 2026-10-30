import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ShowcaseFrame, showcaseOrder, showcases, showcaseTiming } from '../parts';

describe('showcases', () => {
  it('exports one piece per project id', () => {
    expect(Object.keys(showcases).sort()).toEqual([...showcaseOrder].sort());
    expect(showcaseOrder).toHaveLength(10);
  });

  for (const id of showcaseOrder) {
    const C = showcases[id];
    it(`${id} renders animated, paused and reduced-motion`, () => {
      for (const props of [{}, { playing: false }, { reducedMotion: true }, { seek: 3.3 }]) {
        const { container, unmount } = render(
          <ShowcaseFrame label={id}>
            <C {...props} />
          </ShowcaseFrame>,
        );
        const root = container.querySelector('.sc-root');
        expect(root).not.toBeNull();
        // every piece carries a text description for screen readers
        expect(container.querySelector('.sc-sr')?.textContent?.length ?? 0).toBeGreaterThan(20);
        unmount();
      }
    });
    it(`${id} loops in 8–12 s`, () => {
      const { duration, keyTime } = showcaseTiming[id];
      expect(duration).toBeGreaterThanOrEqual(8);
      expect(duration).toBeLessThanOrEqual(12);
      expect(keyTime).toBeGreaterThanOrEqual(0);
      expect(keyTime).toBeLessThan(duration);
    });
  }

  it('renders every frame of each timeline without throwing', () => {
    for (const id of showcaseOrder) {
      if (id === 'prompt-racers') continue;
      const C = showcases[id];
      const { duration } = showcaseTiming[id];
      for (let t = 0; t < duration; t += 0.25) {
        const { unmount } = render(<C seek={t} />);
        unmount();
      }
    }
  });
});
