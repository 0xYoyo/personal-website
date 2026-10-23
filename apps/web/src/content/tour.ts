// The passive tour (SPEC §2.2). Lines verbatim; long lines are split at their
// own sentence boundaries so each sentence lands with its shape. ≈ 45 s.
import { seq, type Step } from '../ui/runner/engine';

export const tour: Step[] = seq([
  // 1. This is what I do. — conductor's wave, then streams that each build a window
  { say: 'This is what I do.', become: { kind: 'glyph', id: 'wave' }, mood: 'speaking', hold: 4200 },
  { become: { kind: 'glyph', id: 'frame' }, mood: 'building', hold: 4400 },
  // 2. keyboard that dissolves into a flock of cursors
  { say: "I don't write most of my code anymore.", become: { kind: 'glyph', id: 'keyboard' }, mood: 'speaking', hold: 4000 },
  { say: 'I direct the things that do.', become: { kind: 'glyph', id: 'cursor' }, hold: 4000 },
  // 3. the five project glyphs, each with its name for 1.5 s
  { say: "Things I've shipped:", release: true, hold: 1200 },
  { sub: 'Prompt Racers', become: { kind: 'glyph', id: 'kart' }, hold: 1500 },
  { sub: 'Unfiltered', become: { kind: 'glyph', id: 'magnifier' }, hold: 1500 },
  { sub: 'yoyo-loop', become: { kind: 'glyph', id: 'loop' }, hold: 1500 },
  { sub: 'Reichman Courses connector', become: { kind: 'glyph', id: 'cap' }, hold: 1500 },
  { sub: 'Availability Monitor', become: { kind: 'glyph', id: 'tent' }, hold: 1700 },
  // 4. three quick forms: ₿ · shield-chevron · a route across a continent
  { say: "I've been in crypto since 2021.", become: { kind: 'glyph', id: 'btc' }, hold: 3400 },
  { say: 'I served in a combat unit.', become: { kind: 'glyph', id: 'shield' }, hold: 3400 },
  { say: 'I spent 2024 on the road.', become: { kind: 'glyph', id: 'route' }, hold: 3800 },
  // 5. a question mark, then your cursor's position
  { say: 'Ask me anything. Or tell me what to become.', become: { kind: 'glyph', id: 'question' }, mood: 'speaking', hold: 4200 },
  { release: true, mood: 'idle', hold: 3000, chips: ['Who is Yoyo?', 'What has he built?', 'Spell my name', 'Build me something', 'Play his game'] },
]);
