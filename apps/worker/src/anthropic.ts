// Anthropic Messages API streaming client (PROVIDER=anthropic).
// POST https://api.anthropic.com/v1/messages with stream:true; the system prompt goes in
// `system`, the conversation in `messages`. Text arrives as `content_block_delta` events
// with `delta.type === 'text_delta'`; everything else (message_start, ping, …) is skipped.

import type { GeminiContent } from './gemini';
import type { ModelFailure, ModelResult } from './provider';
import { readSseData } from './sse';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-4-5';

export interface AnthropicRequest {
  apiKey: string;
  model: string;
  system: string;
  contents: GeminiContent[];
  temperature: number;
  maxOutputTokens: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

export type AnthropicMessage = { role: 'user' | 'assistant'; content: string };

/** The shared turn format → Anthropic messages: model→assistant, parts joined, same-role turns merged, starts with user. */
export function toAnthropicMessages(contents: GeminiContent[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const c of contents) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const text = c.parts.map((p) => p.text).join('\n');
    if (!text.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += `\n\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0]!.role !== 'user') out.shift();
  return out;
}

export async function streamAnthropic(req: AnthropicRequest): Promise<ModelResult> {
  const res = await req.fetchImpl(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: toAnthropicMessages(req.contents),
      temperature: req.temperature,
      stream: true,
    }),
    signal: req.signal,
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).slice(0, 2000);
    return { ok: false, status: res.status, kind: classifyAnthropicFailure(res.status, detail), detail };
  }
  return { ok: true, stream: anthropicTextDeltas(res.body) };
}

/** 429 → rate (retry soon). No credit / billing → quota (scripted for the day). Anything else (529 overloaded, 5xx, 4xx) → upstream. */
export function classifyAnthropicFailure(status: number, detail: string): ModelFailure['kind'] {
  if (status === 429) return 'rate';
  if ((status === 400 || status === 402 || status === 403) && /credit balance|billing|quota/i.test(detail)) return 'quota';
  return 'upstream';
}

type Event = {
  type?: string;
  delta?: { type?: string; text?: string };
  error?: { type?: string; message?: string };
};

/** Yields the text deltas of a Messages API stream. Throws on an in-stream `error` event. */
export async function* anthropicTextDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of readSseData(body)) {
    let ev: Event;
    try {
      ev = JSON.parse(data) as Event;
    } catch {
      continue;
    }
    if (ev.type === 'error') throw new Error(ev.error?.message ?? ev.error?.type ?? 'upstream error');
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) yield ev.delta.text;
    if (ev.type === 'message_stop') return;
  }
}
