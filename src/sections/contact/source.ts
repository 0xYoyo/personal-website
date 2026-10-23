// The excerpt of this section's own code that streams in its PR diff.
import raw from './Component.tsx?raw';
import { excerpt } from '../excerpt';

export const source = excerpt(raw, 70);
