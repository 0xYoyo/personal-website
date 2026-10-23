// Inline action tags (`[[name:arg]]`, SPEC §3.2 / persona.md) — resolver and a
// streaming parser that copes with tags split across tokens.

import {
  BECOME_TEXT_MAX,
  MOODS,
  PROJECT_IDS,
  STORY_IDS,
  type Action,
  type GlyphId,
  type Mood,
  type ProjectId,
  type ShapeSpec,
  type StoryId,
} from '@yoyo/protocol';

// ---------------------------------------------------------------------------
// Emoji helpers
// ---------------------------------------------------------------------------

const EMOJI_PART = String.raw`(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|\p{Emoji_Modifier}|⃣)`;
const EMOJI_ONLY = new RegExp(`^${EMOJI_PART}+$`, 'u');
const LEADING = new RegExp(`^((?:\\p{Extended_Pictographic}|\\p{Regional_Indicator}|[0-9#*]\\ufe0f?\\u20e3)${EMOJI_PART}*)`, 'u');

export const isEmojiOnly = (s: string): boolean => {
  const t = s.replace(/\s+/g, '');
  return t.length > 0 && EMOJI_ONLY.test(t) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t);
};

/** First emoji cluster at the start of `s` (after whitespace), or null. */
export function leadingEmoji(s: string): string | null {
  const m = LEADING.exec(s.trimStart());
  if (!m?.[1]) return null;
  // Keep a single grapheme where the platform can tell us (e.g. "🚀🚀" → "🚀").
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    for (const g of new Seg(undefined, { granularity: 'grapheme' }).segment(m[1])) return g.segment;
  }
  return m[1];
}

// ---------------------------------------------------------------------------
// Tag → Action
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** glyph ids the swarm can draw; `[[become:x]]` with x in this list becomes a glyph */
  glyphs: readonly GlyphId[];
}

/**
 * `[[become:X]]` → ShapeSpec. Order: `none` → `yoyo` (the procedural 3D letters) →
 * lowercase glyph id the swarm supports → emoji → text (≤ 12 characters, case kept).
 * Glyph matching is case-sensitive on purpose: `[[become:Star]]` spells "Star".
 */
export function shapeFromArg(arg: string, opts: ResolveOptions): ShapeSpec {
  const a = arg.trim();
  if (!a || a === 'none') return { kind: 'none' };
  if (a === 'yoyo' || a === 'yoyo3d') return { kind: 'yoyo3d' };
  if ((opts.glyphs as readonly string[]).includes(a)) return { kind: 'glyph', id: a as GlyphId };
  if (isEmojiOnly(a)) return { kind: 'emoji', emoji: a.replace(/\s+/g, '') };
  return { kind: 'text', text: [...a].slice(0, BECOME_TEXT_MAX).join('').trim() };
}

/** Parses the inside of one tag. Unknown names or invalid args → null (the tag is still stripped). */
export function resolveTag(body: string, opts: ResolveOptions): Action | null {
  const idx = body.indexOf(':');
  const name = (idx === -1 ? body : body.slice(0, idx)).trim().toLowerCase();
  const arg = idx === -1 ? '' : body.slice(idx + 1).trim();
  switch (name) {
    case 'become':
      return arg ? { type: 'become', shape: shapeFromArg(arg, opts) } : null;
    case 'mood':
      return (MOODS as readonly string[]).includes(arg) ? { type: 'mood', mood: arg as Mood } : null;
    case 'show':
      return (PROJECT_IDS as readonly string[]).includes(arg) ? { type: 'show', project: arg as ProjectId } : null;
    case 'play':
      return { type: 'play' };
    case 'story': {
      const id = arg || 'next';
      return id === 'next' || (STORY_IDS as readonly string[]).includes(id) ? { type: 'story', id: id as StoryId | 'next' } : null;
    }
    case 'tour':
      return { type: 'tour' };
    case 'build':
      return arg ? { type: 'build', instruction: arg.slice(0, 400) } : null;
    case 'contact':
      return { type: 'contact' };
    case 'lights':
      return arg === 'dark' || arg === 'light' || arg === 'toggle' ? { type: 'lights', mode: arg } : null;
    case 'chips': {
      const chips = arg.split('|').map((c) => c.trim()).filter(Boolean).slice(0, 5);
      return chips.length ? { type: 'chips', chips } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Streaming parser
// ---------------------------------------------------------------------------

export interface ParseOut {
  /** display text to append (may be empty) */
  text: string;
  /** actions completed by this chunk, in order */
  actions: Action[];
}

export interface TagStream {
  push(chunk: string): ParseOut;
  /** flush at end of reply: drops an unterminated tag, drops trailing whitespace */
  end(): ParseOut;
  /** all display text emitted so far */
  readonly text: string;
}

/** A `[[` with no `]]` within this many characters is treated as literal text. */
const MAX_TAG = 320;

/**
 * Buffers only what might still become a tag (`[`, or `[[…` with no `]]` yet),
 * emits text immediately otherwise, and normalises whitespace around removed
 * tags so "a [[x]] b" reads "a b" and "[[x]] hey" reads "hey".
 */
export function createTagStream(opts: ResolveOptions): TagStream {
  let buf = '';
  let shown = '';
  let heldSpace = false;

  const emitText = (raw: string): string => {
    if (!raw) return '';
    let s = raw.replace(/\s+/g, ' ');
    if (!shown) s = s.replace(/^ +/, '');
    if (!s) return '';
    let out = '';
    if (heldSpace) {
      s = s.replace(/^ +/, '');
      if (!s) return ''; // still only whitespace; keep holding
      if (!/^[.,!?;:)\]]/.test(s)) out += ' ';
      heldSpace = false;
    }
    if (s.endsWith(' ')) {
      s = s.replace(/ +$/, '');
      heldSpace = true;
    }
    out += s;
    shown += out;
    return out;
  };

  const drain = (final: boolean): ParseOut => {
    let text = '';
    const actions: Action[] = [];
    for (;;) {
      const i = buf.indexOf('[[');
      if (i === -1) {
        if (!final && buf.endsWith('[')) {
          text += emitText(buf.slice(0, -1));
          buf = '[';
        } else {
          text += emitText(buf);
          buf = '';
        }
        break;
      }
      text += emitText(buf.slice(0, i));
      buf = buf.slice(i);
      const j = buf.indexOf(']]', 2);
      if (j === -1) {
        if (buf.length > MAX_TAG) {
          // Not a tag after all: release the brackets as text and keep scanning.
          text += emitText('[[');
          buf = buf.slice(2);
          continue;
        }
        if (final) {
          // Unterminated tag at the end of a reply: drop it if it looks like one.
          if (!/^\[\[\s*[a-z]+\s*(?::|$)/i.test(buf)) text += emitText(buf);
          buf = '';
        }
        break;
      }
      const a = resolveTag(buf.slice(2, j), opts);
      if (a) actions.push(a);
      buf = buf.slice(j + 2);
    }
    if (final) heldSpace = false;
    return { text, actions };
  };

  return {
    push(chunk) {
      buf += chunk;
      return drain(false);
    },
    end() {
      return drain(true);
    },
    get text() {
      return shown;
    },
  };
}

/** Non-streaming: strip every tag from a complete string and collect actions. */
export function extractActions(raw: string, opts: ResolveOptions): { text: string; actions: Action[] } {
  const s = createTagStream(opts);
  const a = s.push(raw);
  const b = s.end();
  return { text: a.text + b.text, actions: [...a.actions, ...b.actions] };
}
