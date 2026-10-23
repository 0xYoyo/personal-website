// Share a build: a Worker KV permalink when possible, else a `#b=<lz-string>` URL
// that the site decodes itself (works offline and for small pages).

import LZString from 'lz-string';

export const INLINE_SHARE_BYTES = 8_000;
export const MAX_SHARE_BYTES = 60_000;

export interface ShareResult {
  url: string;
  kind: 'kv' | 'hash';
  id?: string;
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length;

export function hashUrl(html: string, siteUrl: string): string {
  const base = siteUrl.replace(/#.*$/, '');
  return `${base}#b=${LZString.compressToEncodedURIComponent(html)}`;
}

/** Reads a `#b=` share from a location hash (with or without the leading `#`). Returns null when absent or corrupt. */
export function decodeShareHash(hash: string): string | null {
  const m = /(?:^#?|&)b=([^&]+)/.exec(hash);
  if (!m?.[1]) return null;
  try {
    const html = LZString.decompressFromEncodedURIComponent(m[1]);
    return html && html.length ? html : null;
  } catch {
    return null;
  }
}

export async function shareHtml(opts: {
  html: string;
  agentUrl: string | null;
  siteUrl: string;
  fetchImpl: typeof fetch;
  live: boolean;
  timeoutMs?: number;
}): Promise<ShareResult> {
  const bytes = byteLength(opts.html);
  const useKv = opts.live && !!opts.agentUrl && bytes >= INLINE_SHARE_BYTES && bytes <= MAX_SHARE_BYTES;
  if (useKv) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8_000);
    try {
      const res = await opts.fetchImpl(`${opts.agentUrl}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html: opts.html }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const j = (await res.json()) as { id?: string; url?: string };
        if (j.id && /^[A-Za-z0-9]+$/.test(j.id)) {
          return { url: j.url ?? `${opts.agentUrl}/s/${j.id}`, kind: 'kv', id: j.id };
        }
      }
    } catch {
      /* fall through to the hash URL */
    } finally {
      clearTimeout(t);
    }
  }
  return { url: hashUrl(opts.html, opts.siteUrl), kind: 'hash' };
}
