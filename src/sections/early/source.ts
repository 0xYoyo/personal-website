// The excerpt of this section's own code that streams in its PR diff: the
// timeline component, past its imports.
import raw from './Timeline.tsx?raw';
import { excerpt } from '../excerpt';

export const source = excerpt(raw.slice(raw.indexOf('/** The spine')), 70);
