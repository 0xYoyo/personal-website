# 0xYoyo portfolio

Yoav "Yoyo" Zrihan's portfolio. The page is a running software factory: when you arrive it is unbuilt, agents build each section as a pull request in front of you (diff, checks, review), and you press **Merge**. The code you just watched becomes the section you read. The lights come up as the page assembles.

Vite 5, React 18, TypeScript (strict), zustand, motion. Single page, static build.

## Run it

```sh
npm install          # PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if you already have Chromium
npm run dev          # http://localhost:5173
npm run build        # dist/
npm run preview      # serve dist/
```

Checks (all run in CI before a deploy):

```sh
npm run typecheck
npm run lint
npm test             # Vitest: factory store, scheduler, scroll rule, stats, time
npm run contrast     # WCAG contrast of the palette at every build step
npm run shots        # Playwright screenshots into shots/ (see below)
```

Useful URLs:

- `/?skip=1` lands on the finished page (same as "Skip the show").
- `/?autopilot=1` starts the show with Autopilot on, so every PR merges itself 1.2 s after review. Useful for screen recordings. It plays even for a returning visitor; `?skip=1` and reduced motion still win.
- Press `m` to merge the PR that is waiting on you (logged as `merged #N by you (keyboard)`). The control room's Merge button shows the key.
- A returning visitor (`localStorage["yoyo.seen"] = "1"`) also starts finished, with "Replay the build" in the top bar. Clear it to see the show again.
- `prefers-reduced-motion: reduce` always starts finished, with no animation.

## Where to edit copy

All copy and facts live in two folders. Components read from them; you should not need to touch a component to change wording.

| File | What it holds |
|---|---|
| `src/content/profile.ts` | Name, handle, email, links, one-liner, the hire-me mailto, and `BUILT_BY_AGENTS` / `REVIEW_ROUNDS` for the footer |
| `src/content/headings.ts` | Each section's visible h2 (≤ 32 characters; they fly in from the PR card) |
| `src/content/reviewNotes.ts` | The "1 note" in each PR's review verdict. Written copy, labelled as such |
| `src/content/projects.ts`, `early.ts`, `gitlog.ts` | Section content |
| `src/sections/<id>/spec.ts` | The acceptance criteria and non-goals shown in each PR's Spec tab |
| `src/data/*.json` | Baked GitHub data (commits, PRs, repos). `src/data/stats.ts` derives every number from it |

Numbers on the site come from `src/data/stats.ts`, which computes them from the JSON. `src/data/__tests__/stats.test.ts` pins the verified values (1,405 commits, 61 repos, the 44-PR / 18-issue burst), so re-baking the data and forgetting to update copy fails the tests.

## How the factory works

Everything is in `src/factory/`.

- **`store.ts`** is a zustand store holding one state machine per section: `queued → building → ci → review → awaiting-merge → merged`. It also keeps the event log (timestamps relative to loop start), the mode (manual or autopilot), merge counters, sound, the end card, and `--progress`. `selectProgress` counts merged PRs after #1 (the hero is merged at t=0), so progress is 0 on arrival and 1 when #8 merges.
- **`scheduler.ts`** drives the store with timers and nothing else. Build time is the length of the diff stream (~1,400 chars/s, clamped to 1.6–2.4 s), CI 0.9 s (three checks in sequence), review 0.8 s. One PR is in flight until the visitor's first merge, then two. Autopilot merges 1.2 s after review. Mobile runs everything at ×0.6. It never reads the clock itself, so the tests drive it with fake timers.
- **`useAutoMergeOnScroll.ts`** is the "never block" rule: scroll past an unmerged slot and the loop merges it (awaiting PRs at once, others fast-forwarded within 400 ms).
- **`sound.ts`** synthesizes the merge click with Web Audio. Off by default; the toggle is in the control room.
- **`ui/`** holds the top bar, control room, PR card, diff stream (with a small tokenizer for syntax color), the Merge button (the only amber element on the page), slots, the section frame (title FLIP and ink wipe), the command palette (⌘K, Ctrl+K or `/`), the end card and the game modal.

The palette lives in `src/design/tokens.css`. Every page color is a `color-mix()` between an ink set and a paper set driven by `--progress` on `<html>`; one 900 ms transition on `--progress` moves the whole page. `scripts/palette.mjs` mirrors the formulas and `npm run contrast` checks every step stays at or above 4.5:1. Change both together.

