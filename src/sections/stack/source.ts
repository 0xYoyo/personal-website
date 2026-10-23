// The excerpt of this section's own code that streams in its PR diff:
// the component, then the helper that computes its closing line.
import component from './Component.tsx?raw';
import groups from './groups.ts?raw';
import { excerpt } from '../excerpt';

const helper = groups.slice(Math.max(0, groups.indexOf('/** Primary language')));

export const source = excerpt(`${component.trimEnd()}\n\n// groups.ts\n${helper}`, 70);
