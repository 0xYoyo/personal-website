# YOYO v3 — ask his agent

The personal site of Yoav "Yoyo" Zrihan: one input, an agent that answers in
his voice, and a particle body that becomes what it says. The contract is
`SPEC.md` (v3); this repo is the npm-workspaces monorepo that implements it.

```
packages/protocol/   shared types (Action, ShapeSpec, SwarmApi, ids), runtime guards,
                     the inline [[tag]] parser, the Worker wire schema
apps/web/            the site: Vite 5 + React 18 + TypeScript strict + zustand
  src/design/        tokens (dark/light via html[data-scene]), fonts, base
  src/swarm/         the body (stub now: 2D canvas, ~1.5k dots; real engine at integration)
  src/agent/         the mind client (stub now: canned faq.md replies, example build, memory)
  src/state/         zustand store (pure state + transitions)
  src/controller.ts  the only module that drives swarm / brain / sound / voice
  src/ui/            top bar, conversation, command bar, chips, card, build frame,
                     contact, game modal, history, runner (tour + stories), sound, voice
  src/showcases/     showcase registry (placeholders until the showcases part lands)
  src/content/       projects, copy, chips, tour, stories
  public/            CV, favicon, robots.txt, play/prompt-racers.html
apps/worker/         Cloudflare Worker (delivered by the agent part)
tools/               Playwright QA (shots.mjs)
```

## Scripts

```
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # protocol typecheck + web typecheck + vite build
npm run typecheck
npm run lint
npm test           # Vitest
npm run shots      # Playwright screenshots → tools/out/ (desktop 1440×900, mobile 390×844)
```

QA query params: `?skipEntry=1` skips the entry, `?speed=0.2` runs stub timings
5× faster, `?scene=light` starts in the light scene.

## Integration points

- `apps/web/src/swarm/index.ts` exports `createSwarm(canvas): SwarmHandle`
  (may return a Promise). Optional extensions the UI uses when present:
  `playEntry({name?, reducedMotion})`, `setStage(rect)`.
- `apps/web/src/agent/index.ts` exports `createBrain(opts): Brain` (see `agent/types.ts`).
- `apps/web/src/showcases/index.ts` maps each project id to a component
  `({ project, reducedMotion }) => JSX` that fills its slot.
