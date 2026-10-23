// Which model answers: PROVIDER=gemini (default) or PROVIDER=anthropic, plus MODEL.
// Both adapters take the same request and return the same text-delta stream, so the
// router's SSE out, caps and limits are identical whichever provider is selected.

import { ANTHROPIC_DEFAULT_MODEL, streamAnthropic } from './anthropic';
import { streamGemini, type GeminiContent } from './gemini';

export type Provider = 'gemini' | 'anthropic';

export type ModelFailure = { ok: false; status: number; kind: 'quota' | 'rate' | 'upstream'; detail: string };
export type ModelResult = { ok: true; stream: AsyncGenerator<string> } | ModelFailure;

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

export interface ProviderEnv {
  PROVIDER?: string;
  MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_THINKING_BUDGET?: string;
  ANTHROPIC_API_KEY?: string;
}

export function provider(env: ProviderEnv): Provider {
  return env.PROVIDER?.trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'gemini';
}

/** MODEL wins; for Gemini the older GEMINI_MODEL still works. */
export function modelName(env: ProviderEnv): string {
  const m = env.MODEL?.trim();
  if (m) return m;
  return provider(env) === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
}

export function apiKey(env: ProviderEnv): string {
  return (provider(env) === 'anthropic' ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY)?.trim() ?? '';
}

function thinking(env: ProviderEnv): number | null {
  const raw = env.GEMINI_THINKING_BUDGET?.trim();
  if (raw === 'off' || raw === 'none') return null;
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export interface ModelRequest {
  system: string;
  contents: GeminiContent[];
  temperature: number;
  maxOutputTokens: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

export function streamModel(env: ProviderEnv, req: ModelRequest): Promise<ModelResult> {
  const common = { ...req, apiKey: apiKey(env), model: modelName(env) };
  return provider(env) === 'anthropic' ? streamAnthropic(common) : streamGemini({ ...common, thinkingBudget: thinking(env) });
}
