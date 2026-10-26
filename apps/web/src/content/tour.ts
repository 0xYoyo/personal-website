// The passive tour (WAVE3 V3): ~35 s, first person, no ordinals. Caption and shape
// change together: the caption types in while the shape knits (POLISH2 A3).
// Consecutive shapes morph straight into each other (no release between them).
import { beat, seq, typeMs, type BeatSpec, type Step } from '../ui/runner/engine';
import { TOUR_END_CHIPS } from './chips';

const SHIPPED = "Things I've shipped:";
/** the project-name beats: each caption stays 2.4 s from the moment it has typed in */
export const PROJECT_HOLD = 2400;
/** a tour beat: shape and caption at once (0 ms offset); `stay` = ms the caption stays */
const tb = (b: BeatSpec, stay?: number) => beat({ ...b, sync: true, ...(stay ? { captionHold: stay } : {}) });
const project = (say: string, id: 'kart' | 'magnifier' | 'loop' | 'cap') =>
  tb({ lead: SHIPPED, say, become: { kind: 'glyph', id }, captionHold: typeMs(say) + PROJECT_HOLD });

export const tour: Step[] = seq([
  tb({ say: "I'm Yoyo.", become: { kind: 'yoyo3d' }, mood: 'speaking' }, 5000),
  tb({ say: "I don't write most of my code anymore.", become: { kind: 'glyph', id: 'keyboard' } }, 3600),
  tb({ say: 'I direct the things that do.', become: { kind: 'glyph', id: 'cursor' } }, 3600),
  project('Unfiltered', 'magnifier'),
  project('Prompt Racers', 'kart'),
  project('yoyo-loop', 'loop'),
  project('Reichman Courses connector', 'cap'),
  tb({ say: 'Crypto since 2021. Self-taught since 2022. Reichman since 2025.', become: { kind: 'glyph', id: 'btc' } }, 4500),
  tb({ say: 'Ask me anything.', become: { kind: 'glyph', id: 'question' }, mood: 'speaking', chips: TOUR_END_CHIPS }, 7500),
]);
