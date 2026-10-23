// @yoyo/protocol — the shared contract between the site (apps/web), the
// Worker (apps/worker) and every part (swarm, agent, showcases, glyphs).
// The type block below is published exactly as in the Phase 1 common brief.
// Everything after it is additive: id lists, runtime guards (no Zod), the
// inline action-tag parser, and the wire schema for /chat and /build.

export type ProjectId = 'prompt-racers'|'unfiltered'|'yoyo-loop'|'runi-connector'|'availability-monitor'|'pnl-bot'|'polybot';
export type GlyphId = 'kart'|'magnifier'|'loop'|'cap'|'tent'|'chart'|'diverge'|'envelope'|'envelope-open'|'keyboard'|'cursor'|'wave'|'frame'|'question'|'shield'|'route'|'btc'|'piano'|'ramp'|'curls'|'heart'|'star'|'check'|'yoyo';
export type Mood = 'idle'|'listening'|'thinking'|'speaking'|'excited'|'building'|'celebrate'|'asleep';
export type ShapeSpec = { kind:'text'; text:string } | { kind:'emoji'; emoji:string } | { kind:'glyph'; id:GlyphId } | { kind:'yoyo3d' } | { kind:'frame'; rect:{x:number;y:number;w:number;h:number} } | { kind:'none' };
export type StoryId = 'appeal'|'2021'|'odin'|'road'|'this';
export type Action =
  | { type:'become'; shape:ShapeSpec } | { type:'mood'; mood:Mood } | { type:'show'; project:ProjectId }
  | { type:'play' } | { type:'story'; id:StoryId|'next' } | { type:'tour' } | { type:'build'; instruction:string }
  | { type:'contact' } | { type:'lights'; mode:'dark'|'light'|'toggle' } | { type:'chips'; chips:string[] };
