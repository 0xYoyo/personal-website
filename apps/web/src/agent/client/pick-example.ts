// Which prebuilt example answers a build instruction in scripted mode (POLISH1 C1).
// Shared by the scripted brain, the mock worker and tools/eval-brain.mjs.
//
// Each example has strong words (the thing itself) and weak words (hints). The
// highest score wins; a tie goes to the earlier example in RULES. No hit → null,
// and the caller rotates through the examples.

export type ExampleId = 'todo' | 'pomodoro' | 'landing' | 'birthday' | 'weather' | 'habits';

interface Rule {
  id: ExampleId;
  strong: readonly string[];
  weak: readonly string[];
}

export const EXAMPLE_RULES: readonly Rule[] = [
  { id: 'weather', strong: ['weather', 'forecast'], weak: ['temperature', 'rain', 'climate', 'sunny'] },
  { id: 'habits', strong: ['habit', 'habits'], weak: ['tracker', 'streak', 'routine'] },
  { id: 'todo', strong: ['todo', 'to-do'], weak: ['task', 'tasks', 'checklist', 'list'] },
  { id: 'pomodoro', strong: ['pomodoro'], weak: ['timer', 'focus', 'countdown', 'stopwatch'] },
  { id: 'birthday', strong: ['birthday'], weak: ['card', 'mom', 'mum', 'greeting', 'anniversary', 'party'] },
  { id: 'landing', strong: ['landing'], weak: ['startup', 'page', 'website', 'homepage', 'saas', 'marketing'] },
];

const has = (low: string, word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${word}s?([^\\p{L}\\p{N}]|$)`, 'u').test(low);

/** The example an instruction asks for, or null when nothing matches. */
export function pickExampleId(instruction: string): ExampleId | null {
  const low = instruction.toLowerCase();
  let best: ExampleId | null = null;
  let bestScore = 0;
  for (const r of EXAMPLE_RULES) {
    const score = r.strong.filter((w) => has(low, w)).length * 3 + r.weak.filter((w) => has(low, w)).length;
    if (score > bestScore) {
      best = r.id;
      bestScore = score;
    }
  }
  return best;
}
