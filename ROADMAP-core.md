# ROADMAP — the core consolidation: one `nera` package

> **Status: spec, awaiting sign-off. No code moved yet.**
>
> This document is the single source of truth for turning the *generator* and the
> *installer* into **one thing a developer installs** — a `nera` CLI over a thin,
> published engine. Extend this file rather than starting a parallel one, exactly
> as `ROADMAP-themes.md` anchored the theme work. `ROADMAP-themes.md` §8
> ("should the generator itself be an npm package?") is the seed of this; that
> section now points here for the full treatment.

## Why (and why now, independent of the platform)

This surfaced while planning the hosted CMS (`nera-platform/plans/`), where a
validator (`@nera-static/validate`, R4) wants to reuse the generator's *canonical*
layered resolver rather than mirror it — which is only clean if the engine is an
importable package. But like the theme system before it, **it stands on its own
merits and every Nera user benefits, platform or no platform.** It ships first, as
OSS, and the platform resumes on top of a cleaner base.

Today a developer juggles **two mental models and two packages**:

- The **generator** (`nera`, unpublished) is *both* the engine (`src/`) *and* the
  site. A site **is** a git clone of it with `.git` stripped — so the site's
  `package.json` scripts are the generator's scripts (`render`, `dev`, `serve`),
  and the engine lives inside every site, un-updatable by npm.
- The **installer** (`@nera-static/installer`) is a *separate* package owning the
  `nera` bin — `nera new` (clone + strip `.git` + personalize `package.json`) and
  `nera update` (clone into `.nera-temp`, back up the user's files, overwrite
  `src/` + merge `package.json`, restore, delete backup). `nera update` exists
  **only because there is no `npm update` for a cloned core.**

The goal is one dependency and one command surface:

```
npx @nera-static/nera new mysite     # scaffold a thin site (no clone)
cd mysite
nera dev                             # build + serve + watch
nera build                           # render pages/ → public/
nera update                          # npm-update the core + plugins (retires the clone dance)
nera validate                        # check the site before publish
nera add <plugin|theme>              # LATER — wire a plugin/theme in for the user
```

A scaffolded site lists **one** dependency (`@nera-static/nera`) and never carries
the engine's source. `nera update` becomes `npm update` under the hood.

## Target architecture — three packages, the developer sees one

The developer installs and thinks about exactly one package, `@nera-static/nera`.
Underneath it, a thin engine and the validator are foundational libraries the
developer never names — they arrive transitively and `nera update` bumps them.

| Package | Role | Who depends on it | Ships |
|---|---|---|---|
| **`@nera-static/core`** | the engine — the four-stage pipeline (`loadAppData` → `getPagesData` → `getPluginsData` → render), theme discovery, the layered resolver | `@nera-static/nera`, `@nera-static/validate`, (future) the platform's Node service | `src/` + `index.js`; build-time deps only (markdown-it, pug, yaml, cpy, rimraf, pretty, semver, …) — **no CLI, no dev-server deps** |
| **`@nera-static/nera`** | the one developer-facing CLI — `bin: { nera }` with `new`, `build`, `dev`, `serve`, `update`, `validate`, later `add` | the site (its sole dependency); run via `npx` for `new` | the CLI, the **scaffold template** (`template/` → the thin starter site), dev-server orchestration (vite + watch + re-render) |
| **`@nera-static/validate`** | standalone validator — `validateSite()` returning structured results | `@nera-static/nera` (for the `validate` subcommand), the platform's Node service | the validator + a bin (`nera-validate`) |

### Why a thin `core` and not literally one package

The CLI needs the engine (to build) **and** the validator (for `nera validate`);
the validator needs the engine (the canonical resolver). If the CLI *and* the
engine were one package that depended on a separate validator, the graph would
**cycle** (`nera → validate → nera`). Pulling the engine down into `core` breaks
the cycle and — the real payoff — lets `@nera-static/validate` and the future
platform reuse the engine **without dragging the CLI (and vite/nodemon) along**.
The developer never sees `core`; it is an implementation detail, the same way
`@vue/cli` sits over `@vue/cli-service`.

