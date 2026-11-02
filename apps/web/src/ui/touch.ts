// A touch device (a coarse pointer, or no hover at all): it has no Esc key to point at, so its Close
// buttons say just "Close" (WAVE5 QA). Read once per mount; a phone does not turn into a desktop.
import { useState } from 'react';

export function isTouch(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
}

export function useTouch(): boolean {
  const [touch] = useState(isTouch);
  return touch;
}
