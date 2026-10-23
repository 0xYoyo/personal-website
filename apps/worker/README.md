# yoyo-agent Worker

The mind behind the site: a Cloudflare Worker that streams model replies in Yoyo's agent's voice (Gemini 2.5 Flash by default, or Claude via `PROVIDER=anthropic`; see [Switching the model](#switching-the-model)), builds small HTML apps on request, and stores shared builds.

| Route | What it does |
|---|---|
| `POST /chat` | body `ChatRequest` `{messages:[{role:'visitor'\|'agent', text}], visitor:{name?, returning, device:'desktop'\|'mobile', lang?}}` → SSE `data: {"type":"token","text":"..."}` … `data: {"type":"done"}` |
| `POST /build` | body `BuildRequest` `{instruction, previousHtml?}` → SSE of raw HTML chunks `data: {"type":"chunk","html":"<html…"}` … `data: {"type":"done","bytes":N}` |
| `POST /share` | body `{html}` (≤ 60 kB) → `{id, url}`; stored in KV `SHARES` for 30 days |
| `GET /s/:id` | the shared HTML, under `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:` |
| `GET /health` | `{ok, live, provider, model, time}`; `live` is false until the selected provider's API key is set |

Errors are JSON with a `reason`: `400 bad_request|too_long`, `403 origin`, `413 too_long`, `429 rate|quota` (with `retryAfter` and a `Retry-After` header for `rate`), `502 upstream`, `503 offline` (no API key yet). A stream that fails half way ends with `data: {"type":"error","reason":"upstream"}`. All request and event shapes are the `@yoyo/protocol` types (`packages/protocol`).

The client (`apps/web/src/agent/client/`) treats `429 quota` as "scripted brain for the rest of the day", and any other failure, or no first token within 8 s, as "scripted brain for this turn" (scripted for the session after two failures). So the site keeps working while the Worker is down, unconfigured or over quota.

## Limits

- Per IP (salted SHA-256 hash, never the raw address): chat 20 per 10 minutes, build 5 per hour, share 20 per hour. Token buckets in KV `LIMITS`.
- Global per UTC day: `DAILY_CHAT_CAP` (default 2000), `DAILY_BUILD_CAP` (default 300), `DAILY_SHARE_CAP` (default 1000). Each isolate batches its counter writes (at most one write every 2 s), so the caps are approximate.
- Input: chat message ≤ 600 characters, history trimmed to the last 12 messages, build instruction ≤ 400 characters, `previousHtml` and shared HTML ≤ 60 kB, request body ≤ 80 kB.
- Upstream: if Gemini answers 429 with a per-day quota, the Worker returns `429 {reason:'quota'}`; a per-minute 429 becomes `429 {reason:'rate'}`.

Plan limits to know before you launch:

- **Workers KV on the free plan allows 1,000 writes per day for the whole account.** Every chat or build costs one write (its rate-limit bucket), plus a few counter writes, and every share costs two. That comes to roughly 700–900 chat messages and builds a day on the free plan. Above that, KV writes fail; the limiter then lets requests through (it fails open) and Gemini's own quota becomes the cap. For more traffic, use Workers Paid ($5/month, unlimited KV writes) or lower the daily caps.
- **Gemini free-tier limits are per Google Cloud project and model.** Look them up in Google AI Studio (Dashboard > Rate limits). If the free tier's requests per day are below `DAILY_CHAT_CAP + DAILY_BUILD_CAP`, lower the caps to match, or enable billing on the key.

## Prompts

`prompt/persona.md` and `prompt/facts.md` are the planner's files, copied verbatim; `prompt/runtime.md` (message fencing rules) and `prompt/build.md` (the builder's instructions) belong to this Worker. `npm run gen` assembles them into `src/prompt.generated.ts`, and every `dev`, `test`, `build` and `deploy` runs it first. To change what the agent knows, edit the `.md` files and deploy again.

Chat system prompt = persona.md + facts.md + runtime.md + a visitor-context block. Each visitor message is sent fenced as `<visitor_message>…</visitor_message>`, with fence tags removed and `[[`/`]]` broken up, so visitor text can't add action tags.

## Deploy, step by step

You need Node 22+, a Cloudflare account (the free plan works) and a Google AI Studio API key. Run every command from this folder (`apps/worker/`) unless it says otherwise.

1. **Install dependencies.** From the repo root: `npm install`.

2. **Log in to Cloudflare.**
   ```sh
   npx wrangler login
   ```
   A browser tab opens; approve access. Check it worked with `npx wrangler whoami`.

3. **Create the two KV namespaces.**
   ```sh
   npx wrangler kv namespace create SHARES
   npx wrangler kv namespace create LIMITS
   ```
   Each command prints a block like `{ binding = "SHARES", id = "0f2a…" }`. Copy each `id` into `wrangler.toml`, replacing `REPLACE_WITH_SHARES_NAMESPACE_ID` and `REPLACE_WITH_LIMITS_NAMESPACE_ID`.

4. **Get a Gemini API key.** Go to https://aistudio.google.com/apikey, click "Create API key", and copy it.

5. **Store the key as a secret** (it never goes in a file):
   ```sh
   npx wrangler secret put GEMINI_API_KEY
   ```
   Paste the key when prompted. Optional, but recommended: set a salt for the IP hashes too:
   ```sh
   npx wrangler secret put IP_SALT
   ```
   (Type any long random string.)

6. **Allow your site's origins.** In `wrangler.toml`, set `ALLOWED_ORIGINS` to a comma-separated list of every origin the site is served from, for example:
   ```toml
   ALLOWED_ORIGINS = "https://yoyo.dev,https://www.yoyo.dev,https://*.yoyo-site.pages.dev,http://localhost:*"
   ```
   `*` matches anything except `/`, so `https://*.yoyo-site.pages.dev` covers Pages preview deploys and `http://localhost:*` covers every local port. Requests from other origins, or with no `Origin` header, get `403`.

7. **Deploy.**
   ```sh
   npm run deploy            # or, from the repo root: npm run deploy:worker
   ```
   Wrangler prints the Worker URL, e.g. `https://yoyo-agent.<your-subdomain>.workers.dev`.

8. **Check it.**
   ```sh
   curl https://yoyo-agent.<your-subdomain>.workers.dev/health
   # {"ok":true,"live":true,"model":"gemini-2.5-flash",...}

   curl -N https://yoyo-agent.<your-subdomain>.workers.dev/chat \
     -H 'origin: https://yoyo.dev' -H 'content-type: application/json' \
     -d '{"messages":[{"role":"visitor","text":"who is yoyo?"}],"visitor":{"returning":false,"device":"desktop"}}'
   ```
   Use an origin from step 6. You should see `data: {"type":"token","text":"..."}` lines, then `data: {"type":"done"}`. If `live` is false, the secret from step 5 is missing.

9. **Optional: your own domain.** In `wrangler.toml`, uncomment `routes = [{ pattern = "agent.example.com", custom_domain = true }]`, put in a hostname on a zone you have in Cloudflare, and run `npm run deploy` again.

10. **Point the site at the Worker.** In the site's build environment (for example `apps/web/.env.production`, or the Cloudflare Pages project under Settings > Environment variables), set:
    ```sh
    VITE_AGENT_URL=https://yoyo-agent.<your-subdomain>.workers.dev
    ```
    with no trailing slash, then rebuild and redeploy the site. With `VITE_AGENT_URL` unset or empty, the site runs on the scripted brain only.

11. **Watch it** (optional): `npx wrangler tail` streams live logs, including `gemini failed …` and `limits: kv … failed` warnings.

To change a limit later, edit `[vars]` in `wrangler.toml` and run `npm run deploy`. To use a different model or provider, see [Switching the model](#switching-the-model). `GEMINI_THINKING_BUDGET` defaults to `0` (thinking off, for faster first tokens); set it to `off` to omit `thinkingConfig` entirely.

## Switching the model

Two variables pick the model. Everything else (the SSE the site receives, the prompts, the caps, the per-IP and daily limits, the fence stripping for builds) is the same for both providers.

| Variable | Values | Default |
|---|---|---|
| `PROVIDER` | `gemini` or `anthropic` | `gemini` |
| `MODEL` | any model id of that provider | `gemini-2.5-flash` for Gemini, `claude-sonnet-4-5` for Anthropic |

To switch to Claude:

```sh
npx wrangler secret put ANTHROPIC_API_KEY     # from https://console.anthropic.com/settings/keys
```

then in `wrangler.toml` set `PROVIDER = "anthropic"` (and optionally `MODEL = "claude-haiku-4-5"`), and run `npm run deploy`. `GET /health` shows `"provider":"anthropic","model":"claude-sonnet-4-5"` and `live: true` once the key is set. To switch back, set `PROVIDER = "gemini"` and deploy again. (`GEMINI_MODEL` still works as the Gemini model name when `MODEL` is unset.)

How each is called:

- **Gemini**: `POST https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:streamGenerateContent?alt=sse`, key in `x-goog-api-key`, system prompt in `systemInstruction`, thinking off by default (`GEMINI_THINKING_BUDGET`).
- **Anthropic**: `POST https://api.anthropic.com/v1/messages` with `stream: true`, headers `x-api-key` and `anthropic-version: 2023-06-01`, the system prompt in `system`, the conversation in `messages`; `content_block_delta` text deltas are forwarded as the same `token` / `chunk` events. Chat uses temperature 0.8 and `max_tokens` 512; builds 0.4 and 16,384.
- Upstream `429` → `429 {reason:'rate'}`. Gemini's per-day quota, or Anthropic's "credit balance is too low", → `429 {reason:'quota'}` (the site goes scripted for the day). Anthropic `529 overloaded` and other errors → `502 upstream`.

**Rough cost.** Gemini 2.5 Flash on the free tier costs nothing until its per-day request limit (check AI Studio). Claude has no free tier; Claude Sonnet 4.5 is $3 per million input tokens and $15 per million output tokens (Claude Haiku 4.5: $1 / $5; current prices at https://platform.claude.com/docs/en/about-claude/pricing). The chat system prompt (persona + facts + rules) is about 4–5k tokens, so a chat turn on Sonnet 4.5 is roughly 5k in + 100 out ≈ $0.017, and a build (≈ 1k in + 5–8k out, more with `previousHtml`) roughly $0.08–0.12. At the default daily caps (2,000 chats, 300 builds) the worst case is about $34 + $36 ≈ $70 a day, so lower `DAILY_CHAT_CAP` / `DAILY_BUILD_CAP` to match your budget; at a realistic 200 chats and 20 builds a day it is about $6. Haiku 4.5 is a third of that.

## Local development

- `npm run dev` runs the real Worker locally (`wrangler dev`, port 8787) with local KV. Put `GEMINI_API_KEY=...` in a `.dev.vars` file (git-ignored) to talk to Gemini.
- Most of the time, use the mock instead, which needs no key and no network: from the repo root, `npm run mock` (`tools/mock-worker.mjs`, port 8787) serves the same endpoints with canned replies from the scripted FAQ (`apps/web/src/content/faq.md`) and six prebuilt apps, at realistic speed. The root `npm run dev` starts it for you and points the site at it. To test the fallbacks, use `VITE_AGENT_URL=http://localhost:8787/__fail/<mode>` with `slow`, `down`, `offline`, `quota`, `rate`, `drop` or `empty`.

## Scripts

`npm run typecheck` · `npm run lint` · `npm test` (Vitest: router, limits, SSE framing, fence stripping, with Gemini mocked) · `npm run build` (typecheck + `wrangler deploy --dry-run`) · `npm run deploy`.
