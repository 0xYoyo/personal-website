// The excerpt of this section's own code that streams in its PR diff: the
// particle maths (where each commit settles and how it flies there), not imports.
import raw from './cloud.ts?raw';
import { excerpt } from '../excerpt';

const from = raw.indexOf('export function layout');
const to = raw.indexOf('/* ---------- Rendering');
export const source = excerpt(raw.slice(from, to), 70);
