# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [4.9.0] - 2026-07-24

First step of the **core consolidation** (`ROADMAP-core.md`): the generator gains
a **publishable engine identity** as `@nera-static/core`, so its build pipeline
and — crucially — its layered theme/view resolver can be imported by the coming
`nera` CLI, by `@nera-static/validate`, and by tooling, instead of being vendored
by clone. Fully additive: the render pipeline is byte-identical to 4.8.0, and a
site cloned as before still builds unchanged.

### Added

-   `src/resolve.js` — the layered view resolver (`makeLayeredResolver`,
    `resolveEntry`, `defaultResolvePath`) extracted verbatim from `render.js` and
    now exported, so `@nera-static/validate` decides "does this include resolve?"
    with the exact logic the build uses (no forked copy to drift).
-   `computeFolders(appConfig, { settings, cwd, warn })` in `core.js` — the
    `folders` merge and `theme/` probe, now cwd-aware and side-effect-free, so a
    read-only caller outside the site directory gets the same folders the build
    does. `loadAppData` delegates to it (behaviour unchanged; still warns once on
    the legacy root layout).
-   `src/site-model.js` — `resolveSiteModel({ cwd })`, which returns a site's
    folders, theme, and the ordered `roots` chain **without building**, capturing
    a broken `app.yaml` or unresolvable theme as `appConfigError`/`themeError`
    rather than throwing. The bridge the validator and platform resolve against.
-   Package identity for npm publishing: scoped name `@nera-static/core`,
    `exports` map (`.`, `./resolve`, `./core`, `./render`, `./theme`,
    `./site-model`), `files` scoped to `src/*.js` + `index.js` (tests excluded),
    `publishConfig.access`, and a trusted-publishing `publish.yml`. The bare
    `nera` name is taken on npm; the scoped name is ours (the *command* stays
    `nera`, provided by the CLI package).

### Changed

-   `render.js` imports `makeLayeredResolver`/`resolveEntry` from `./resolve.js`
    instead of defining them inline — pure refactor, identical output.

## [4.8.0] - 2026-07-24

Subdirectory deploys via a new `base_path` config key. A site served from a
subdirectory — most commonly a GitHub *project* Pages site at
`https://<user>.github.io/<repo>/` — previously broke, because Nera emits
root-absolute URLs (`/css/main.css`) that resolve against the domain root and
404. Setting `base_path` prefixes them at build time. Fully additive: with no
`base_path`, the build is byte-identical to before.

### Added

-   `base_path` in `config/app.yaml` → `app.basePath` (normalised: leading slash,
    no trailing slash; blank/`/` → '' → no-op). On build, every root-absolute URL
    in the output is prefixed with it: HTML `href`/`src`/`poster`/`srcset` and
    `data-search-index`, CSS `url(…)`, the `.webmanifest` (`start_url`/`scope`/
    `id`/icons/screenshots/shortcuts), and `href`/`url` values in `.json` assets
    (e.g. the search index). Prefixing is idempotent, so it never double-applies.
-   a `url(path)` template helper that prefixes a root-absolute path with
    `base_path` (a no-op when unset) — for absolute paths built in inline scripts
    or attributes the automatic rewrite can't reach.

### Changed

-   `meta.href` deliberately stays in the site's logical (un-prefixed) namespace;
    `base_path` is applied uniformly in the render/asset rewrite, not baked into
    `meta.href`, so template URL logic (a language switcher stripping `/de`, an
    `link.href === meta.href` active check) keeps working and never
    double-prefixes.

## [4.7.0] - 2026-07-24

`meta.createdAt` can now come from frontmatter, making date ordering survive CI
builds. The filesystem `birthtime` it derived from is unreliable there: a fresh
clone/checkout stamps every file with the same date, silently breaking anything
that orders or displays by date (pagination, tag overviews, page lists, printed
tutorial dates). Additive and backward compatible — a page with no date keys in
frontmatter still uses `birthtime`, so a purely-local build is unchanged.

### Changed

-   `getPagesData` now resolves `meta.createdAt` as
    `frontmatter.createdAt || frontmatter.date || fs.statSync().birthtime`
    (`src/core.js`). Authors deploying via CI get a stable date by adding
    `createdAt:` (or `date:`) to a page's frontmatter; local builds without
    either key behave exactly as before. See nera-platform R1 (`plans/01`).

## [4.6.0] - 2026-07-24

The installable, updatable theme system (`ROADMAP-themes.md`). A theme is an npm
package (`@nera-static/theme-<name>`) that provides base `views/` and `assets/`;
the site overrides them per file, WordPress child-theme style, and everything it
has not overridden keeps updating via `npm update`. All additive — a site with no
`theme:` key and no `theme/` folder renders byte-identically to 4.5.0.

