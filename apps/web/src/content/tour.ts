// The passive tour (SPEC §2.2, POLISH2 A3). Lines verbatim; long lines are split
// at their own sentence boundaries so each sentence lands with its shape. Caption
// and shape change together: the caption types in while the shape knits.
// Consecutive shapes morph straight into each other (no release between them).
import { beat, seq, typeMs, type BeatSpec, type Step } from '../ui/runner/engine';

const SHIPPED = "Things I've shipped:";
/** the project-name beats: each caption stays 2.6 s from the moment it has typed in */
export const PROJECT_HOLD = 2600;
/** a tour beat: shape and caption at once (0 ms offset) */
const tb = (b: BeatSpec) => beat({ ...b, sync: true });
const project = (say: string, id: 'kart' | 'magnifier' | 'loop' | 'cap' | 'tent') =>
  tb({ lead: SHIPPED, say, become: { kind: 'glyph', id }, captionHold: typeMs(say) + PROJECT_HOLD });

export const tour: Step[] = seq([
  // 1. This is what I do. — conductor's wave, then one window frame (agents shipping)
  tb({ say: 'This is what I do.', become: { kind: 'glyph', id: 'wave' }, mood: 'speaking' }),
  beat({ become: { kind: 'glyph', id: 'frame' }, hold: 3000 }),
  // 2. a keyboard, then the cursors that do the typing
  tb({ say: "I don't write most of my code anymore.", become: { kind: 'glyph', id: 'keyboard' }, mood: 'speaking' }),
  tb({ say: 'I direct the things that do.', become: { kind: 'glyph', id: 'cursor' } }),
  // 3. the five project glyphs, each with its name
  project('Prompt Racers', 'kart'),
  project('Unfiltered', 'magnifier'),
  project('yoyo-loop', 'loop'),
  project('Reichman Courses connector', 'cap'),
  project('Availability Monitor', 'tent'),
  // 4. three quick forms: ₿ · shield-chevron · a route across a continent
  tb({ say: "I've been in crypto since 2021.", become: { kind: 'glyph', id: 'btc' } }),
  tb({ say: 'I served in a combat unit.', become: { kind: 'glyph', id: 'shield' } }),
  tb({ say: 'I spent 2024 on the road.', become: { kind: 'glyph', id: 'route' } }),
  // 5. a question mark, then your cursor
  tb({ say: 'Ask me anything. Or tell me what to become.', become: { kind: 'glyph', id: 'question' }, mood: 'speaking' }),
  beat({ become: { kind: 'glyph', id: 'cursor' }, hold: 2400, chips: ['Who is Yoyo?', 'What has he built?', 'Spell my name', 'Build me something', 'Play his game'] }),
]);
