// Types for router-core.mjs (plain JS so tools/live-check.mjs can import it on Node 20 without a build).

export type RouterRole = 'user' | 'model';
export interface Route {
  /** a scripted intent id, `unknown`, or null (play `turns`) */
  intent: string | null;
  turns: string[];
  /** glyph id, one word, or one emoji; null = no become */
  shape: string | null;
  chips: string[];
}
export interface RouterKnown {
  intents: string[];
  glyphs: string[];
}

export const ROUTER_DEFAULT_MODEL: string;
export const ROUTER_TEMPERATURE: number;
export const ROUTER_MAX_OUTPUT_TOKENS: number;
export const ROUTER_LIMITS: {
  turns: number;
  turnWords: number;
  chips: number;
  shapeChars: number;
  historyMessages: number;
  historyChars: number;
  messageChars: number;
};
export const INTENT_DESCRIPTIONS: Record<string, string>;
export const ROUTER_CHIPS: string[];
export const FALLBACK_PERSONA: string;

export function buildRouterSystem(input: { facts: string; persona?: string; intents: { id: string; hints?: string[] }[]; glyphs: string[] }): string;
export function routerIntentEnum(intentIds: string[]): string[];
export function geminiRouterSchema(intentIds: string[]): Record<string, unknown>;
export function jsonRouterSchema(intentIds: string[]): Record<string, unknown>;
export function thinkingFor(model: string): Record<string, unknown> | null;
export function thinkingFallback(current: Record<string, unknown> | null): Record<string, unknown> | null;
export function neutralise(s: string): string;
export function routerUserText(turns: { role: RouterRole; content: string }[]): string;
export function geminiRouterBody(o: {
  model: string;
  system: string;
  userText: string;
  intentIds: string[];
  thinking?: Record<string, unknown> | null;
}): {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: 'user'; parts: { text: string }[] }[];
  generationConfig: Record<string, unknown>;
};
export function geminiText(json: unknown): string;
export function cleanTurn(s: string): string;
export function cutWords(s: string, max?: number): string;
export function clampRoute(raw: unknown, known: RouterKnown): Route;
export function parseRoute(text: string, known: RouterKnown): { ok: true; route: Route } | { ok: false; error: string };