export interface SwarmApi {
  become(shape: ShapeSpec, opts?: { hold?: number; depth?: number }): void;
  release(): void;
  mood(m: Mood): void;
  buildFrame(rect: {x:number;y:number;w:number;h:number}, progress: number): void; // progress 0..1
  pointer(x: number, y: number, vx: number, vy: number): void; // CSS px, viewport
  setScene(mode: 'dark'|'light'): void;
  setQuality(tier: 0|1|2|3): void; // 0 = 2D fallback … 3 = max
  setListeningLevel(level01: number): void;
  pulse(strength01?: number): void; // one-shot brightness pulse (per streamed word)
  screenshot(): Promise<Blob>;
  stats(): { fps:number; count:number; tier:number; backend:'webgpu'|'webgl2'|'canvas2d' };
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Additive: optional engine extension. The UI calls it when present.
// ---------------------------------------------------------------------------

/** An engine may expose its own cinematic entry (pour-in → YOYO → release). */
export interface SwarmEntry {
  /** Resolves when the swarm has released into idle. `name` replaces YOYO for returning visitors. */
  playEntry(opts?: { name?: string; reducedMotion?: boolean }): Promise<void>;
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * An engine may accept the free "stage" area (CSS px, viewport) where shapes should
 * form so they never sit under the agent's words. The UI calls it on layout changes.
 * Engines without it place shapes wherever they like.
 */
export interface SwarmStage {
  setStage(rect: Rect): void;
}

/** What the UI holds: the required API plus the optional extensions. */
export type SwarmHandle = SwarmApi & Partial<SwarmEntry> & Partial<SwarmStage>;

// ---------------------------------------------------------------------------
// Id lists (the single source the guards and pickers use)
// ---------------------------------------------------------------------------

export const PROJECT_IDS = [
  'prompt-racers', 'unfiltered', 'yoyo-loop', 'runi-connector', 'availability-monitor', 'pnl-bot', 'polybot',
] as const satisfies readonly ProjectId[];

export const GLYPH_IDS = [
  'kart', 'magnifier', 'loop', 'cap', 'tent', 'chart', 'diverge', 'envelope', 'envelope-open', 'keyboard',
  'cursor', 'wave', 'frame', 'question', 'shield', 'route', 'btc', 'piano', 'ramp', 'curls', 'heart', 'star',
  'check', 'yoyo',
] as const satisfies readonly GlyphId[];

export const MOODS = [
  'idle', 'listening', 'thinking', 'speaking', 'excited', 'building', 'celebrate', 'asleep',
] as const satisfies readonly Mood[];

export const STORY_IDS = ['appeal', '2021', 'odin', 'road', 'this'] as const satisfies readonly StoryId[];

/** Max characters for a `[[become:text]]` (persona.md). */
export const BECOME_TEXT_MAX = 12;
/** Max actions the client honours per reply (persona.md asks the model for ≤ 2; the client allows a little slack for chips). */
export const MAX_ACTIONS_PER_REPLY = 3;

// ---------------------------------------------------------------------------
// Runtime guards
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const isProjectId = (v: unknown): v is ProjectId =>
  typeof v === 'string' && (PROJECT_IDS as readonly string[]).includes(v);
export const isGlyphId = (v: unknown): v is GlyphId =>
  typeof v === 'string' && (GLYPH_IDS as readonly string[]).includes(v);
export const isMood = (v: unknown): v is Mood => typeof v === 'string' && (MOODS as readonly string[]).includes(v);
export const isStoryId = (v: unknown): v is StoryId =>
  typeof v === 'string' && (STORY_IDS as readonly string[]).includes(v);

export const isRect = (v: unknown): v is Rect =>
  isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h) && v.w >= 0 && v.h >= 0;

export function isShapeSpec(v: unknown): v is ShapeSpec {
  if (!isObj(v)) return false;
  switch (v.kind) {
    case 'text': return typeof v.text === 'string' && v.text.length > 0;
    case 'emoji': return typeof v.emoji === 'string' && v.emoji.length > 0;
    case 'glyph': return isGlyphId(v.id);
    case 'yoyo3d': case 'none': return true;
    case 'frame': return isRect(v.rect);
    default: return false;
  }
}

export function isAction(v: unknown): v is Action {
  if (!isObj(v)) return false;
  switch (v.type) {
    case 'become': return isShapeSpec(v.shape);
    case 'mood': return isMood(v.mood);
    case 'show': return isProjectId(v.project);
    case 'play': case 'tour': case 'contact': return true;
    case 'story': return v.id === 'next' || isStoryId(v.id);
    case 'build': return typeof v.instruction === 'string' && v.instruction.trim().length > 0;
    case 'lights': return v.mode === 'dark' || v.mode === 'light' || v.mode === 'toggle';
    case 'chips': return Array.isArray(v.chips) && v.chips.every((c) => typeof c === 'string');
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Emoji detection + become-argument resolution
// ---------------------------------------------------------------------------

/** Extended pictographic run (covers ZWJ sequences, flags and variation selectors). */
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|\p{Emoji_Modifier}|⃣)+$/u;
const LEADING_EMOJI_RE = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:‍|️|\p{Emoji_Modifier}|⃣|\p{Extended_Pictographic}|\p{Regional_Indicator})*)/u;

export const isEmojiOnly = (s: string): boolean => EMOJI_RE.test(s.trim()) && s.trim().length > 0;

/** The first emoji cluster at the start of `s`, if any. */
export function leadingEmoji(s: string): string | null {
  const m = LEADING_EMOJI_RE.exec(s.trim());
  return m ? m[1] ?? null : null;
}

/** `[[become:X]]` argument → ShapeSpec: glyph id, then emoji, then text (truncated to 12 chars). */
export function shapeFromArg(arg: string): ShapeSpec {
  const a = arg.trim();
  if (!a || a === 'none') return { kind: 'none' };
  if (a === 'yoyo' || a === 'yoyo3d') return { kind: 'yoyo3d' };
  if (isGlyphId(a)) return { kind: 'glyph', id: a };
  if (isEmojiOnly(a)) return { kind: 'emoji', emoji: a };
  return { kind: 'text', text: [...a].slice(0, BECOME_TEXT_MAX).join('') };
}

