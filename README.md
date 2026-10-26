# YOYO v3

The personal site of Yoav "Yoyo" Zrihan. It has one input, an agent that answers as Yoyo in the first person, and a particle swarm that turns into whatever it is talking about. The full brief is the v3 spec (`portfolio-spec/v3/SPEC.md`, kept outside this repo).

```
packages/protocol/   shared types (Action, ShapeSpec, SwarmApi, wire events), guards, the [[tag]] parser
apps/web/            the site: Vite 5 + React 18 + TypeScript strict + zustand
  src/swarm/engine/  the body: three.js WebGPU / WebGL2 (TSL compute) + canvas2d fallback
  src/agent/client/  the mind's client: live SSE, scripted brain, tags, memory, share
  src/agent/         adapter from the client to the shell's Brain (index.ts)
  src/showcases/     the 7 motion showcases (parts/), footage in public/footage
  src/content/       copy, projects, stories, tour, chips, faq.md
  swarm-demo.html    swarm QA page with a debug panel (/swarm-demo.html)
apps/worker/         Cloudflare Worker: /chat, /build (SSE), /share, /s/:id, /health
tools/               mock worker, QA shots + screencasts, OG renderer, content generator
```

## Quick start

```sh
npm install
npm run dev          # mock worker on :8787 + the site on http://127.0.0.1:5173
```

`npm run dev` starts the mock worker (`tools/mock-worker.mjs`) next to Vite, and `apps/web/.env.development` points the site at it. The mock needs no key and no network. It streams canned replies and six prebuilt apps at realistic speed. To try the fallbacks, set `VITE_AGENT_URL=http://127.0.0.1:8787/__fail/<mode>` (`slow`, `down`, `offline`, `quota`, `rate`, `drop`, `empty`). To run the site on the scripted brain only, empty that variable.

| Script | What it does |
|---|---|
| `npm run dev` | mock + site (`dev:web` runs the site alone, `mock` runs the mock alone) |
| `npm run dev:worker` | the real Worker locally (`wrangler dev`, :8787; put `GEMINI_API_KEY` in `apps/worker/.dev.vars`) |
| `npm run build` | protocol typecheck, then web typecheck + `vite build` (→ `apps/web/dist`), then a Worker dry-run |
| `npm run typecheck` / `lint` / `test` | all workspaces (Vitest workspace: protocol, web, worker; plus the mock's `node --test`) |
| `npm run gen` | regenerates `agent/client/faq.ts` + `examples.ts` from `faq.md` / `examples/*.html`, and the Worker's prompt |
| `npm run shots` | Playwright QA → `tools/out/` (see the header of `tools/shots.mjs`) |
| `npm run og` | re-renders `apps/web/public/og.png` and `og-square.png` from the real swarm |
| `npm run deploy:worker` | deploys the Worker |

QA query parameters: `?skipEntry=1`, `?speed=0.2` (scripted timings 5× faster), `?scene=light`, `?tier=0..3` (force a swarm tier, no adaptive drop), `?qa=1` (exposes `window.__yoyo` on a production build).

## Environment

| Variable | Where | Meaning |
|---|---|---|
| `VITE_AGENT_URL` | site build env | Worker URL without a trailing slash. Empty or unset → scripted brain only. `npm run build` takes it from the environment (e.g. `apps/web/.env.production`, or the Pages/Vercel project settings). The dev value lives in `apps/web/.env.development`. |
| `GEMINI_API_KEY` | Worker secret | required for the live brain |
| `IP_SALT` | Worker secret | optional salt for the per-IP limit keys |
| `ALLOWED_ORIGINS`, `DAILY_*_CAP`, `GEMINI_MODEL` | `apps/worker/wrangler.toml` `[vars]` | CORS allowlist, daily caps, model |

## Deploy the Worker

The full step-by-step guide is in `apps/worker/README.md`. In short:

```sh
cd apps/worker
npx wrangler login
npx wrangler kv namespace create SHARES     # copy the ids into wrangler.toml
npx wrangler kv namespace create LIMITS
npx wrangler secret put GEMINI_API_KEY
# set ALLOWED_ORIGINS in wrangler.toml to the site's origin(s)
npm run deploy                              # or from the root: npm run deploy:worker
curl https://yoyo-agent.<you>.workers.dev/health
```

## Deploy the site

The site is static: `apps/web/dist` after `npm run build`.

**Cloudflare Pages**: connect the repo. Build command: `npm run build -w @yoyo/protocol && npm run build -w @yoyo/web`. Output directory: `apps/web/dist`. Environment variables: `VITE_AGENT_URL=https://yoyo-agent.<you>.workers.dev` and `NODE_VERSION=22`. Add the Pages origin (and `https://*.<project>.pages.dev` for previews) to the Worker's `ALLOWED_ORIGINS`.

**Vercel**: import the repo. Root directory: repository root. Build command: as above. Output directory: `apps/web/dist`. Install command: `npm install`. Set `VITE_AGENT_URL` under Project → Settings → Environment Variables, then add the Vercel domain to `ALLOWED_ORIGINS`.

A deploy without `VITE_AGENT_URL` still works on the scripted brain.

## Where to edit what

| What | File |
|---|---|
| The agent's voice and rules (live brain) | `apps/worker/prompt/persona.md` |
| The facts it may state (live brain) | `apps/worker/prompt/facts.md` |
| Builder instructions / message fencing | `apps/worker/prompt/build.md`, `runtime.md` |
| Scripted brain replies (offline / over quota) | `apps/web/src/content/faq.md`, then `npm run gen` |
| Easter eggs (fortnite, cs2, curls, piano) | the last section of `faq.md`, served by `apps/web/src/agent/client/extras.ts` (a test keeps the two equal; mirrored in `persona.md` examples) |
| Example apps the scripted builder streams | `apps/web/src/agent/client/examples/*.html`, then `npm run gen` |
| Projects (cards, facts, links, glyph, showcase) | `apps/web/src/content/projects.ts` |
| The two stories / the tour | `apps/web/src/content/stories.ts` / `tour.ts` |
| UI strings, chips | `apps/web/src/content/copy.ts`, `chips.ts` |
| Swarm glyphs | `apps/web/src/swarm/engine/glyphs/*.svg` (any new file is picked up) |
| Showcases | `apps/web/src/showcases/parts/<project>/` |

After editing the prompts, redeploy the Worker. After editing anything else, rebuild the site.

## Robustness matrix (SPEC §7)

| Condition | Behaviour |
|---|---|
| WebGPU available | 40k particles, bloom |
| WebGL2 only | 20k, bloom off |
| Neither / very weak | 2D canvas, 3k dots, same API, no glow |
| Reduced motion | shapes change instantly; no murmuration; tour/stories step on click only |
| Worker OK | live brain |
| Worker 429 quota / down / slow (>8 s first token) | scripted brain for that turn (and for the session after 2 failures); honest one-liner the first time: `the live brain is resting — I still know everything.` |
| Offline | everything but Build works; Build shows examples |
| Mobile portrait | swarm 12k/6k; agent lines centered 32–40 px; chips scroll horizontally; cards full-bleed; mic works on iOS Safari (SpeechRecognition exists in Safari 17+; else hidden) |
| Returning visitor | name shape + welcome line + last build |

Adaptive quality drops one tier after 20 consecutive frames over 20 ms. The swarm pauses while the tab is hidden and while the game is open.
