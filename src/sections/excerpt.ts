/**
 * Trim a component's raw source to the excerpt streamed in its PR diff:
 * at most `max` lines (SPEC: 40–70), without trailing blank lines.
 */
export function excerpt(raw: string, max = 70): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').slice(0, max);
  while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop();
  return lines.join('\n');
}
