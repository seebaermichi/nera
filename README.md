# @nera-static/core – the Nera engine

[![Test](https://github.com/seebaermichi/nera/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/nera/actions/workflows/test.yml)

**`@nera-static/core`** is the engine behind [Nera](https://github.com/seebaermichi/nera-cli): the four-stage build pipeline that turns Markdown + [Pug](https://pugjs.org/) into static HTML, plus the layered theme/view resolver. It is an **importable library**, consumed by the [`@nera-static/nera`](https://www.npmjs.com/package/@nera-static/nera) CLI, by [`@nera-static/validate`](https://www.npmjs.com/package/@nera-static/validate), and by other tooling.

📖 **Documentation:** [nera.js.org](https://nera.js.org)

> ⚠️ This project is under active development. Breaking changes may occur.

---

## 👉 Building a website? You probably don't want this package

If you want to **create and build a site**, install the CLI, not the engine — it brings `@nera-static/core` and `@nera-static/validate` transitively:

```bash
npm install -g @nera-static/nera

nera new my-nera-site
cd my-nera-site
nera dev            # build + live-reload dev server
nera build          # render pages/ → public/
```

A site is a **thin project** — a `package.json` whose only Nera dependency is `@nera-static/nera`, plus `config/`, `pages/`, and a `theme/`. It is not a clone of this repo. See the [Nera docs](https://nera.js.org/docs/) for the full site workflow (content, translations, deployment) and the [CLI README](https://github.com/seebaermichi/nera-cli) for its commands.

Install `@nera-static/core` directly only if you are **embedding the engine** — a custom build script, a hosted platform, or your own tooling:

```bash
npm install @nera-static/core
```

---

## 🧱 What the engine does

`run()` executes a fixed **four-stage pipeline** against the current working directory:

1. **`loadAppData`** — parse `config/app.yaml` into `app`; resolve the presentation folders (and the `theme/` probe) and list `pages/` recursively.
2. **`getPagesData`** — render each Markdown file with markdown-it, extract frontmatter, and derive `meta.href`/`dirname`/`filename`/`createdAt`. Returns `[{ content, meta }]`.
3. **`getPluginsData`** — load and apply plugins (see the plugin contract below), threading their `app`/`pagesData` results.
4. **render** — delete `public/`, write the HTML files (layering theme views under the site's), copy assets (theme first, site second), rewrite root-absolute URLs for `base_path` deploys, and (opt-in) version asset URLs with content hashes for cache busting.

Two things that are easy to miss:

- A page is only rendered if its frontmatter defines `layout`. Pages without it are silently skipped.
- `public/` is deleted on every render, so nothing may be authored there by hand.

---

## 📦 Public API

The package is ESM (`"type": "module"`), requires **Node 20.19 or later** (Node 21 excluded), and exposes a barrel at the root plus per-module subpath exports.

```js
import { run } from '@nera-static/core'

// Build the site in process.cwd(): pages/ → public/
await run()
```

`run(settings?)` accepts an optional `settings` object (defaults to `defaultSettings`); its `folders` block is normally taken from the site's `config/app.yaml`, not passed here.

### Exports

| Export | From | Purpose |
|---|---|---|
| `run` (also default) | `.` | Run the whole four-stage build against the cwd. |
| `loadAppData`, `getPagesData`, `computeFolders`, `defaultSettings`, `normalizeBasePath` | `./core` | Pipeline stages 1–2 and the folder/base-path helpers. |
| `getPluginsData` | (`.` / `setup-plugins`) | Pipeline stage 3 — load and apply plugins. |
| `makeLayeredResolver`, `resolveEntry`, `defaultResolvePath` | `./resolve` | The layered Pug view resolver (site over theme, per file). |
| `resolveSiteModel` | `./site-model` | Read-only: the folders, theme, and resolver `roots` chain for a directory **without building it** — the bridge `@nera-static/validate` and the platform use to agree with the engine on "how this site resolves." |
| `resolveTheme`, `checkThemeCompatibility`, `deepMerge` | `./theme` | Theme discovery, `nera.generator`/peer-dependency compatibility checks, config merge. |

Subpath exports (`@nera-static/core/resolve`, `/site-model`, `/core`, `/render`, `/theme`) are available for callers that want a single module without pulling in the whole barrel.

```js
import { resolveSiteModel } from '@nera-static/core/site-model'

const model = resolveSiteModel({ cwd: '/path/to/site' })
// → { folders, theme, roots, appConfigError, themeError, ... }  (never throws)
```

---

## 🔌 Plugin contract

Plugins are discovered from two places: local directories under the configured plugins folder (`folders.plugins`, default `./src/plugins`; a thin site sets `./plugins`), and any dependency in the **site's** `package.json` whose name starts with **`@nera-static/plugin-`** (excluding the `@nera-static/plugin-utils` library).

A plugin is an ESM module exporting any of these hooks — no registration, no base class:

```js
export function getAppData({ app, pagesData }) { /* return a new app object */ }
export function getMetaData({ app, pagesData }) { /* return a new pagesData array */ }
export function getAssets({ app, pagesData }) { /* return [{ from, to }] to copy into public/ */ }
```

- `getAppData` runs first and must return a **plain object**; `getMetaData` must return an **array**. A wrong return type is discarded with a warning and the build continues.
- Results are threaded: `getMetaData` sees the `app` that `getAppData` returned.
- `getAssets` (core ≥ 4.13.0) is for plugins that produce files. It runs after every plugin's `getAppData`/`getMetaData`, in plugin order, with the final `app`/`pagesData`, and returns an array of `{ from, to }`: `from` an absolute file or directory, `to` a path relative to `public/` (for a file, the target file path; for a directory, the folder its contents go into). Core copies them after the theme's assets and before the site's (theme → plugins → site, so the site wins a collision), unfiltered by `.neraignore`, and before `base_path` rewriting and asset hashing, which therefore cover them. A non-array result, or an entry with a missing/relative `from` or an absolute or `public/`-escaping `to`, is skipped with a warning; a `from` that does not exist is skipped at copy time.
- Both hooks are awaited (generator ≥ 4.3.0), but keeping them synchronous is the safe default.
- Config is read from the **user's site** (`config/<name>.yaml` via `getConfig`), not from the plugin package; supply per-key JS fallbacks.

Execution order: names under `start:` in `config/plugin-order.yaml`, then everything else alphabetically, then names under `end:`. For the full catalog see [PLUGINS.md](https://github.com/seebaermichi/nera/blob/main/PLUGINS.md).

---

## 🎨 Templates and the layered resolver

Rendering uses [Pug](https://pugjs.org/). Templates receive:

- `app`: values from `config/app.yaml` (including `app.theme` when a theme is set)
- `meta`: frontmatter metadata for the current page
- `t(key)`: translation helper — resolves `app.translations[meta.lang || app.lang][key]`, falling back to the key itself
- `url(path)`: prefixes a root-absolute path with the site's `base_path` (a no-op when unset)

Views resolve **layered**: a site's `theme/views/<file>` overrides an installed theme package's same-path file, WordPress child-theme style. A themeless site renders exactly as before this layer existed.

The `NERA_THEME` environment variable overrides `theme:` in `config/app.yaml` for one run, in any of its forms (`NERA_THEME=./themes/classic nera build`), so you can build or preview another design without editing the config. An empty value falls back to `app.yaml`.

The design lives in [`ROADMAP-themes.md`](./ROADMAP-themes.md); the consolidation that made this package importable is in [`ROADMAP-core.md`](./ROADMAP-core.md).

---

## 📁 Deploying to a subdirectory (`base_path`)

By default the engine writes root-absolute URLs (`/css/main.css`, `/about.html`), which assume the site is served from a domain root. When it is served from a **subdirectory** instead — most commonly a GitHub **project** Pages site at `https://<user>.github.io/<repo>/` — those URLs 404.

Set `base_path` in `config/app.yaml`:

```yaml
base_path: /my-repo
```

The engine then prefixes every root-absolute URL in the built output — links, `<script>`/`<link>`/`<img>` sources, `srcset`, CSS `url(…)`, the web app manifest, and `href`/`url` values in JSON assets such as the search index. The physical output layout is unchanged, and `meta.href` stays in the site's logical (un-prefixed) namespace so template URL logic keeps working.

It is fully additive: with no `base_path` (or `base_path: ''`) the build is byte-identical. Remove it when you move the site to a domain root.

For **absolute** URLs you build yourself (canonical/OpenGraph tags, a sitemap), set the relevant plugin's origin to include the subdirectory, or wrap a hardcoded path in the `url()` helper.

---

## 🔄 Cache busting (`asset_hashing`)

Browsers cache stylesheets, scripts and fonts, so after a deploy visitors can keep seeing the old CSS/JS until they force a reload. Enable content hashing in `config/app.yaml`:

```yaml
asset_hashing: true
```

As the last build step the engine appends `?v=<hash>` — the first 10 hex chars of the file's SHA-256 — to every local asset URL in the output: `<link>`/`<script>`/`<img>` sources, `srcset`, `poster`, `data-search-index`, and `url(…)` inside CSS. The hash is taken from the file that actually landed in `public/`, so site assets, theme-package assets and plugin output are all covered, and templates keep writing plain `/css/main.css`. Each file is versioned on its own: its URL changes exactly when its content does, and stays cacheable otherwise. A stylesheet is hashed after its `url()` references are rewritten, so a changed font busts the CSS as well.

Left untouched: links to pages (`.html`, directories), external and protocol-relative URLs, other schemes (`data:`, `mailto:`), fragment-only refs, URLs that already carry a query string, and references that don't resolve to a file in `public/`. It composes with `base_path`. URLs a script builds at runtime (a `fetch('/data.json')` literal in JS) are not rewritten — pass them in through an attribute such as `data-search-index` instead.

Opt-in and additive: without the key the build is byte-identical.

---

## 🛠 Developing this engine

This repo ships a bundled demo site used to exercise the pipeline during development — the same pipeline the CLI drives via `run()`:

```bash
npm run render  # build the demo site to /public
npm run dev     # render, then vite + asset watch + rebuild on change
npm run serve   # vite over the built output
npm test        # vitest (WATCH mode) — use `npx vitest run` for a single pass
npm run lint    # eslint .
```

Formatting is enforced by eslint: 4-space indent, no semicolons, single quotes. There is no build step.

---

## 📚 Further reading

- [nera.js.org](https://nera.js.org) — the official Nera website and documentation
- [`@nera-static/nera`](https://github.com/seebaermichi/nera-cli) — the CLI, and the getting-started for building a site
- [PLUGINS.md](https://github.com/seebaermichi/nera/blob/main/PLUGINS.md) — the plugin catalog
