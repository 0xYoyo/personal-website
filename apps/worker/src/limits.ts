// Abuse limits backed by KV.
//
// KV is eventually consistent and allows one write per second per key, so these
// are soft limits: good enough to stop one visitor or a runaway script from
// burning the Gemini quota, not an exact counter. Every KV failure fails open
// (the request goes through) and is logged; the upstream Gemini quota is the
// last line of defence and maps to `429 {reason:'quota'}` as well.

export interface Bucket {
  /** tokens available when full */
  capacity: number;
  /** time to refill from empty to full */
  windowMs: number;
}

export const BUCKETS = {
  chat: { capacity: 20, windowMs: 10 * 60_000 },
  build: { capacity: 5, windowMs: 60 * 60_000 },
  share: { capacity: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, Bucket>;

export type LimitKind = keyof typeof BUCKETS;

type BucketState = { t: number; u: number };

export interface TakeResult {
  ok: boolean;
  /** seconds until one token is available (0 when ok) */
  retryAfter: number;
  /** pending KV write; pass to ctx.waitUntil */
  write?: Promise<unknown>;
}

/** Classic token bucket: refills continuously at capacity/windowMs. */
export async function takeToken(
  kv: KVNamespace,
  key: string,
  bucket: Bucket,
  now: number,
): Promise<TakeResult> {
  let state: BucketState | null = null;
  try {
    state = await kv.get<BucketState>(key, 'json');
  } catch (e) {
    console.warn('limits: kv get failed', key, e);
    return { ok: true, retryAfter: 0 };
  }
  const rate = bucket.capacity / bucket.windowMs; // tokens per ms
  const prev = state && Number.isFinite(state.t) && Number.isFinite(state.u) ? state : { t: bucket.capacity, u: now };
  const tokens = Math.min(bucket.capacity, prev.t + Math.max(0, now - prev.u) * rate);
  if (tokens < 1) {
    return { ok: false, retryAfter: Math.ceil((1 - tokens) / rate / 1000) };
  }
  const next: BucketState = { t: tokens - 1, u: now };
  const ttl = Math.max(60, Math.ceil(bucket.windowMs / 1000) + 60);
  const write = kv.put(key, JSON.stringify(next), { expirationTtl: ttl }).catch((e: unknown) => {
    console.warn('limits: kv put failed', key, e);
  });
  return { ok: true, retryAfter: 0, write };
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/**
 * Global daily counter with write coalescing: each isolate keeps a local view
 * and flushes its pending increments at most once every `flushMs`, which keeps
 * KV writes (1,000/day on the free plan) and same-key writes (1/s) in budget.
 */
export class DailyCounter {
  private cache = new Map<string, { base: number; pending: number; readAt: number; flushAt: number }>();

  constructor(
    private readonly kv: KVNamespace,
    private readonly opts: { refreshMs?: number; flushMs?: number } = {},
  ) {}

  private key(kind: string, now: number) {
    return `day:${kind}:${utcDay(now)}`;
  }

  async count(kind: string, now: number): Promise<number> {
    const key = this.key(kind, now);
    let c = this.cache.get(key);
    const refreshMs = this.opts.refreshMs ?? 5_000;
    if (!c || now - c.readAt > refreshMs) {
      let stored = 0;
      try {
        stored = Number((await this.kv.get(key, 'text')) ?? 0) || 0;
      } catch (e) {
        console.warn('limits: kv get failed', key, e);
        stored = c ? c.base : 0;
      }
      c = { base: Math.max(stored, c?.base ?? 0), pending: c?.pending ?? 0, readAt: now, flushAt: c?.flushAt ?? 0 };
      this.cache.set(key, c);
      for (const k of this.cache.keys()) if (k !== key) this.cache.delete(k); // drop yesterday
    }
    return c.base + c.pending;
  }

  /** Records one use. Returns a write promise when a flush happened (for ctx.waitUntil). */
  add(kind: string, now: number): Promise<unknown> | undefined {
    const key = this.key(kind, now);
    const c = this.cache.get(key) ?? { base: 0, pending: 0, readAt: 0, flushAt: 0 };
    c.pending += 1;
    this.cache.set(key, c);
    const flushMs = this.opts.flushMs ?? 2_000;
    if (now - c.flushAt < flushMs) return undefined;
    const total = c.base + c.pending;
    c.base = total;
    c.pending = 0;
    c.flushAt = now;
    return this.kv.put(key, String(total), { expirationTtl: 2 * 86_400 }).catch((e: unknown) => {
      console.warn('limits: kv put failed', key, e);
    });
  }
}

/** Short, salted hash of the client IP so raw addresses never land in KV. */
export async function ipKey(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * A fixed per-UTC-day allowance for one key (WAVE4 A4: 20 live replies per IP a day). One KV read
 * and one write per allowed use; fails open on KV errors, like the buckets.
 */
export async function takeDaily(kv: KVNamespace, key: string, cap: number, now: number): Promise<TakeResult> {
  const k = `${key}:${utcDay(now)}`;
  let used = 0;
  try {
    used = Number((await kv.get(k, 'text')) ?? 0) || 0;
  } catch (e) {
    console.warn('limits: kv get failed', k, e);
    return { ok: true, retryAfter: 0 };
  }
  if (used >= cap) {
    const midnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((midnight - now) / 1000)) };
  }
  const write = kv.put(k, String(used + 1), { expirationTtl: 2 * 86_400 }).catch((e: unknown) => {
    console.warn('limits: kv put failed', k, e);
  });
  return { ok: true, retryAfter: 0, write };
}

/** In-memory stand-in for a KV binding (local dev without one; WAVE4 A4). Per isolate, so approximate. */
export class MemoryKV {
  private store = new Map<string, { v: string; exp: number | null }>();
  async get(key: string, type?: 'text' | 'json'): Promise<unknown> {
    const e = this.store.get(key);
    if (!e || (e.exp !== null && e.exp <= Date.now())) return null;
    return type === 'json' ? JSON.parse(e.v) : e.v;
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, { v: value, exp: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null });
  }
}
