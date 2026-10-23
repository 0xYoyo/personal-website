// Live path: POST to the Worker and stream SSE, with a first-token deadline,
// fast retries inside that deadline, and an idle timeout once streaming.

import { parseWire, readSse } from './sse';
import { sleep } from './timing';

export type LiveFailure = 'quota' | 'rate' | 'timeout' | 'network' | 'upstream' | 'offline' | 'too_long' | 'empty' | 'aborted';

export type LiveOutcome =
  | { ok: true; raw: string }
  | { ok: false; reason: LiveFailure; /** true when some text already streamed */ partial: boolean; raw: string };

export interface LiveRequest {
  url: string;
  body: unknown;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  /** total budget from the call until the first token (all attempts included) */
  firstTokenMs: number;
  /** extra attempts after the first, for fast failures (network error, 5xx) */
  retries: number;
  /** max silence between chunks once streaming */
  idleMs: number;
  onText(text: string): void;
  /** the Worker accepted the request (200 with a body); called at most once, before any text */
  onOpen?(): void;
  now?: () => number;
}

const BACKOFF_MS = [250, 750, 1500];

export async function streamLive(req: LiveRequest): Promise<LiveOutcome> {
  const now = req.now ?? Date.now;
  const deadline = now() + req.firstTokenMs;
  let lastReason: LiveFailure = 'network';
  let opened = false;

  for (let attempt = 0; attempt <= req.retries; attempt++) {
    if (req.signal.aborted) return fail('aborted');
    if (attempt > 0) {
      const wait = Math.min(BACKOFF_MS[attempt - 1] ?? 1500, deadline - now() - 50);
      if (wait > 0) {
        try {
          await sleep(wait, req.signal);
        } catch {
          return fail('aborted');
        }
      }
    }
    const remaining = deadline - now();
    if (remaining <= 0) return fail('timeout');

    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    req.signal.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, remaining);
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, ms);
    };
    let raw = '';
    let got = false;
    try {
      const res = await req.fetchImpl(req.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: ctrl.signal,
      });
      if (res.status === 429) {
        const j = (await res.json().catch(() => ({}))) as { reason?: string };
        return fail(j.reason === 'quota' ? 'quota' : 'rate');
      }
      if (res.status === 400 || res.status === 413) return fail('too_long');
      if (res.status === 503) {
        lastReason = 'offline';
        continue;
      }
      if (!res.ok || !res.body) {
        lastReason = 'upstream';
        continue;
      }
      if (!opened) {
        opened = true;
        req.onOpen?.();
      }
      for await (const data of readSse(res.body, ctrl.signal)) {
        const ev = parseWire(data);
        if (!ev) continue;
        if (ev.kind === 'text') {
          if (!ev.text) continue;
          got = true;
          arm(req.idleMs);
          raw += ev.text;
          req.onText(ev.text);
        } else if (ev.kind === 'error') {
          if (got) return fail('upstream', raw);
          lastReason = 'upstream';
          throw new Error('retry');
        } else {
          break;
        }
      }
      if (req.signal.aborted) return fail('aborted', raw);
      if (timedOut) return got ? fail('timeout', raw) : fail('timeout');
      if (!got) return fail('empty');
      return { ok: true, raw };
    } catch {
      if (req.signal.aborted) return fail('aborted', raw);
      if (got) return fail(timedOut ? 'timeout' : 'upstream', raw);
      if (timedOut) return fail('timeout');
      if (lastReason !== 'upstream' && lastReason !== 'offline') lastReason = 'network';
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener('abort', onAbort);
    }
  }
  return fail(lastReason);
}

const fail = (reason: LiveFailure, raw = ''): LiveOutcome => ({ ok: false, reason, partial: raw.length > 0, raw });
