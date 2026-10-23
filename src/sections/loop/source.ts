// The excerpt of this section's own code that streams in its PR diff: the
// horizontal pipeline from the diagram, which is the part worth watching.
import raw from './LoopDiagram.tsx?raw';
import { excerpt } from '../excerpt';

const from = raw.indexOf('// The pipeline:');
const to = raw.indexOf('function Vertical');
export const source = excerpt(from >= 0 && to > from ? raw.slice(from, to) : raw, 70);