```
@nera-static/core        (engine — no deps on the others)
   ▲            ▲
   │            │
@nera-static/validate    @nera-static/nera ──► depends on validate too
                              (CLI)
```

Acyclic. The site depends only on `@nera-static/nera`, which transitively brings
`core` and `validate`.

### The engine's public API (`@nera-static/core`)

`core` exports what the CLI, the validator, and the platform actually call.
Everything here exists today inside `generator/src/` — the work is to *expose* it,
not rewrite it:

- `run(settings?)` — the whole build (today `index.js#run`). `nera build` calls this.
- `loadAppData`, `getPagesData`, `getPluginsData` — the pipeline stages, already exported.
- **The resolver, newly exported for reuse:** `makeLayeredResolver(roots)`,
  `resolveEntry(layout, roots)`, `defaultResolvePath` (currently module-private in
  `render.js:209-250`), plus a small **site-model loader** that reproduces
  `loadAppData`'s folder/`theme/`-probe logic and `resolveTheme`'s discovery so a
  caller can obtain the `roots` chain (`theme ? [siteViews, themeViews] : [siteViews]`)
  for a given site directory. This is the single dependency that lets
  `@nera-static/validate` validate *exactly what the build will do* — no mirror,
  no drift.
- `resolveTheme`, `checkThemeCompatibility`, `deepMerge` — already exported from `theme.js`.

Exposed via the `exports` map (e.g. `@nera-static/core` and
`@nera-static/core/resolve`) so a consumer imports only the submodule it needs.

### What a scaffolded (thin) site looks like

```
mysite/
  package.json          # ← one dependency: @nera-static/nera; scripts call `nera …`
  config/app.yaml
  pages/**/*.md
  theme/
    views/**/*.pug      # site presentation (ROADMAP-themes.md §1b layout)
    assets/**
  plugins/              # OPEN QUESTION — home for the site's own local plugins (see below)
  .neraignore
```

```jsonc
// package.json (scaffold)
{
  "name": "mysite",
  "type": "module",
  "scripts": {
    "dev": "nera dev",
    "build": "nera build",
    "serve": "nera serve",
    "validate": "nera validate"
  },
  "dependencies": {
    "@nera-static/nera": "^1.0.0"
    // plugins the user adds land here too, e.g. "@nera-static/plugin-navigation"
  }
}
```

No `src/`, no vendored engine, no generator scripts. `nera.version` stamping and
the `personalizePackageJson` dance disappear — the engine version is just the
resolved `@nera-static/nera`/`@nera-static/core` version npm already tracks.

## Migration — existing sites keep working, then move

Every existing site is a clone carrying `src/`. Two mechanisms:

1. **`nera update` detects a legacy clone** (has `src/` + a `nera.version` stamp,
   or `package.json.name === 'nera'`-shaped scaffolds) and offers a **one-time
   migration**: add `@nera-static/nera` as a dependency, rewrite `scripts` to the
   `nera …` forms, delete the vendored `src/` and the old generator scripts, then
   `npm install`. The clone/backup/restore path in `update.js` is kept only as the
   fallback for a site that declines migration, and is deleted once the window
   closes.
2. **`nera-website`** (which currently vendors the generator `src/`) migrates to
   depend on `@nera-static/core` as part of Slice 4 — the dogfood proof.

Local (unpublished) plugins are the one migration wrinkle — see open questions.

## Semver / breaking story

- **`@nera-static/core` continues the generator's version line — 4.9.0** (shipped
  in Slice 1), not a reset to 1.0.0. The engine's behaviour is continuous and
  additive (a minor: it *adds* the resolver/site-model exports, render output is
  byte-identical), and — decisively — a theme's `nera.generator` compatibility
  range (`>=4.6.0`, …) targets the engine's version. Keeping the line makes those
  ranges stay valid as ordinary `peerDependencies` against `@nera-static/core`
  ("redundant rather than wrong", ROADMAP-themes.md §5/§8); resetting to 1.0.0
  would silently invalidate every one of them. Starting a new npm package above
  1.0.0 is unusual but correct here.
- **`@nera-static/nera` 1.0.0** — new package (the bare `nera` name is taken on
  npm; the scoped name is ours, the *command* stays `nera`). Subsumes the
  installer.
