// Streaming parser for inline action tags. Feed raw model text in arbitrary
// chunks (a tag may be split across chunks); get display words and actions
// out in order. Unknown or malformed tags are dropped silently.
import { MAX_ACTIONS_PER_REPLY, parseActionTag, type Action } from '@yoyo/protocol';

export interface TagStream {
  push(chunk: string): void;
  end(): void;
  readonly actions: Action[];
  readonly text: string;
}

export function createTagStream(onWord: (w: string) => void, onAction: (a: Action) => void): TagStream {
  let buf = ''; // unparsed raw text (may hold a partial tag)
  let word = ''; // the display word being accumulated
  const words: string[] = [];
  const actions: Action[] = [];

  const flushWord = () => {
    if (word) {
      words.push(word);
      onWord(word);
      word = '';
    }
  };

  const emitText = (t: string) => {
    for (const ch of t) {
      if (/\s/.test(ch)) flushWord();
      else word += ch;
    }
  };

  const drain = (final: boolean) => {
    for (;;) {
      const open = buf.indexOf('[[');
      if (open === -1) {
        // keep a trailing "[" in case it starts a tag in the next chunk
        if (!final && buf.endsWith('[')) {
          emitText(buf.slice(0, -1));
          buf = '[';
        } else {
          emitText(buf);
          buf = '';
        }
        return;
      }
      emitText(buf.slice(0, open));
      const close = buf.indexOf(']]', open + 2);
      if (close === -1) {
        buf = buf.slice(open);
        if (final || buf.length > 600) buf = ''; // unterminated: drop it
        return;
      }
      const body = buf.slice(open + 2, close);
      buf = buf.slice(close + 2);
      const a = parseActionTag(body);
      if (a && actions.length < MAX_ACTIONS_PER_REPLY + 1) {
        actions.push(a);
        onAction(a);
      }
      // a tag acts as a word boundary
      flushWord();
    }
  };

  return {
    push(chunk) {
      buf += chunk;
      drain(false);
    },
    end() {
      drain(true);
      flushWord();
    },
    get actions() {
      return actions;
    },
    get text() {
      return words.join(' ');
    },
  };
}
