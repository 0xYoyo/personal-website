// Gemini (Generative Language API) streaming client.
// POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse

import { readSseData } from './sse';

export type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] };

export interface GeminiRequest {
  apiKey: string;
  model: string;
  system: string;
  contents: GeminiContent[];
  temperature: number;
  maxOutputTokens: number;
  /** 0 turns thinking off on 2.5 Flash (lower latency). `null` omits thinkingConfig entirely. */
  thinkingBudget: number | null;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
}

export type GeminiFailure = { ok: false; status: number; kind: 'quota' | 'rate' | 'upstream'; detail: string };
export type GeminiResult = { ok: true; stream: AsyncGenerator<string> } | GeminiFailure;

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function streamGemini(req: GeminiRequest): Promise<GeminiResult> {
  let res = await call(req, req.thinkingBudget);
  if (res.status === 400 && req.thinkingBudget !== null) {
    // Some model versions reject thinkingConfig; retry once without it.
    const text = await res.clone().text().catch(() => '');
    if (/thinking/i.test(text)) res = await call(req, null);
  }
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => '')).slice(0, 2000);
    return { ok: false, status: res.status, kind: classifyFailure(res.status, detail), detail };
  }
  return { ok: true, stream: textDeltas(res.body) };
}

function call(req: GeminiRequest, thinkingBudget: number | null): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    temperature: req.temperature,
    maxOutputTokens: req.maxOutputTokens,
  };
  if (thinkingBudget !== null) generationConfig.thinkingConfig = { thinkingBudget };
  const body = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.contents,
    generationConfig,
  };
  return req.fetchImpl(`${GEMINI_BASE}/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': req.apiKey },
    body: JSON.stringify(body),
    signal: req.signal,
  });
}

/** Upstream 429s that mention a per-day quota mean "scripted for the day"; per-minute ones are just "rate". */
export function classifyFailure(status: number, detail: string): GeminiFailure['kind'] {
  if (status === 429) return /PerDay|per day|daily/i.test(detail) ? 'quota' : 'rate';
  if (status === 403 && /quota|billing/i.test(detail)) return 'quota';
  return 'upstream';
}

type Chunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  error?: { message?: string };
};

/** Yields text deltas from the SSE body, skipping thought parts. Throws on an in-stream error object. */
export async function* textDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of readSseData(body)) {
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      continue;
    }
    if (chunk.error) throw new Error(chunk.error.message ?? 'upstream error');
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (p.thought) continue;
      if (typeof p.text === 'string' && p.text) yield p.text;
    }
  }
}
