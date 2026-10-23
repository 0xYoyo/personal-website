// The excerpt of this section's own code that streams in its PR diff: the
// layout function, which is the interesting part (Component.tsx is mostly markup).
import raw from './layout.ts?raw';
import { excerpt } from '../excerpt';

export const source = excerpt(raw.slice(raw.indexOf('/**\n * Deterministic')), 70);