Truthfulness: the log only records what happened in this browser. "CI" is the site's own checks, which ran at build time; the expanded log says so in its first line.

## Add a section

1. Create `src/sections/<id>/` with:
   - `Component.tsx`: default export, no props, **no h2** (SectionFrame renders it).
   - `source.ts`: `import raw from './Component.tsx?raw'` and export `excerpt(raw, 70)`; this streams in the PR diff.
   - `spec.ts`: `{ acceptance: string[]; nonGoals: string[] }`.
   - `index.ts`: export a `SectionModule` (see `src/factory/types.ts`) with its PR number, conventional-commit title, branch and slot `minHeight`.
2. Add the id to the `SectionModule['id']` union in `src/factory/types.ts`, a heading in `src/content/headings.ts` and a note in `src/content/reviewNotes.ts`.
3. Add the module to `src/sections/registry.ts` in page order. PR numbers follow that order.

## Screenshots

`npm run shots` builds, starts `vite preview` and saves PNGs for 390×844, 768×1024 and 1440×900 to `shots/`: the fresh page with #2 waiting (`*-fresh-fold`, `*-fresh-full`), right after the first merge (`*-merged-1`), and the finished page (`*-skip-fold`, `*-skip-full`). It uses the Chromium in `/opt/pw-browsers` by default; set `PLAYWRIGHT_BROWSERS_PATH` to use another. `npm run shots -- --no-build` reuses `dist/`.

## Deploy

The build is static: `npm run build` writes `dist/`, one page, no server. Any of the three hosts below works; Cloudflare Pages is the recommended one (free, unlimited bandwidth, and it reads `public/_headers` for caching).

Every host uses the same settings:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 20 or newer (`.nvmrc` pins 22; `package.json` `engines` says `>=20`) |
| Install command | `npm ci` (the default on all three) |

### The site URL (decide this first)

Canonical, `og:url`, `og:image`, `twitter:image`, the JSON-LD `Person`, `robots.txt` and `sitemap.xml` all need an absolute URL. They all read one value, `VITE_SITE_URL`, the page's public URL **with a trailing slash**.

- `.env` leaves it **empty**: no domain has been chosen yet. Once the domain exists, set `VITE_SITE_URL` to the real URL **with a trailing slash** (e.g. `https://example.com/`), in `.env` or in the host's environment variables, and redeploy.
- A host environment variable named `VITE_SITE_URL` overrides `.env` (Vite gives the process environment priority), so you can leave `.env` alone and set the real value in the host's settings.
- While it is empty the build still passes: `index.html` has no canonical link and no `og:url`, `og:image`/`twitter:image` are root-relative (`/og.png`), `robots.txt` has no `Sitemap:` line, no `sitemap.xml` is written, and "Copy link" / "Share on X" use the address the page was opened at. (Social scrapers want an absolute `og:image`, so link previews only get the card once the URL is set.)
- `npm run build` fails if a non-empty value is not an absolute URL ending in `/`, or if any `%VITE_…%` placeholder is left in `dist/index.html` (`scripts/seo.mjs`, run as `postbuild`).
- With a URL set, `scripts/seo.mjs` writes `dist/robots.txt` (with the `Sitemap:` line) and `dist/sitemap.xml` (the single page URL). `public/robots.txt` is only what `npm run dev` serves.

`VITE_BASE` is the other variable: the path the site lives under. Leave it unset (`/`) everywhere except GitHub project pages. Asset links in code go through `import.meta.env.BASE_URL`; Vite rewrites the links in `index.html`.

### Cloudflare Pages (recommended)

1. Push the repo to GitHub.
2. Go to dash.cloudflare.com, sign in (a free account is enough).
3. In the left sidebar open **Workers & Pages**, click **Create**, choose the **Pages** tab, then **Connect to Git**.
4. Authorize the Cloudflare GitHub app for the repo, select it, click **Begin setup**.
5. Fill in **Set up builds and deployments**:
   - Project name: anything; it becomes `<name>.pages.dev`.
   - Production branch: `main`.
   - Framework preset: `None` (or `Vite`; both give the same values below).
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty.
6. Open **Environment variables (advanced)** and add:
   - `VITE_SITE_URL` = `https://<name>.pages.dev/` (or your custom domain, with the trailing slash).
   - `NODE_VERSION` = `22` (optional; Cloudflare also reads `.nvmrc`).
   - Do not set `VITE_BASE`.
