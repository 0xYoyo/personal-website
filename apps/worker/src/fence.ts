// Streaming cleanup for /build output: drop a leading ``` fence (and any chatter
// before it), drop a trailing ``` fence, and stop at </html>.

const HEAD_MAX = 400;
const TAIL_HOLD = 12;

export interface FenceStripper {
  push(chunk: string): string;
  end(): string;
}

export function createFenceStripper(): FenceStripper {
  let head = '';
  let headDone = false;
  let tail = '';
  let closed = false;

  const body = (data: string): string => {
    if (closed) return '';
    const s = tail + data;
    const m = /<\/html\s*>/i.exec(s);
    if (m) {
      closed = true;
      tail = '';
      return s.slice(0, m.index + m[0].length);
    }
    if (s.length <= TAIL_HOLD) {
      tail = s;
      return '';
    }
    tail = s.slice(-TAIL_HOLD);
    return s.slice(0, -TAIL_HOLD);
  };

  const resolveHead = (final: boolean): string | null => {
    const trimmed = head.replace(/^\s+/, '');
    if (!trimmed) return final ? '' : null;
    if (trimmed.startsWith('<')) return trimmed; // raw HTML, no fence
    const fence = /```[\w-]*[^\S\n]*\n?/.exec(head);
    if (fence) {
      // Need the full fence line before deciding (``` + language + newline).
      if (!final && fence.index + fence[0].length >= head.length && !fence[0].endsWith('\n')) return null;
      return head.slice(fence.index + fence[0].length);
    }
    const lt = head.indexOf('<');
    if (lt !== -1 && /^<(!doctype|html|head|body|meta|style|div|main|section|svg|script)/i.test(head.slice(lt))) {
      return head.slice(lt); // chatter before the document
    }
    if (final || head.length >= HEAD_MAX) return head;
    return null;
  };

  return {
    push(chunk) {
      if (headDone) return body(chunk);
      head += chunk;
      const rest = resolveHead(false);
      if (rest === null) return '';
      headDone = true;
      return body(rest);
    },
    end() {
      let out = '';
      if (!headDone) {
        headDone = true;
        out += body(resolveHead(true) ?? '');
      }
      if (closed) return out;
      const rest = tail.replace(/\s*```\s*$/, '');
      tail = '';
      closed = true;
      return out + rest;
    },
  };
}

/** Non-streaming variant (also used by the client for defence in depth). */
export function stripFences(html: string): string {
  const s = createFenceStripper();
  return s.push(html) + s.end();
}
