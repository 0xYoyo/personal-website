// The passive tour (SPEC §2.2, POLISH1 A2). Lines verbatim; long lines are split
// at their own sentence boundaries so each sentence lands with its shape. Every
// beat forms its shape first and the caption follows 900 ms later; consecutive
// shapes morph straight into each other (no release between them).
import { beat, seq, type Step } from '../ui/runner/engine';

const SHIPPED = "Things I've shipped:";
/** the project-name beats: each caption stays 2.6 s */
const PROJECT_HOLD = 2600;

export const tour: Step[] = seq([
  // 1. This is what I do. — conductor's wave, then one window frame (agents shipping)
  beat({ say: 'This is what I do.', become: { kind: 'glyph', id: 'wave' }, mood: 'speaking' }),
  beat({ become: { kind: 'glyph', id: 'frame' }, mood: 'building', hold: 3000 }),
  // 2. a keyboard, then the cursors that do the typing
  beat({ say: "I don't write most of my code anymore.", become: { kind: 'glyph', id: 'keyboard' }, mood: 'speaking' }),
  beat({ say: 'I direct the things that do.', become: { kind: 'glyph', id: 'cursor' } }),
  // 3. the five project glyphs, each with its name
  beat({ lead: SHIPPED, say: 'Prompt Racers', become: { kind: 'glyph', id: 'kart' }, captionHold: PROJECT_HOLD }),
  beat({ lead: SHIPPED, say: 'Unfiltered', become: { kind: 'glyph', id: 'magnifier' }, captionHold: PROJECT_HOLD }),
  beat({ lead: SHIPPED, say: 'yoyo-loop', become: { kind: 'glyph', id: 'loop' }, captionHold: PROJECT_HOLD }),
  beat({ lead: SHIPPED, say: 'Reichman Courses connector', become: { kind: 'glyph', id: 'cap' }, captionHold: PROJECT_HOLD }),
  beat({ lead: SHIPPED, say: 'Availability Monitor', become: { kind: 'glyph', id: 'tent' }, captionHold: PROJECT_HOLD }),
  // 4. three quick forms: ₿ · shield-chevron · a route across a continent
  beat({ say: "I've been in crypto since 2021.", become: { kind: 'glyph', id: 'btc' } }),
  beat({ say: 'I served in a combat unit.', become: { kind: 'glyph', id: 'shield' } }),
  beat({ say: 'I spent 2024 on the road.', become: { kind: 'glyph', id: 'route' } }),
  // 5. a question mark, then your cursor
  beat({ say: 'Ask me anything. Or tell me what to become.', become: { kind: 'glyph', id: 'question' }, mood: 'speaking' }),
  beat({ become: { kind: 'glyph', id: 'cursor' }, mood: 'idle', hold: 2400, chips: ['Who is Yoyo?', 'What has he built?', 'Spell my name', 'Build me something', 'Play his game'] }),
]);