7. Click **Save and Deploy**. The first build takes about a minute. Every push to `main` deploys; other branches get preview URLs.
8. Custom domain (optional): project, **Custom domains**, **Set up a custom domain**, enter it, follow the DNS step (automatic if the domain is on Cloudflare, a CNAME to `<name>.pages.dev` otherwise). Then change `VITE_SITE_URL` in **Settings → Environment variables** to the new domain and redeploy (**Deployments**, latest, **Retry deployment**).
9. Check: open `https://<your-url>/og.png`, `/robots.txt` and `/sitemap.xml`; in DevTools → Network, files under `/assets/` should return `cache-control: public, max-age=31536000, immutable`.

`public/_headers` (copied into `dist/`) sets: `/assets/*` immutable for a year (Vite hashes those names), `/play/*` (the unhashed 1.4 MB game) one day then revalidate, the social cards and icons one day, the CV one hour, plus `nosniff`, a referrer policy and a permissions policy on every path. Cloudflare joins duplicate headers from overlapping rules, so `Cache-Control` is only ever set by one rule per path.

### Vercel

1. Go to vercel.com, sign in with GitHub (the Hobby plan is free for personal, non-commercial sites).
2. **Add New… → Project**, import the repo.
3. **Configure Project**: Framework Preset `Vite`. `vercel.json` already sets build command `npm run build` and output `dist`, so leave the overrides off. Root Directory: `./`.
4. **Environment Variables**: add `VITE_SITE_URL` = `https://<project>.vercel.app/` (or your domain, with the trailing slash). Do not set `VITE_BASE`.
5. **Deploy**.
6. Node version: Project → **Settings → Build and Deployment → Node.js Version**, choose 22.x (or 20.x).
7. Custom domain (optional): Project → **Settings → Domains**, add it, follow the DNS records shown. Update `VITE_SITE_URL` and redeploy (Deployments, latest, **Redeploy**).

`vercel.json` repeats the caching from `_headers` (Vercel does not read `_headers`): `/assets/*` immutable, `/play/*` one day, `nosniff` and the referrer policy everywhere.

### GitHub Pages

`.github/workflows/pages.yml` runs typecheck, lint and tests, builds, and deploys on every push to `main` (or by hand from the Actions tab).

1. Push the repo to GitHub with the workflow file in it.
2. Repo **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
3. Push to `main` (or Actions → **Deploy to GitHub Pages** → **Run workflow**). The URL appears on the deploy job and in Settings → Pages.

The workflow works out `VITE_BASE` and `VITE_SITE_URL` itself (the "Resolve base and site URL" step prints both):

| Repo | Base | Site URL |
|---|---|---|
| `<owner>.github.io` (user site) | `/` | `https://<owner>.github.io/` |
| any other name (project site) | `/<repo>/` | `https://<owner>.github.io/<repo>/` |

For a custom domain:

1. Settings → Pages → **Custom domain**: enter it, save, wait for the DNS check, tick **Enforce HTTPS**. With the Actions source no `CNAME` file is needed.
2. Settings → **Secrets and variables → Actions → Variables** tab → **New repository variable**: `VITE_BASE` = `/` and `VITE_SITE_URL` = `https://your.domain/`. Repository variables override the defaults above.
3. Re-run the workflow.

GitHub Pages cannot set response headers, so `_headers` has no effect there; its default caching is ten minutes for every file. Node comes from `.nvmrc`.

### Social card

`public/og.png` (1200×630, used for `og:image` and `twitter:image`), `public/og-square.png` (1080×1080, used as the JSON-LD image) and `public/apple-touch-icon.png` (180×180) are committed files. `npm run og` re-renders them with Playwright's Chromium from `scripts/og.html`, using the project's own Bricolage Grotesque and Commit Mono files and the real dates in `src/data/commits.json` (x = date, y = hour of day). Re-run it after re-baking the data, then commit the PNGs. After deploying, check the card with a preview tool such as the LinkedIn Post Inspector or opengraph.xyz.

## Fonts

Bricolage Grotesque (variable, weight and width axes), Heebo for Hebrew, both via `@fontsource`. Commit Mono is vendored in `src/design/fonts/` from github.com/eigilnikolajsen/commit-mono (OFL, license alongside); JetBrains Mono is the fallback and only downloads if Commit Mono fails.
