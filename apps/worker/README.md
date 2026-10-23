# apps/worker

Placeholder. The agent builder delivers the real Cloudflare Worker here
(`/chat` SSE, `/build` SSE, `/share` KV, `/s/:id`, `/health`, limits), per
SPEC §3.2. It must speak the wire schema in `packages/protocol`
(`ChatRequest`, `ChatEvent`, `BuildRequest`, `BuildEvent`, `ShareRequest`,
`ShareResponse`, `LIMITS`) and emit only the allowlisted inline action tags
that `parseActionTag` accepts.

Until then the site runs on the stub brain in `apps/web/src/agent/stub.ts`,
which needs no network.
