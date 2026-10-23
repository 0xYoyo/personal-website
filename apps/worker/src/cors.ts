// CORS allowlist from env ALLOWED_ORIGINS (comma-separated). A `*` matches any
// run of characters except "/", e.g. "http://localhost:*" or "https://*.pages.dev".

export function parseAllowlist(raw: string | undefined): RegExp[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map((p) => new RegExp(`^${p.split('*').map(escapeRe).join('[^/]*')}$`, 'i'));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function isAllowedOrigin(origin: string | null, allow: RegExp[]): origin is string {
  return !!origin && allow.some((re) => re.test(origin));
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}
