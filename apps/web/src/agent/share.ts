// `#b=<compressed>` permalinks for builds (SPEC §2.6 fallback when KV is
// unavailable or the HTML is small). Uses the native deflate-raw stream;
// encoded as base64url. Prefix "d" marks deflate so the format can evolve.

const toB64Url = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeBuild(html: string): Promise<string> {
  const raw = new TextEncoder().encode(html);
  if (typeof CompressionStream === 'function') {
    return 'd' + toB64Url(await pipe(raw, new CompressionStream('deflate-raw')));
  }
  return 'r' + toB64Url(raw);
}

export async function decodeBuild(code: string): Promise<string | null> {
  try {
    const kind = code[0];
    const bytes = fromB64Url(code.slice(1));
    if (kind === 'd') return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
    if (kind === 'r') return new TextDecoder().decode(bytes);
    return null;
  } catch {
    return null;
  }
}

export async function hashShareUrl(html: string, origin = location.origin): Promise<string> {
  return `${origin}/#b=${await encodeBuild(html)}`;
}

/** Read a shared build from `location.hash`, if any. */
export async function readSharedFromHash(hash = location.hash): Promise<string | null> {
  const m = /^#b=([A-Za-z0-9_-]+)$/.exec(hash);
  return m?.[1] ? decodeBuild(m[1]) : null;
}