- **`@nera-static/validate` 1.0.0** — new package.
- **`@nera-static/installer`** — **deprecated** (npm-deprecate pointing at
  `@nera-static/nera`), not deleted; `npx @nera-static/installer new` keeps
  working for a window.
- **The generator repo's own `package.json`** stops being a site scaffold. This is
  the one genuinely disruptive change, but it lands as the *new* `core`/`nera`
  packages plus a migrating `nera update`, so no already-deployed site breaks on
  its next build — it breaks only if it never migrates and the deprecated path is
  eventually removed (a later, announced step).

This composes cleanly with the theme work: themes already moved presentation under
`theme/` (ROADMAP-themes.md §1b) with a deprecated root fallback; this moves the
*engine* out. `nera.generator` compatibility ranges (§5) become ordinary
`peerDependencies` against `@nera-static/core` the day this ships — which is
exactly the "redundant rather than wrong" outcome §8 asked the theme design to
preserve.

## Slice plan (each slice is independently reviewable)

0. **This spec** + the pointer from `ROADMAP-themes.md §8`. ← sign-off gate
1. **`@nera-static/core`** — publishable engine identity: scoped name, `files`
   scoped to `src/`+`index.js`, export the resolver helpers + a site-model loader.
   Additive; the generator still renders as today. Parity tests pin resolver
   behaviour (theme override, absolute vs relative includes, `.pug` auto-append).
2. **`@nera-static/nera`** — the CLI: `new`/`build`/`dev`/`serve`/`update` over
   `core`; the thin scaffold template; fold in the installer's logic; `nera update`
   → npm-update + legacy-clone migration; orchestrate `dev` (vite + watch +
   re-render) in code instead of the `concurrently` npm incantation.
3. **`@nera-static/validate`** — the validator library over `core` (platform
   M1.2), and the `nera validate` subcommand delegating to it.
4. **Migrate `nera-website`** to `@nera-static/core`; update deployment/README
   docs; **deprecate `@nera-static/installer`**; refresh memory.

## Open questions (decide during the slice they touch)

- **Home for a site's own local plugins.** `setup-plugins.js` today discovers
  `src/plugins/*/index.js` *and* `@nera-static/*` dependencies. A thin site has no
  `src/`. Proposal: discover local plugins from a site-root `plugins/` folder
  (configurable via `folders.plugins`, which already exists), resolved by `core`.
  Confirm in Slice 1/2.
- **Where the scaffold template lives.** Proposal: `template/` inside
  `@nera-static/nera` (scaffolding is the CLI's job). Alternative: a dedicated
  `create-nera` package — rejected as more packages for no developer benefit.
- **`dev` orchestration.** The current `dev` is a `concurrently` script chaining
  `render` + `vite` + `watch-assets` + `nodemon`. In the CLI it becomes code that
  runs an initial `run()`, starts vite over `public/`, and re-renders on
  `pages/`/`theme/`/`config/` changes. Keep vite/nodemon/chokidar as CLI deps.
- **`nera add`** (plugin/theme wiring) is explicitly **later** — listed in the
  command surface for shape, not built in this milestone.
- **`core` vs `nera` version coupling.** Whether the CLI pins `core` with a caret
  or an exact range, and whether `nera update` bumps them together.

## Acceptance criteria

- [ ] `@nera-static/core` published; `import { run, makeLayeredResolver, resolveEntry } from '@nera-static/core'` works; the generator's own `nera-website` fresh build is byte-identical to before the extraction.
- [ ] `@nera-static/validate` imports the resolver from `core` (no mirror) and flags a deliberately-broken page (missing/unresolvable layout, unresolved include, bad YAML) with structured `{file,line,severity,message,rule}`.
- [ ] `npx @nera-static/nera new mysite` scaffolds a thin site whose `package.json` has one dependency; `cd mysite && nera build` renders `public/`; `nera dev` serves with live reload.
- [ ] `nera update` migrates an existing cloned site to the thin model and leaves it building.
- [ ] `nera validate` on the scaffold exits 0; on a broken page exits 1 with the structured errors.
- [ ] `@nera-static/installer` deprecated on npm, pointing at `@nera-static/nera`.
