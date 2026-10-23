# Phase 2: section builders

Read `/home/claude/portfolio-spec/SPEC.md` in full first (including §8, the data addendum; its numbers override anything older). This file is the contract for working inside the shell that already exists.

## What you own

You own exactly one folder, and replace its temporary stub:

| PR | Builder | Folder | Content files you may also edit |
|---|---|---|---|
| #1 | hero | `src/sections/hero/` | your keys in `headings.ts` / `reviewNotes.ts` |
| #2 | loop | `src/sections/loop/` | your keys |
| #3 | projects | `src/sections/projects/` | `src/content/projects.ts`, your keys |
| #4 | early | `src/sections/early/` | `src/content/early.ts`, your keys |
| #5 | gitlog | `src/sections/gitlog/` | `src/content/gitlog.ts`, your keys |
| #6 | now | `src/sections/now/` | your keys |
| #7 | stack | `src/sections/stack/` | your keys |
| #8 | contact | `src/sections/contact/` | your keys |

"Your keys" means your section's entry in `src/content/headings.ts` and `src/content/reviewNotes.ts`, and nothing else in those files.

**Do not edit anything outside your folder** except those content files. That includes `src/factory/*`, `src/design/*`, `src/lib/*`, `src/data/*`, `App.tsx`, `registry.ts`, `index.html` and `package.json`. Seven builders work in parallel; disjoint folders are what keep merges clean. If you need something from shared code (a new token, a helper, a dependency), say so in your final report instead of adding it. Read-only use of shared code is fine and expected.

## The SectionModule contract

`src/factory/types.ts` (do not change it):

```ts
export interface SectionModule {
  id: 'hero'|'loop'|'projects'|'early'|'gitlog'|'now'|'stack'|'contact';
  pr: number; title: string; branch: string;
  spec: { acceptance: string[]; nonGoals: string[] };   // shown in the PR card "Spec" tab
  reviewNote: string;                                     // the dry true remark
  source: string;                                         // raw excerpt streamed in the diff
  Component: React.ComponentType;
  minHeight: number;                                      // slot min height px
}
```

Your folder keeps these four files (add more freely: CSS, subcomponents, hooks):

- `index.ts` exports `<id>Section: SectionModule`. Keep `id`, `pr`, `title` and `branch` as they are (they match the SPEC §4 table). Set `minHeight` to roughly your section's real height on desktop, so the slot reserves the right space.
- `Component.tsx` default-exports the section, with no props.
- `source.ts` is the excerpt streamed in the PR diff. Keep the pattern:
  ```ts
  import raw from './Component.tsx?raw';
  import { excerpt } from '../excerpt';
  export const source = excerpt(raw, 70);
  ```
  The diff should show 40–70 lines of the real code of the thing being merged. If `Component.tsx` is mostly imports at the top, import a more interesting file instead (`./Diagram.tsx?raw`) or slice past the imports; never paste code that isn't in the folder. The build time is paced to the excerpt's length (1.6–2.4 s).
- `spec.ts` holds 3–6 real acceptance criteria from SPEC §5 and 1–2 non-goals, written as plain sentences. They render as `AC-1…` / `NG-1…` in the PR card.

`reviewNote` comes from `src/content/reviewNotes.ts`: one dry, true line.

## SectionFrame renders your h2, not you

`src/factory/ui/SectionFrame.tsx` wraps every section. Before merge it shows the slot with the PR card; after merge it renders the `<h2>` from `src/content/headings.ts` (whose characters fly in from the PR card with per-character `layoutId`s) and then your Component under a top-down ink wipe. So:

- **Never render your own h2.** Start your Component with the lede or the content. Use `h3` and below inside.
- SectionFrame already gives you `<section id="<id>">`, the `.container` (max 1240 px, gutters), and the top padding. Don't add another container.
- The hero is the exception: it has no h2 (`headings.hero = null`), and its `h1` is the name, rendered by the hero Component.
- Your Component mounts at the moment of merge (or at page load when the show is skipped). That is the moment to start a one-time animation such as the burst replay. Check `useReducedMotion()` from `motion/react` and `useFactory((s) => s.skipped)`; when either is true, render the final state with no animation.

## Design rules (SPEC §3)

- Use the tokens in `src/design/tokens.css` only: `--bg`, `--fg`, `--muted`, `--line`, `--line-strong`, `--wash`, `--agent`, `--agent-text` (cobalt for text and links: it stays at 4.5:1 at every progress), `--pass`, `--fail`. Never hard-code page colors. Every page color follows `--progress`, so your section must read well on dark ink and on light paper. Check both in the screenshots.
- `--human` amber is used for one thing: the human's merge action and its "waiting on you" state. The single allowed reuse is the "you merge" node in the #2 loop diagram. Nowhere else.
- No gradients as decoration. Glow only on the hero canvas and agent trails.
- Type: `var(--font-sans)` (Bricolage), `var(--font-mono)` (Commit Mono), `.he` for Hebrew. Helpers in `global.css`: `.lede`, `.prose`, `.muted`, `.mono`, `.grid-12`, `.visually-hidden`.
- Banned: all-caps labels, tracked-out eyebrows, middle-dot-joined meta strings in editorial copy, arrows appended to link text, identical cards, fade-up-on-scroll or any scroll-triggered entrance. Hover states are underline or color only.
- Copy is plain and sentence case. No self-praise adjectives. Numbers come from `src/data/stats.ts` or SPEC §2/§8; never invent one.
- Prefix your CSS classes with your section id (`.projects-row`, `.gitlog-node`) and put styles in your folder. Mobile first; it must work at 390 px with no horizontal page scroll.

## Shared code you can use (read-only)

- `src/data/stats.ts`: `commits`, `prs`, `repos`, `commitCount`, `repoCount`, `firstCommit`, `commitsByYear`, `mergeCommitCount`, `agentCoAuthoredCommits`, `mergedPRCount(repo)`, `burst` (the 44 PRs / 18 issues window with exact start/end), `densestWindow(repo, hours)`, `fmt(n)`.
- `src/lib/time.ts`: `israelTime()`, `reichmanSemester()`, `relativeTime(iso)`.
- `src/lib/github.ts`: `fetchRecentActivity(limit, signal)` resolves to `null` on any failure so you can fall back silently.
- `src/lib/cx.ts`, `src/lib/focusTrap.ts` (`useFocusTrap(ref, active, onEscape)`).
- `src/content/profile.ts`: identity, links, `hireMailto`, `BUILT_BY_AGENTS`, `REVIEW_ROUNDS`.
- The factory store: `useFactory(selector)` and `factoryStore.getState()` from `src/factory/store.ts`. Read state; the only actions sections should call are:
  - `factoryStore.getState().setGameOpen(true)`: opens the Prompt Racers modal (it lives at the app root, so the palette can open it too). Projects: your Play button calls this; don't build a second modal.
  - Hero: to launch agent particles when a PR starts building, subscribe with `factoryStore.subscribe((s, prev) => …)` and look for a section whose state changed to `building`. The control room is `document.querySelector('.control')`.

## Check your work

```sh
npm run typecheck && npm run lint && npm test && npm run build
npm run shots
```

`npm run shots` saves to `shots/` at 390×844, 768×1024 and 1440×900: `*-fresh-*` (progress 0, #2 waiting), `*-merged-1` (after the first merge), `*-skip-*` (fully merged, progress 1). Open the PNGs and look at your section at both ends of the palette. To see your section merged in the dark, use the dev server and the `lights` command in the ⌘K palette. Fix anything ugly before you report.

In your final report: what you built, screenshots you looked at, anything you needed from shared code, and open questions.
