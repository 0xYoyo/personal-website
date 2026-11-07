import { describe, expect, it } from 'vitest';
import { PROJECT_IDS } from '@yoyo/protocol';
import { projectById, projects, projectsOf } from '../content/projects';
import { lastOfShelf, shelfPosition } from '../controller';

// WAVE6 L3 / L4: the showcase order and the Vortex links.
describe('project order (WAVE6 L3)', () => {
  it('each era lists its cards in the approved order', () => {
    expect(projectsOf('ai').map((p) => p.id)).toEqual([
      'unfiltered', 'prompt-racers', 'yoyo-loop', 'runi-connector', 'polybot', 'availability-monitor',
    ]);
    expect(projectsOf('hand').map((p) => p.id)).toEqual(['yoyo-network', 'pnl-bot', 'sentiment-gauge', 'vortex']);
  });

  it('PROJECT_IDS (Next one, guards) matches the card order', () => {
    expect([...PROJECT_IDS]).toEqual(projects.map((p) => p.id));
  });

  it('"50+ more on GitHub" sits on availability-monitor and vortex; counts follow the order', () => {
    const last = projects.filter((p) => lastOfShelf(p.id)).map((p) => p.id);
    expect(last).toEqual(['availability-monitor', 'vortex']);
    expect(shelfPosition('polybot')).toEqual({ at: 5, of: 6 });
    expect(shelfPosition('yoyo-network')).toEqual({ at: 1, of: 4 });
  });
});

describe('Vortex links (WAVE6 L4)', () => {
  it('keeps GitHub and has no Bot link', () => {
    const labels = projectById('vortex').links.map((l) => l.label);
    expect(labels).toEqual(['GitHub']);
  });
});
