// Splits display text on the `||` turn marks (POLISH2 C1). Sits after the tag parser: the text it
// sees has no tags left, only the marks. Emits the text with the marks stripped and a `turn` boundary
// between turns — lazily, right before the next turn's first visible text or action, so a mark at the
// very start or end of a reply (or two in a row) never makes an empty turn. The first text of a turn
// carries no leading space.

import type { Action } from '@yoyo/protocol';
import { TURN_MARK } from './pace';

export type TurnOut = { type: 'token'; text: string } | { type: 'action'; action: Action } | { type: 'turn' };

export interface TurnSplitter {
  text(s: string): void;
  action(a: Action): void;
  /** flush at the end of a reply (a lone trailing `|` is released as text); idempotent */
  end(): void;
}

export function createTurnSplitter(emit: (o: TurnOut) => void): TurnSplitter {
  /** a trailing `|` that may be half of a mark */
  let tail = '';
  /** visible text in the current turn so far */
  let hasText = false;
  let pendingBreak = false;
  /** trailing whitespace, held: it is dropped if a mark follows */
  let space = '';

  const out = (s: string) => {
    if (!s) return;
    if (!hasText || pendingBreak) s = s.replace(/^\s+/, '');
    else s = space + s;
    space = '';
    const t = /\s+$/.exec(s)?.[0] ?? '';
    if (t) {
      space = t;
      s = s.slice(0, -t.length);
    }
    if (!s) return;
    if (pendingBreak) {
      emit({ type: 'turn' });
      pendingBreak = false;
    }
    hasText = true;
    emit({ type: 'token', text: s });
  };

  const run = (s: string, final: boolean) => {
    s = tail + s;
    tail = '';
    if (!final && s.endsWith('|') && !s.endsWith(TURN_MARK)) {
      tail = '|';
      s = s.slice(0, -1);
    }
    const parts = s.split(TURN_MARK);
    parts.forEach((p, i) => {
      if (i > 0 && hasText) {
        pendingBreak = true;
        space = '';
      }
      out(p);
    });
  };

  return {
    text: (s) => run(s, false),
    // a tag right after a mark belongs to the turn that follows it (`A. || [[become:x]] B.`): the boundary
    // goes out first, so the UI can tie the tag to that turn (WAVE4 U10)
    action: (a) => {
      if (pendingBreak) {
        emit({ type: 'turn' });
        pendingBreak = false;
        hasText = false;
      }
      emit({ type: 'action', action: a });
    },
    end: () => run('', true),
  };
}