// ---------------------------------------------------------------------------
// Inline action tags: `[[name:arg]]` (SPEC §3.2). Parse one tag body.
// ---------------------------------------------------------------------------

/** Parse the inside of one `[[...]]` tag. Returns null when the tag is not on the allowlist. */
export function parseActionTag(body: string): Action | null {
  const idx = body.indexOf(':');
  const name = (idx === -1 ? body : body.slice(0, idx)).trim().toLowerCase();
  const arg = idx === -1 ? '' : body.slice(idx + 1).trim();
  let a: Action | null = null;
  switch (name) {
    case 'become': a = arg ? { type: 'become', shape: shapeFromArg(arg) } : null; break;
    case 'mood': a = isMood(arg) ? { type: 'mood', mood: arg } : null; break;
    case 'show': a = isProjectId(arg) ? { type: 'show', project: arg } : null; break;
    case 'play': a = { type: 'play' }; break;
    case 'story': {
      const id = arg || 'next';
      a = id === 'next' || isStoryId(id) ? { type: 'story', id } : null;
      break;
    }
    case 'tour': a = { type: 'tour' }; break;
    case 'build': a = arg ? { type: 'build', instruction: arg.slice(0, 400) } : null; break;
    case 'contact': a = { type: 'contact' }; break;
    case 'lights': a = arg === 'dark' || arg === 'light' || arg === 'toggle' ? { type: 'lights', mode: arg } : null; break;
    case 'chips': {
      const chips = arg.split('|').map((c) => c.trim()).filter(Boolean).slice(0, 5);
      a = chips.length ? { type: 'chips', chips } : null;
      break;
    }
    default: a = null;
  }
  return a && isAction(a) ? a : null;
}

/** Strip every `[[...]]` from a complete string and collect allowlisted actions. */
export function extractActions(text: string): { text: string; actions: Action[] } {
  const actions: Action[] = [];
  const clean = text.replace(/\[\[([^\]]*)\]\]/g, (_m, body: string) => {
    const a = parseActionTag(body);
    if (a) actions.push(a);
    return '';
  });
  return { text: clean.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim(), actions };
}

// ---------------------------------------------------------------------------
// Wire schema (Worker ⇄ client). SSE event payloads are JSON in `data:`.
// ---------------------------------------------------------------------------

export type Role = 'visitor' | 'agent';
export interface ChatMessage { role: Role; text: string }
export interface VisitorInfo { name?: string; returning: boolean; device: 'desktop' | 'mobile' }

export interface ChatRequest { messages: ChatMessage[]; visitor: VisitorInfo; mode?: 'live' | 'scripted' }
export interface BuildRequest { instruction: string; previousHtml?: string }
export interface ShareRequest { html: string }
export interface ShareResponse { id: string }

/** `/chat` SSE: `token` events carry raw model text (tags included); then `done`. */
export type ChatEvent = { type: 'token'; text: string } | { type: 'done' } | { type: 'error'; reason: ErrorReason };
/** `/build` SSE: `chunk` events carry HTML; `done` carries the final byte count. */
export type BuildEvent = { type: 'chunk'; html: string } | { type: 'done'; bytes: number } | { type: 'error'; reason: ErrorReason };
export type ErrorReason = 'quota' | 'rate' | 'too_long' | 'upstream' | 'timeout' | 'offline';

export function isChatEvent(v: unknown): v is ChatEvent {
  if (!isObj(v)) return false;
  return (v.type === 'token' && typeof v.text === 'string') || v.type === 'done' || (v.type === 'error' && typeof v.reason === 'string');
}
export function isBuildEvent(v: unknown): v is BuildEvent {
  if (!isObj(v)) return false;
  return (v.type === 'chunk' && typeof v.html === 'string') || (v.type === 'done' && isNum(v.bytes)) || (v.type === 'error' && typeof v.reason === 'string');
}

/** Limits shared by the Worker and the client UI copy. */
export const LIMITS = {
  chatPerTenMinutes: 20,
  buildsPerHour: 5,
  maxInputChars: 600,
  maxShareBytes: 60_000,
  inlineShareBytes: 8_000,
} as const;
