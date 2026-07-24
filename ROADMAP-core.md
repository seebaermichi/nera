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

0. **This spec** + the pointer from `ROADMAP-themes.md §8`. ← sign-off gate ✅
1. **`@nera-static/core`** ✅ (shipped 4.9.0/4.9.1) — publishable engine identity:
   scoped name, `files` scoped to `src/*.js`+`index.js`, exported resolver
   (`src/resolve.js`) + site-model loader (`src/site-model.js`) + API barrel.
   Additive; the generator renders as today. Parity tests pin resolver behaviour.
   4.9.1 fixed plugin discovery to `@nera-static/plugin-*` only (the thin model
   depends on `@nera-static/nera` directly).
2. **`@nera-static/nera`** ✅ (shipped 1.0.0, `nera-cli/`) — the CLI:
   `new`/`build`/`dev`/`serve`/`update` over `core`; the thin scaffold template;
   the installer's scaffolding/update roles folded in; `nera update` →
   npm-update + `--migrate` legacy-clone conversion; `dev` orchestrated in code
   (vite + chokidar, lazily imported) instead of the `concurrently` npm script.
3. **`@nera-static/validate`** ✅ (shipped 1.0.0, `nera-validate/`) — the
   validator library over `core` (platform M1.2): `validateSite({ cwd })` returns
   structured `{file,line,severity,rule,message}`, resolving layouts/includes via
   the canonical resolver imported from `core` (no mirror). Checks layout
   present/resolves (theme-aware), includes/extends resolve, YAML parses, theme
   resolves. Ships a `nera-validate` bin; the `nera validate` subcommand delegates
   to it.
4. **Migrate `nera-website`** ✅ — now depends on `@nera-static/nera` instead of
   vendoring `src/`; the migrated build is **byte-for-byte identical** (129 files)
   and `nera validate` reports it clean. Local plugin `tutorials-list` moved to
   `plugins/` (`folders.plugins: ./plugins`); `deploy.yml` renders with
   `npm run build`. `@nera-static/installer` **deprecated** (README banner; the
   `npm deprecate` call is a maintainer step). Trilingual docs (getting-started,
   CLI, deployment, two tutorials — en/de/es) rewritten to the `nera` CLI flow.
   Held from push until the packages publish (`npm ci` needs them on npm).

## Open questions

Resolved in Slice 2:

- **Home for a site's own local plugins → `plugins/` at the site root.** A thin
  site has no `src/`. Local plugins live in a site-root `plugins/` folder,
  selected via `folders.plugins` in `config/app.yaml` (already merged by
  `loadAppData`, so no `core` change was needed — `core`'s default stays
  `./src/plugins` for back-compat). `nera update --migrate` moves a legacy
  `src/plugins/` → `plugins/` and tells the user to set `folders.plugins`.
- **Scaffold template → `template/` inside `@nera-static/nera`.** Shipped in the
  package `files`; `nera new` copies it and renames `_gitignore` → `.gitignore`
  (npm strips a literal `.gitignore` from tarballs). A `create-nera` package was
  rejected as more packages for no developer benefit.
- **`dev` orchestration → code, not `concurrently`.** `nera dev` runs an initial
  `run()`, serves `public/` with Vite, and re-renders on `pages/`/`config/`/
  `theme/` changes (coalescing mid-build changes). Vite and chokidar are CLI
  runtime deps, imported **lazily** so loading the modules (and the tests) does
  not require them.

Still open:

- **`nera add`** (plugin/theme wiring) is explicitly **later** — listed in the
  command surface for shape, not built in this milestone.
- **`core` vs `nera` version coupling.** The CLI pins `core` with a caret
  (`^4.9.0`); whether `nera update` should bump the pair in lockstep is TBD.

## Acceptance criteria

Code-complete and verified locally (via `npm link` / real-path copies, since the
packages are not on npm yet); the `published`/`npm deprecate` halves are the
maintainer's bootstrap steps.

- [x] `import { run, makeLayeredResolver, resolveEntry } from '@nera-static/core'` works; `nera-website`'s build via `core` is **byte-identical** to the vendored-engine build (129 files). *(publish: pending bootstrap)*
- [x] `@nera-static/validate` imports the resolver from `core` (no mirror) and flags a deliberately-broken page (missing/unresolvable layout, unresolved include, bad YAML) with structured `{file,line,severity,message,rule}`.
- [x] `npx @nera-static/nera new mysite` scaffolds a thin site whose `package.json` has one dependency; `nera build` renders `public/`. (`nera dev` live reload implemented; not automatically tested.)
- [x] `nera update --migrate` converts a cloned site to the thin model (adds the dep, rewrites scripts, moves `src/plugins`, removes `src/`) and installs — covered by tests.
- [x] `nera validate` on the scaffold exits 0; on a broken page exits 1 with the structured errors.
- [x] `@nera-static/installer` deprecated (README banner pointing at `@nera-static/nera`). *(the `npm deprecate` registry call is a maintainer step)*

## Maintainer bootstrap (post-code, in order)

The three new packages are not on npm yet, so their first publish is manual, and
**order matters** (each depends on the one before):

1. Create GitHub remotes: `seebaermichi/nera-cli`, `seebaermichi/nera-validate` (the generator repo already exists).
2. Bootstrap-publish, in order: **`@nera-static/core`** → **`@nera-static/validate`** → **`@nera-static/nera`** (npm has nothing to attach a Trusted Publisher to until the first publish; CI OIDC takes over afterward).
3. In `nera-website`: `npm install` (regenerate the lockfile against the now-published deps), commit the lockfile, then push — its CI `npm ci` then works.
4. `npm deprecate @nera-static/installer "use @nera-static/nera"`.