### Added

-   layered view resolution: a `theme:` key in `config/app.yaml` (`docs` →
    `@nera-static/theme-docs`, a verbatim `@scope/name`, or a local `./path`)
    layers the resolved theme under the site's own presentation. Layouts and
    partials resolve through `[<site>/theme-or-root, <theme pkg>]`, first match
    wins per file, via Pug's `resolve` hook — so a site file overrides only that
    file. A `theme:` that cannot be resolved fails the build with an actionable
    message and a non-zero exit rather than rendering an unstyled site
-   the `theme/` folder layout: a site groups its own presentation under
    `<site>/theme/{views,assets}`; a theme package puts its payload at its own
    root. `core.js` probes for `<site>/theme/` and, when absent, falls back to the
    legacy root `views/`/`assets/` with a one-time deprecation warning — so every
    existing site keeps rendering unchanged
-   `config/theme.yaml` merge: the theme's `config/theme.yaml` defaults
    deep-merge with the site's optional `config/theme.yaml` (objects per key,
    arrays replaced, site wins at the leaf), exposed to templates as
    `app.theme = { name, package, config }`
-   two-pass asset copy (theme first, site second, site wins on collision); the
    site's `.neraignore` filters only the site pass, the theme pass is unfiltered
-   **compatibility declarations** (§5). A theme declares what it supports, and a
    mismatch is surfaced at build time rather than rendering subtly-broken output:
    -   `nera.generator` — a plain semver range in the theme package's
        `package.json`, checked against the version the generator reports about
        **itself** (`readGeneratorVersion`, from the generator's own manifest — not
        the site's `version`, a clone-flow artefact). A range that excludes the
        running generator **fails the build** with a clear message and a non-zero
        exit, because a theme built against a newer generator may use an `app.*`
        key or resolution behaviour that does not exist here
    -   `peerDependencies` — the plugins whose BEM class names the theme's CSS
        targets. A plugin installed at a version outside the declared range only
        **warns** (the plugin still renders correct markup; the theme just may lack
        CSS for it), and a plugin the site does not install is silent
-   `semver` is now a runtime dependency, used only for the compatibility checks

### Changed

-   the generator's own scaffold moved its presentation from root `views/`/
    `assets/` to `theme/views/`/`theme/assets/`, so `nera new` produces
    `theme/`-shaped sites that are not born deprecated
-   `createHtmlFiles` now compiles each distinct layout once per build and reuses
    the compiled template across every page that uses it, instead of re-running
    `pug.compileFile` per page. Sites share a handful of layouts, so this is a
    large win (~72× on 69 pages, ~500× on 500 in profiling) and takes a 69-page
    render from ~225 ms to ~22 ms. Output is byte-identical; the cache is a plain
    `Map` scoped to each build, with no process-global state

## [4.5.0] - 2026-07-22

### Fixed

-   a `folders` block in `config/app.yaml` now actually takes effect. It was
    merged into the app data, so every plugin read the configured value, but
    the render pipeline kept using the built-in defaults — `run()` destructured
    `settings.folders`, and `index.js` calls `run()` with no argument. Setting
    `folders.assets: ./static` therefore had `@nera-static/plugin-search` write
    its index to `static/`, while the render logged `No Assets found` and
    copied nothing into `public/`: the built site 404'd on an index that
    existed on disk. Any plugin writing into the assets folder had the same
    split
-   a `folders` block naming only some keys no longer blanks the rest. The
    merge replaced the whole object, so `folders: { assets: ./static }` left
    `dist`, `views` and `pages` undefined for anything reading `app.folders`.
    Keys are now merged individually over the defaults
-   `folders.pages` is honoured when the page list is built, not just when it
    is read back

### Changed

-   folders are resolved once, in `loadAppData`, and every later stage reads
    the result from `data.app.folders`. `folders.config` remains the one key
    that can only come from the caller — app.yaml is found through it

### Added

-   tests covering per-key merging, the configured pages folder, and that
    app.yaml cannot redirect the config folder it was itself read from


## [4.4.1] - 2026-07-21

### Fixed

-   installed `@nera-static/*` plugins are now discovered from the project
    being built (`process.cwd()`) rather than from a path resolved relative
    to `src/setup-plugins.js`. Every other lookup in the pipeline is already
    cwd-relative — `config/plugin-order.yaml`, and core's `./config`,
    `./pages`, `./views` — so plugin discovery was the one place that ignored
    the working directory. Rendering a site is unaffected, since `npm run
    render` runs from the project root and both paths resolve to the same
    directory; what it fixes is any tooling that points cwd at another
    project, which previously kept loading the wrong dependency list

### Added

-   a regression test covering the above. This repo declares no
    `@nera-static` dependencies of its own, so the defect was invisible to
    the suite until a fixture project declared one


## [4.4.0] - 2026-07-21

### Changed

-   minimum supported Node raised from 18 to 20; Node 18 reached
    end-of-life on 2025-04-30 and the dev toolchain (vitest 4, vite 8,
    eslint 10) requires Node 20+
-   CI matrix now tests Node 20 and 22 (dropped 18)


## [4.3.0] - 2026-07-19

### Fixed

-   plugin hooks are now awaited, so an async `getAppData` no longer
    replaces the entire app config with a Promise
-   pug templates now compile with `basedir` set, so absolute
    `include /vendor/...` paths work as documented by plugins
-   `meta.fullPath` and `meta.href` are derived consistently, so pages
    whose path contains `.md` mid-string no longer render to a location
    their links do not point at
-   path separators are normalised, fixing URLs on Windows


## [4.2.2] - 2025-08-02

### Changed
  - move test folder into src



## [4.2.1] - 2025-07-25

### Changed
  - loadAppData() now loads appConfig.folders into the app data


## [4.2.0] - 2025-07-23

### Added

- Plugin execution order control via `config/plugin-order.yaml`
- Support for `start` and `end` plugin groups with flexible ordering logic
- Alphabetical fallback sorting for unspecified plugins

### Changed

- Internal plugin orchestration updated to allow manual ordering
- `setup-plugins.js` fully rewritten for clarity and flexibility

### Technical

- Improved test coverage for plugin ordering edge cases
- Updated test suite to isolate and verify execution sequences


## [4.1.0] - 2025-07-19

### Added

-   Enhanced error handling in `core.js` with detailed logging and graceful failure recovery
-   Performance optimizations for plugin loading with parallel execution
-   Comprehensive logging system with emoji indicators for better developer experience
-   File existence checks before processing to prevent unnecessary errors
-   Plugin loading performance monitoring with timing information
-   Improved test coverage for error scenarios

### Changed

-   Plugin loading now executes in parallel instead of sequentially for better performance
-   `getPagesData()` now skips corrupted files instead of including them with empty content
-   `loadAppData()` provides better fallback handling for missing configuration files
-   Plugin data merging now uses full object replacement for consistency with meta data handling

### Fixed

-   `link-attributes` plugin now correctly uses `getMetaData` instead of `getAppData`
-   `popular-content` plugin now returns complete app data object instead of partial data
-   File stat errors no longer crash the build process
-   Missing directories are handled gracefully without terminating the build

### Technical

-   Added comprehensive test coverage for new error handling scenarios
-   Improved test isolation and safety measures
-   Enhanced plugin architecture consistency across all plugins


## [4.0.1] - 2025-07-19

### Fixed

-   HTML page is only created if layout property exists in frontmatter

### Security

-   Updated outdated and deprecated packages
-   Replaced deprecated dependencies with modern alternatives

### Changed

-   Migrated from deprecated ESLint configuration to flat config
-   Updated build tools and development dependencies


## [4.0.0] - 2025-07-15

### Breaking Changes

-   Major dependency updates with potential breaking changes
-   Updated minimum Node.js version requirements

### Added

-   Modern ESLint flat configuration
-   Updated Vite build system
-   Improved development tooling

### Security

-   Fixed multiple security vulnerabilities
-   Updated all dependencies to latest secure versions


## [3.2.0] - 2021-10-29

### Security

-   Updated packages and fixed vulnerabilities
-   Resolved multiple npm audit issues


## [3.0.0] - 2021-01-25

### Added

-   **Translation Support**: Multi-language site capabilities
-   **Canonical Links Plugin**: SEO improvements with canonical URL support
-   Plugin documentation and guides

### Changed

-   Enhanced configuration system for internationalization
-   Updated layout templates for translation support


## [2.0.0] - 2019-11-15

### Breaking Changes

-   **Complete Refactor**: Moved to functional programming paradigm
-   Restructured core architecture

### Added

-   Modular plugin system (`setup-plugins.js`)
-   Functional core components (`core.js`, `render.js`)
-   Improved separation of concerns

### Changed

-   Plugin API redesigned for better extensibility
-   Core functionality split into focused modules


## [1.x] - 2019 and earlier

### Initial Development

-   Basic static site generation
-   Markdown to HTML conversion
-   Pug template support
-   Plugin system foundation
-   Main navigation features
-   Asset copying and management
-   Basic SEO features (meta descriptions, keywords)
-   Sub-navigation support

[4.2.1]: https://github.com/seebaermichi/nera/compare/v4.2.0...v4.2.1
