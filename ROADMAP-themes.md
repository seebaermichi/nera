# Roadmap — installable, updatable themes

**Status:** design settled (2026-07-22, sections 1–5, 7, 8; section 6 caching
deferred). **Implementation in progress on `feat/themes-slice-1`** — slices 1–2,
§1b, §2d, and §1c (config merge + `app.theme` exposure) have landed; §5
compatibility checks and §6 caching remain.

> **REVISED 2026-07-23 — folder layout changed (§1b).** The theme package has its
> payload at its **root** (`<pkg>/views`, `<pkg>/assets`), with **no inner
> `theme/` wrapper**, and a **site groups its own presentation under
> `<site>/theme/`** (no more root `views/`/`assets/`). This **supersedes** the
> original wrapper-in-package design that the rest of this file and the shipped
> code were built on. Consequences:
>
> - The folder move alone would be **breaking (major)**, but the **deprecated
>   root fallback** (§1b note) keeps the introducing release **non-breaking
>   (minor)** — see Semver and Acceptance criteria, both revised below.
> - **The §1b refactor has now landed** (2026-07-23): `theme.js` drops the
>   wrapper, `core.js` probes for `<site>/theme/` with a deprecated root
>   fallback, and `@nera-static/theme-example` moved its payload to the package
>   root. The "Shipped" bullets below now match the revised design.

Shipped so far, proven end to end against `@nera-static/theme-example`
(`../nera-theme-example`, installed via a `file:` dependency):

- **Slice 1** — layered view resolution: layouts and partials resolve through
  `[<site>/theme-or-root, <theme pkg>]`, site overrides per file (`render.js`
  `makeLayeredResolver` / `resolveEntry`; `theme.js` `resolveTheme`).
- **Slice 2** — themes as real npm packages: bare-name and `@scope` resolution
  from `node_modules`, the plugin-loader prefix skip (§1d), and two-pass asset
  copy with the site winning collisions (§2).
- **§1b folder-layout refactor** — theme payload at the package root (no
  wrapper); a site groups its own presentation under `<site>/theme/`, with a
  probe in `core.js` (`loadAppData`) that falls back to the legacy root
  `views/`/`assets/` — deprecated, with a one-time warning — so existing sites
  render byte-identically. `nera-installer`'s `nera update` backs up/restores
  whichever layout the site has.
- **Generator scaffold migrated** — the generator's own presentation moved from
  root `views/`/`assets/` to `theme/views/`/`theme/assets/`, so `nera new`
  (which git-clones the generator) now produces `theme/`-shaped sites that are
  *not* born deprecated. `src/watch-assets.js` and the installer's test fixture
  follow. This stays **minor**: the deprecated root fallback still covers every
  unmigrated site out there.
- **§1c `config/theme.yaml` merge + `app.theme.config` exposure** — the theme
  package's `config/theme.yaml` defaults deep-merge with the site's optional
  `config/theme.yaml` (objects per key, arrays replaced wholesale, site wins at
  the leaf), and the result is exposed to templates as
  `app.theme = { name, package, config }` (`theme.js` `resolveTheme` /
  `deepMerge`; attached in the pipeline in `src/index.js`). Additive — a
  themeless site gets no `app.theme` and is unaffected; a missing site
  `config/theme.yaml` inherits every default. Proven end to end against
  `@nera-static/theme-example` (file: install): `theme: example` +
  a site `config/theme.yaml` overriding `colors.primary` rendered
  `app.theme.config.colors.primary` = the site value while `label` fell through
  to the theme's own default.

Still open: compatibility checks (§5), caching (§6).

**Deliberately not migrated yet: `nera-website`.** The docs site carries its own
vendored generator at **4.4.0**, which has no theme code (no probe, no fallback),
so moving its `views/`/`assets/` to `theme/` would render an empty site. It can
only migrate *after* the theme-aware generator is merged to `main` and released,
via `nera update` (which replaces its vendored `src/`) followed by the folder
move — decided 2026-07-23 rather than couple the dogfood site to unreleased
generator code. It renders fine today and emits no deprecation warning (its 4.4.0
generator has none).

**This file is the single source of truth for theme-system work.** Extend it
rather than starting a parallel document.

---

## The problem

A Nera site's look lives in `views/**/*.pug` plus `assets/`. Today those are
copied into a project once — by `nera new`, or by hand — and from that moment
they are the user's own files. There is no way to ship an improvement to them.

`render.js:67-70` compiles layouts from exactly one directory:

```js
pug.compileFile(`${viewsFolder}/${pageData.meta.layout}`, { basedir: viewsFolder })
```

and `copyFolder(assets, dist)` copies from exactly one assets folder. Neither has
a fallback chain. Combined with `publishTemplates` skipping when the destination
exists (`plugin-utils/index.js:63`), a site's presentation layer is **fork-once**:
bug fixes, accessibility work and security fixes never reach it.

Plugins solved this years ago — they are npm packages, and `npm update` works.
**Themes should behave the same way.**

## The goal

A theme is an npm package (`@nera-static/theme-<name>`). It provides the base
`views/` and `assets/`. The site's own `views/` and `assets/` override it **per
file**. Anything the user has not overridden keeps updating via npm.

This is WordPress child-theme semantics, and the trade is deliberate: override a
file and you opt out of updates *for that file only*, not for the whole theme.

---

## Verified: Pug can do this

`basedir` is single-valued, which looks like a blocker for `include`/`extends`.
It isn't — Pug exposes a `resolve` hook through `options.plugins`.

Proven with a throwaway fixture (theme provides `layouts/layout.pug`,
`partials/header.pug`, `partials/footer.pug`; site overrides only
`partials/header.pug`):

```js
const layered = {
    resolve(filename, source, options) {
        // map to a chain-relative path, then first match wins
        for (const root of [SITE_VIEWS, THEME_VIEWS]) {
            const candidate = path.join(root, rel)
            if (fs.existsSync(candidate)) return candidate
        }
        return path.resolve(path.dirname(source), filename)
    }
}
pug.compileFile(entry, { plugins: [layered] })
```

Output:

```html
<h1>SITE header (overridden)</h1><footer>THEME footer</footer>
```

The layout resolved from the theme, `header.pug` from the site, `footer.pug` fell
through to the theme. **Per-file override works.** This is the load-bearing
mechanism and it is confirmed.

---

## Decisions

Sections marked **DECIDED** are settled; do not re-litigate them without a
reason, and where a rejected alternative is recorded, it is recorded so it does
not get re-proposed. Section 6 remains genuinely open.

### 1. Discovery — **DECIDED 2026-07-22**

The problem: `setup-plugins.js:118-127` loads **every** dependency starting with
`@nera-static/` as a plugin and calls `import()` on it. A theme package would be
picked up, fail to import (no JS entry point), and log
`❌ Failed to load npm plugin theme-docs` on every build. Discovery therefore
needs an explicit decision rather than a naming convention.

#### 1a. A `theme:` key in `config/app.yaml`

```yaml
# config/app.yaml
theme: docs          # → @nera-static/theme-docs
```

Explicit, swappable in one line, independent of dependency-name conventions, and
a site-level fact like `lang` — so it belongs in the one config file every site
has. A bare name is expanded to `@nera-static/theme-<name>`, but the key accepts
three forms:

| value | resolves to (a **theme root**) |
|---|---|
| `docs` | `@nera-static/theme-docs` |
| `@acme/my-theme` — contains `/` or starts with `@` | verbatim package name |
| `./path/to/it` — starts with `.` | path relative to `process.cwd()` |

Every form resolves to a **theme root** whose `views/`, `assets/` and
`config/theme.yaml` sit **directly** at that root — no `theme/` wrapper to
append (§1b, revised 2026-07-23). The resolution chain is then
`[<site>/theme, <resolved theme root>]`, first match wins per file, so the site's
own `<site>/theme/` layer overrides the installed theme.

Developing a theme in place no longer needs a `theme:` value at all: the site's
own `<site>/theme/` **is** a theme, so you edit it directly. A `theme:` key names
an *additional* base theme to layer under it — a published package (`docs`), or a
local package directory whose `views/`/`assets/` sit at its root
(`./path/to/it`).

Accepting a full package name matters: short-form-only would make third-party
themes impossible by construction, which is too large a limitation to bake in for
the sake of eight saved characters. It costs about three lines in the resolver.

**No implicit discovery.** A `./theme` folder present without a `theme:` key is
ignored — that preserves the "a site with no theme renders byte-identically to
today" criterion.

**A missing theme is a hard error, not a warning.** The house style elsewhere is
warn-and-continue, but a `theme:` that cannot be resolved means every layout is
missing: the build would produce an unstyled site and exit 0. That is the same
class of silent failure as the pre-4.3.0 async-hook bug. Error with an
actionable message (`run: npm install @nera-static/theme-docs`) and exit
non-zero.

#### 1b. Folder layout — package root is the theme root; the site groups its own under `theme/` — **REVISED 2026-07-23**

> Supersedes the original design, in which the payload lived under an inner
> `theme/` wrapper *inside the package* (`<pkg>/theme/views`). That produced a
> redundant `theme/theme/` for packages and is dropped. The shipped code and the
> `theme-example` repo still use the old wrapper and must be refactored.

A theme **package** puts its payload directly at its **root** — a theme package
contains nothing *but* the theme, so its root already is the theme root:

```
node_modules/@nera-static/theme-docs/
    views/
    assets/
    config/theme.yaml
    package.json
```

A **site** groups its *own* presentation under a single `theme/` folder, and no
longer keeps `views/` or `assets/` at the root:

```
<site>/
    theme/
        views/         ← the site's own layouts/partials, and any overrides
        assets/        ← the site's own css/js
    pages/             ← content            (unchanged, at site root)
    config/            ← app.yaml, theme.yaml, …  (unchanged, at site root)
    public/            ← rendered output    (unchanged)
    package.json
```

Resolution is the chain `[<site>/theme, <resolved theme root>]`, first match wins
per file:

- views: `<site>/theme/views/…` over `<pkg>/views/…`
- assets: `<site>/theme/assets/…` over `<pkg>/assets/…`

**Why the asymmetry** — site wraps its presentation in `theme/`, a package does
not: a site has other top-level folders (`pages/`, `config/`, `public/`), so
grouping presentation under `theme/` keeps it a distinct, overridable unit — and
gives the site's own layer and an installed theme the identical `{views, assets}`
shape the chain relies on. A package is *only* a theme, so a wrapper there would
be `theme/theme/` for nothing.

**This is a breaking change for existing sites.** Today a site's presentation is
at root `views/`/`assets/`; this moves it to `<site>/theme/`. Existing sites need
a one-time migration (`views/` → `theme/views/`, `assets/` → `theme/assets/`),
`nera new` must scaffold the new shape, and `nera update`'s backup/restore lists
(§7) change from `views`/`assets` to `theme/`. Hence **major**, not minor
(Semver, revised). A transitional read-from-root fallback could soften the
migration, but the decision is to move, not to keep both indefinitely.

**Locating an installed theme on disk:** a theme has no JS entry point, so
`import()` is not available. Resolve `<pkg>/package.json` and take its dirname —
that dirname is the theme root **directly** (nothing to append). Theme packages
must therefore either omit `exports` or explicitly include `"./package.json"`,
and ship `files: ["views", "assets", "config"]` (not `["theme"]`).

> **NOTE — deprecated root fallback (generator concern). DECIDED 2026-07-23.**
>
> To avoid a hard break, the generator resolves the site's own presentation root
> by **probing**: if `<site>/theme/` exists, use `<site>/theme/{views,assets}`;
> **otherwise fall back to the legacy root `<site>/views` and `<site>/assets`**.
> The legacy root is treated exactly as the site's own layer would be — it is the
> first element of the resolution chain `[<site>/theme-or-root, <installed theme>]`,
> so a legacy site that also installs a theme package still overrides it per file.
>
> **The root layout is deprecated, not removed.** When the generator falls back
> to root `views/`/`assets/`, it emits a one-time deprecation warning pointing to
> the migration (`views/` → `theme/views/`, `assets/` → `theme/assets/`). It is
> removed in a later major once sites have had time to move.
>
> This is what keeps the **introducing** release non-breaking (see Semver): an
> existing site with no `theme/` folder renders exactly as today. An explicit
> `folders:` block in `app.yaml` still wins over the probe, as it does now.
>
> This lives entirely in the generator's folder resolution (`core.js`
> `loadAppData` / `defaultSettings`); the installer is not involved.

#### 1c. `config/theme.yaml` — optional, and **merged** with the theme's defaults — **SHIPPED 2026-07-23**

> **Landed 2026-07-23.** `theme.js` `resolveTheme` now returns a `config` field —
> the theme root's `config/theme.yaml` deep-merged with the site's optional
> `config/theme.yaml` via `deepMerge` (objects per key, arrays replaced, site
> wins at the leaf; pure and synchronous, tolerant of either file being absent or
> malformed). `src/index.js` attaches `app.theme = { name, package, config }`
> right after resolution, before the plugin pass, so it threads through the app
> object like `lang`/`name`. Covered by `deepMerge` unit tests, `resolveTheme`
> fixture tests, and a `run()` e2e; validated against `@nera-static/theme-example`
> as above.

The theme package ships `config/theme.yaml` (at its root) containing real
defaults; the site's `config/theme.yaml` (at the site root — config stays out of
`theme/`) is optional and deep-merges over it. Objects merge per key, arrays are
replaced wholesale, the site wins at the leaf.

```yaml
# <site>/config/theme.yaml — overrides two tokens, inherits the rest
colors:
    primary: '#0b5'
```

**This is an intentional divergence from the plugin config contract**, where
`getConfig` reads the site's file wholesale with no merge. Copying that behaviour
here would mean a site wanting to change one colour has to copy the theme's
entire token block — and would then never receive a token the theme adds later.
That is the fork-once problem again, relocated from `views/` into `config/`. The
divergence is the point; it should not be "corrected" for consistency later.

Exposed to templates as one namespaced object:

```
app.theme = { name, package, config }
```

so a layout reads `app.theme.config.colors.primary`. Slightly verbose, but
flattening the merged config onto `app.theme` would reserve `name` and `package`
as keys no theme author could ever use.

#### 1d. Plugin-loader skip

**Shipped (slice 2): a single prefix skip is sufficient.** The original plan was
belt-and-braces — skip the configured package by exact name *and* skip the
`@nera-static/theme-*` prefix. Implementation showed the exact-name skip is moot:
the plugin loader only ever considers dependencies under `@nera-static/`
(`setup-plugins.js:129`), so a third-party theme in another scope is never a
candidate for loading in the first place, and the only theme that can collide is
one matching the `@nera-static/theme-*` prefix. Skipping that prefix is therefore
complete on its own, and needs no knowledge of which theme is configured.

Verified end to end: an installed `@nera-static/theme-example` produces
`0 loaded, 0 failed` with no `❌ Failed to load npm plugin` line.

#### 1e. A theme is not a plugin

For v1 a theme package exports no hooks; `getAppData` / `getMetaData` in a theme
are ignored. A theme that needs logic ships a companion plugin. Keeping the seams
separate means the skip in 1d is unconditional and the theme layer stays purely
declarative. Revisit only if a concrete theme actually needs it.

### 2. Assets — **DECIDED 2026-07-22**

Assets layer exactly like views: **two-pass copy, theme first, site second, site
wins per file.** No special case for CSS, and no new configuration.

> An earlier draft of this section argued that file-level override was *wrong*
> for CSS, because a site overriding `main.css` to change one colour would lose
> every future fix. That framing was mistaken and is recorded here so it does not
> get re-proposed. The mechanism never forces that: a consumer who wants one
> colour changed does not override `main.css` at all. They keep the theme's
> stylesheet and add their own.

#### 2a. The consumer's path: add a file, don't replace one

Stated below in terms of CSS; 2c covers how it differs for JS.


```
<site>/theme/assets/css/custom.css        # new file, no theme counterpart
```

The site's `custom.css` is loaded *after* the theme's `main.css`, so ordinary
cascade order does the work — no merging, no token protocol, no generator
involvement. `main.css` stays un-overridden and keeps updating with the theme.

Two ways to get the `<link>` in, both already available:

- **Override `partials/head.pug`** and reference `custom.css` the way you would
  on any site. This needs nothing new — per-file view override already does it.
- **A theme-provided config key**, e.g. `extra_css:` in `theme.yaml`, iterated by
  the theme's own layout.

**The generator emits no markup either way.** If a theme offers `extra_css`, that
key belongs to the theme-authoring contract, not to the generator's config
schema, and another theme is free to name it differently or not offer it.

#### 2b. Recommended, not enforced

Token-driven CSS (custom properties in the theme sheet, overridden by the site's
sheet) and a small `head.pug` are **theme-authoring recommendations** — the same
approach `nera-website/DESIGN-BRIEF.md` describes ("hand-written CSS,
token-driven, no framework, no build step"). The generator does not check for
them, and a site that *does* wholesale-override `main.css` is making a legitimate
choice: it opts out of updates for that one file, which is the same trade the
whole design makes for views.

One authoring note worth writing into the theme contract: a theme should expose a
seam so the common case does not cost an override at all. A `head.pug` that
includes an intentionally-empty `partials/head-extra.pug` lets the site override
the empty seam instead of `head.pug` itself — so the site adds its stylesheet and
still receives theme updates to meta tags, favicons and font preloads. Same
pattern, one file further down.

#### 2c. JavaScript: same mechanism, weaker escape hatch

Everything in 2a applies unchanged to JS. The site adds
`theme/assets/js/custom.js`, does not override the theme's `main.js`, and gets it
in via the same two routes —
an overridden `partials/scripts.pug`, or a theme-provided key. The seam pattern
is the same: a `scripts.pug` before `</body>` that includes an empty
`partials/scripts-extra.pug`. Nera has no bundler and no build step, so assets
are copied raw and this is all plain `<script>` tags.

The asymmetry: **CSS gets ordering for free, JS does not.** A later stylesheet
*overrides* an earlier one through the cascade, so "add a sheet" genuinely
replaces behaviour. A later script does not override an earlier one — both simply
run. So a site that wants to *add* behaviour is well served, but a site that
wants to *change* theme behaviour has no equivalent escape hatch and is pushed
toward overriding `main.js` wholesale, which opts that file out of updates.

Authoring recommendations follow, all for the theme contract rather than the
generator:

- **Ship theme JS as ES modules** (`<script type="module">`). This is the
  load-bearing one — see below.
- **Emit theme scripts before the seam**, with consistent ordering, so site JS
  runs after the theme has initialised and can attach to it rather than race it.
  Modules defer by default, so a plain source-order include is enough.
- **Expose behaviour, not just markup** — configuration via `data-` attributes,
  or events dispatched on elements the theme controls, let a site adjust a
  component without replacing a file. This is the JS analogue of design tokens.

##### Why ES modules are the escape hatch

Module scope alone only solves *collisions* — the theme's and the site's
top-level declarations stop fighting over `window`. It gives no override
semantics; both modules still run.

What modules actually buy is **composability**, and it combines with per-file
override into something better than either alone. Non-module theme JS is opaque:
an IIFE that fires on load, take it or leave it. A theme that instead ships
**named exports plus a deliberately thin entry file** lets a site override only
the entry — ten lines — and compose the theme's own modules itself:

```js
// <site>/theme/assets/js/main.js  — overrides the theme's entry file, and only that
import { initNav, initSearch } from './modules/nav.js'  // theme's, unmodified
initNav({ sticky: false })
// initSearch() deliberately not called
```

The theme's `modules/*.js` are never overridden and keep updating via `npm
update`; only the ten-line entry point is forked. That is the same trade the rest
of this design makes, applied at the smallest possible unit — and it is only
available if the theme's JS is modular and side-effect-free outside its entry.

A corollary for theme authors: **keep side effects in the entry file.** A module
that auto-runs on import cannot be opted out of by a site that imports it.

#### 2d. `.neraignore`: unchanged — site's file, site's assets only

`.neraignore` exists so a site can keep *its own* junk out of `public/`: design
sources, unoptimised originals, `.DS_Store`. A theme is a published package whose
author already controls its payload through `files: ["views", "assets",
"config"]`, so if a theme ships a file it is meant to be served.

Decision: **no change.** The site's `.neraignore` filters the site's assets pass,
exactly as today; the theme's pass is unfiltered.

An earlier draft proposed applying the site's list to both roots so a site could
drop unused theme assets. Rejected: the benefit is disk space rather than
correctness, and excluding an asset the theme's CSS references produces a silent
404. Revisit only if a real site actually needs it.

**Settled 2026-07-23 (with the scaffold migration).** `copyFolder` gained an
optional `ignoreBase` argument (`render.js`): the site assets pass passes the
**site root** (`'.'`), so a site's `.neraignore` stays at the project root and
keeps filtering its assets even though they moved to `<site>/theme/assets`; the
theme pass passes `null`, so it is **unfiltered** — a theme package's payload is
author-controlled via `files:` and must not be dropped by anyone's `.neraignore`.
This both keeps the documented "`.neraignore` at the project root" contract and
closes the footgun where the theme pass would otherwise read `<pkg>/.neraignore`
off `path.dirname(sourceFolder)`. `watch-assets.js` reads from the site root too.

### 3. What else layers, and what doesn't — **DECIDED 2026-07-22**

Settled as a consequence of 1–5 rather than on its own.

Paths below are the **site side** (`<site>/theme/…`); the theme package provides
each from its own root (`<pkg>/…`), per §1b.

| Artifact | Layers? | Reasoning |
|---|---|---|
| `theme/views/**/*.pug` | **yes**, per file | the core of this proposal |
| `theme/assets/` | **yes**, per file | same rule as views; token-based CSS is an authoring recommendation, not a mechanism (§2) |
| `theme/views/vendor/**` | **n/a** | a theme never ships it (§4); the site's copies are the only ones that exist |
| `config/theme.yaml` | **yes**, deep-merged | the theme's defaults, overridden per key by the site (§1c); config stays at the site root, not under `theme/` |
| `config/cms.yaml` | **yes** | if adopted, the editing schema is part of the theme |
| `config/<plugin>.yaml` | **no** | `getConfig` reads the site's file wholesale; merging would change documented behaviour |
| `pages/` | **no** | seed content, copied once at scaffold; stays at the site root |

Note the deliberate asymmetry between the two `config/` rows: `theme.yaml` merges
and `<plugin>.yaml` does not. The reasoning is in §1c — it is intentional, not an
inconsistency to be tidied away.

### 4. `views/vendor/` and `publish-template` — **DECIDED 2026-07-22**

**`publish-template` does not change.** An earlier draft framed it as something
themes would make obsolete; that misread its purpose. It is a *scaffolder* — a
better alternative to "copy this snippet out of our README" — showing a consumer
how the plugin's data can be rendered, to be customised freely from there. It is
not an update channel, and no plugin template could fit an arbitrary theme
anyway. Its "already exists, skipping" behaviour is correct for a scaffolder:
declining to clobber a file you have since edited is the right call.

#### A theme must never ship `views/vendor/`

This is a hard rule, not a preference.

A theme that ships `views/vendor/plugin-tags/…` silently takes on a compatibility
obligation to that plugin's template contract. A theme supporting eight plugins
is then tracking eight independent semver streams, and every plugin major breaks
the theme. That is a maintenance explosion for a package whose job is
presentation. It is also a category error: `vendor/` means "copies of someone
else's files, published into my tree", and a theme's own files are not vendored.

**A theme's relationship to plugins is purely a CSS relationship.** Plugin
templates emit stable BEM class names, and `CLAUDE.md` already classifies
changing them as a **major** bump — so it is a real, semver-protected contract a
theme can style against. The theme ships CSS for `.tag-cloud__item` and never
touches a `.pug` file it does not own.

Consequences, all good:

- The precedence problem disappears. Nothing a theme ships can be shadowed by
  `publish-template`, because the theme ships nothing there.
- Section 5's compatibility surface shrinks to "which plugin majors does this
  theme's CSS target", which is exactly what a major bump already signals.
- Where a plugin's default markup genuinely cannot be styled acceptably, the
  **site** runs `publish-template` and edits it. That is a site-specific
  decision, made at the right layer, and a theme can document it ("if you use
  plugin-tags, publish its template and add `class="card"`").

An `eject`-style command that copies a file out of the *resolved* chain into the
site's `views/` — so you fork what you were actually rendering — remains worth
having for the theme's **own** views. It is no longer entangled with plugins, and
it is not a v1 blocker.

### 5. Compatibility declarations — **DECIDED 2026-07-22**

A theme's CSS targets plugin BEM class names, and `CLAUDE.md` classifies those
changes as **major**. So a theme must declare what it supports, and a mismatch
must be surfaced rather than rendering subtly-broken output.

Narrowed by section 4: since a theme never ships `views/vendor/`, its entire
plugin-facing surface is **CSS against BEM class names**. The declaration is
therefore a list of plugin majors the stylesheet targets — not a template
compatibility matrix — expressed as ordinary `peerDependencies` rather than a
new invented field.

#### Two mechanisms, and two different severities

| Mismatch | Declared via | On mismatch |
|---|---|---|
| plugin major | `peerDependencies` | **warn** |
| generator version | `nera.generator` | **fail** |

**Plugins warn** because the failure is cosmetic: the plugin renders its own
markup correctly and the theme simply has no CSS for the new class names. The
site is ugly in one region, not broken, and the user may not even use that
plugin's output on a page they care about. Hard-failing a build over styling
would be disproportionate — and npm already surfaces peer conflicts at install
time, which is the earlier and better moment.

**The generator fails** because that failure is not cosmetic. A theme built
against a newer generator may use a Pug feature, a resolution behaviour or an
`app.*` key that does not exist in the running one, which breaks rendering
rather than styling. This is also the case npm cannot catch (see section 7), so
the build is the only checkpoint there is.

`peerDependencies` covers **plugins only**. Per section 7, the generator is
not an npm package — it is git-cloned, and the name `nera` on npm belongs to a
third party — so generator compatibility cannot be expressed through npm at all.
It needs a field the generator itself reads, e.g.:

```json
{ "nera": { "generator": ">=5.0.0" } }
```

checked at build time by the generator, and at update time by `nera update`,
which is the moment the generator version actually changes. Two mechanisms for
two different things, each in the only place that can see them. To settle.

#### Designing `nera.generator` to survive section 8

The test: **can the field's value be moved verbatim into `peerDependencies` the
day the generator becomes an npm package?** If yes it is merely redundant then;
if it needs translating, it is wrong then.

Three rules that satisfy it:

- **A plain semver range**, standard npm semantics. No custom comparison scheme,
  no `min`/`max` pair.
- **Named for what it constrains** — the generator — not for how the generator is
  delivered today.
- **Checked against a version the generator reports about itself** (an exported
  constant, or its own `package.json`).

That third rule is the one with a trap in it. Today the site's `package.json`
`version` *is* the generator's version, because `mergePackageJson` copies it in
(`update.js:247` keeps the user's, `...newPackageJson` supplies it). And
`nera update` stamps `nera.version` (`update.js:269-272`). Both are tempting
sources and both are artefacts of the clone flow: after section 8 the site's
version and the generator's version are different numbers, so a check written
against either silently compares the wrong thing rather than failing loudly.

Migration on publishing day is then a move, not a rewrite:

```json
"nera": { "generator": ">=5.0.0" }
→ "peerDependencies": { "@nera-static/nera": ">=5.0.0" }
```

Same string. npm takes over enforcement, the generator's own check becomes
duplicate work that can be deprecated whenever convenient, and every existing
theme keeps working untouched.

### 6. Caching — **OPEN**

The only section still open, and deliberately so: it is an implementation
detail, best settled with a profiler on the implementation branch rather than on
paper.

The `resolve` hook fires for every `include`/`extends` in every page. It must
memoise, and it must not stat the filesystem repeatedly. Note `createHtmlFiles`
already re-runs `pug.compileFile` per page with no template cache — worth
measuring together rather than separately.

Constraint from the acceptance criteria: build time for `nera-website` must not
regress measurably. Take a baseline measurement *before* the first resolve hook
lands, or there is nothing to compare against.

### 7. Interaction with `nera update` — **DECIDED 2026-07-22**

**`npm update` is the whole story for updating a theme. `nera update` does not
touch themes.** A theme is an npm package; that is the entire point of the
design, and duplicating the update path in the installer would only create a
second way to get it wrong.

Verified against `nera-installer/src/update.js` — for the *old* root-`views/`
layout, all four things that could have broken this worked with no installer
change (the §1b revision changes this; see the revised note after the table):

| Behaviour | Effect on a themed site |
|---|---|
| `config/app.yaml` backed up and restored (`update.js:57,69`) | the `theme:` key survives |
| `views/` deliberately not updated (`update.js:60-63`) | the site's overrides survive |
| `assets/` backed up and restored | the site's assets survive |
| `dependencies` merged `{...current, ...new}` (`update.js:251`) | the theme dependency survives |

**REVISED 2026-07-23:** under the §1b layout the site's presentation is
`<site>/theme/` rather than root `views/`/`assets/`, so `update.js`'s hardcoded
`views`/`assets` paths in its backup, restore and "don't update" lists need
updating. During the deprecation window (Semver) a site may have **either**
layout, so the installer should back up/restore whichever exists — root
`views/`+`assets/` **or** `theme/` — and switch fully to `theme/` when the root
fallback is removed at the later major. So this section is no longer "no installer
change required." The *rationale* still holds and gets stronger — on a themed
site `theme/` contains nothing but the site's own layer and deliberate overrides.

**One behaviour to pin down deliberately:** the final step is `npm install`, not
`npm update` (`update.js:11`). With a lockfile present that respects the
lockfile, so `nera update` will not bump the theme. Keep it that way — a core
update silently changing a site's design is a bad surprise — but say so in the
docs and in the command's closing output, rather than leaving it as an accident
of implementation.

#### The one thing only the installer can do

**The generator is not an npm package.** It is distributed by git clone, and the
bare name `nera` on npm belongs to an unrelated third party. So a theme can
express plugin compatibility through `peerDependencies`, but has no way whatsoever
to express "requires generator >= 5.0" through npm.

That check has to live outside npm, and `nera update` — the command that changes
the generator version — is exactly when it matters. See section 5.

### 8. Adjacent: should the generator itself be an npm package?

**Out of scope here, but recorded — it is the same problem one layer up.**

`views/` is vendored into every site by git clone and can never be updated: that
is the fork-once problem this ROADMAP exists to fix. But `src/` is vendored by
the *same* clone with the same consequence. `nera update` exists only because
there is no `npm update` for the core.

It is not a publish, though — it is a re-architecture. Today `package.json` has
`main: index.js`, no `bin`, no `files`, and `scripts` that are *the site's*
scripts (`render`, `dev`, `serve`). A site does not depend on the generator; a
site **is** the generator with pages in it. Publishing that as-is would ship a
project scaffold to npm.

A real package would need:

- a `bin` (`nera-render`, `nera-dev`), so a site's scripts become `"render": "nera-render"`
- `files` scoped to `src/` and `index.js` — not `pages/`, `views/`, `assets/`, `config/`
- a scoped name, `@nera-static/nera` or `@nera-static/core`; bare `nera` is taken
- `nera new` scaffolding a thin project that *depends* on the package instead of cloning
- a migration for every existing site — and most of `update.js` deleted, its
  clone/backup/restore dance replaced by `npm update`

Mostly deletion, and it would make the generator version something npm can reason
about, retiring the second mechanism in section 5 entirely.

**Do not couple the two.** Themes ship on their own merits and must not wait for
this. The requirement it places on section 5 is only this: design the
`nera.generator` field so that publishing the generator later makes it
**redundant rather than wrong** — on that day it becomes an ordinary
`peerDependency` and nothing about themes has to change.

---

## Semver — **REVISED 2026-07-23**

The layered *resolution* is additive. The §1b folder move would be breaking on its
own — but the **deprecated root fallback** (§1b note) keeps the introducing
release **non-breaking (minor)**: a site with no `theme/` folder falls back to
root `views/`/`assets/` and renders exactly as today, with a deprecation warning.
New and migrated sites use `<site>/theme/`.

The break is therefore **deferred**, not avoided: a **later major** removes the
root fallback. Sequencing:

- **minor** — introduce `<site>/theme/` resolution + the deprecated root
  fallback; the generator scaffolds the new shape, so `nera new` produces
  `theme/`-shaped sites (not born deprecated); `nera update` handles both
  layouts (§7). This is non-breaking because the fallback still renders every
  unmigrated site byte-identically, with a deprecation warning.
- **major** (later) — remove the fallback; require `<site>/theme/`. By then
  existing sites must have migrated (`views/` → `theme/views/`, `assets/` →
  `theme/assets/`); `nera update` drops its legacy `views`/`assets` path lists.

The installer gaining a `--theme` flag is a separate, additive change — nearly
free, since `create.js:28` already accepts a `repoUrl` option and
clones-then-strips `.git`.

---

## Why this is worth doing regardless of the platform

This was surfaced while planning the hosted CMS platform
(`nera-platform/plans/04-themes.md`), where maintainable themes are the product
for non-technical users. But it stands alone: **every Nera user benefits from a
presentation layer that can be updated**, and nothing here depends on the
platform existing. It can ship first, on its own merits.

---

## Acceptance criteria

The `[x]` items below are implemented and verified against the **revised** §1b
layout (the refactor landed 2026-07-23): the theme payload sits at the package
root, the site groups its presentation under `<site>/theme/`, and a deprecated
root fallback keeps existing sites byte-identical. The remaining `[ ]` items are
genuinely unimplemented (§5 compatibility, §6 caching) or not yet exercised by an
actual `npm update`.

- [x] A site renders from `<site>/theme/` when that folder exists; a site with
  neither `theme/` nor a `theme:` package falls back to root `views/`/`assets/`
  and renders **byte-identically to today**, with a one-time deprecation warning
  *(§1b root fallback — verified e2e: re-homing the same content under `theme/`
  with no `theme:` key produced byte-identical output and suppressed the warning)*
- [x] A themed site resolves layouts/partials through `[<site>/theme-or-root, <pkg>]`,
  the package providing them from its root *(verified e2e against
  `@nera-static/theme-example`)*
- [x] `theme: docs`, `theme: @acme/my-theme` and a local path all resolve, and a
  local theme behaves identically to an installed one *(resolver now targets the
  package root directly — §1b refactor landed)*
- [x] A `theme:` naming a package that is not installed fails loudly with an
  actionable message and a non-zero exit code — it does not render an unstyled site
- [x] A site `config/theme.yaml` setting one key inherits every other key from the
  theme's own defaults, exposed to templates as `app.theme.config` *(§1c —
  verified e2e against `@nera-static/theme-example`: a site override of
  `colors.primary` won while `label` fell through to the theme default; unit +
  fixture + `run()` tests cover the merge semantics)*
- [x] A file placed in the site's `theme/views/` overrides the theme package's
  copy of that file, and only that file *(verified e2e: a site
  `theme/views/partials/header.pug` won while the layout and footer fell through
  to the theme package)*
- [ ] `npm update` of the theme package changes the rendered output for
  non-overridden files, and does not change it for overridden ones *(follows from
  the resolution model; not yet exercised by an actual `npm update`)*
- [x] Assets from the theme reach `public/`, with site assets winning on conflict
  *(verified: theme `main.css` reached `public/css/`; unit test confirms the
  site's `theme/assets` wins a same-path collision)*
- [ ] A site adding `theme/assets/css/custom.css` with no theme counterpart gets
  it copied, and the theme's `main.css` still updates via `npm update`
- [x] The site's `.neraignore` filters its own assets, and a theme's assets are
  copied whole *(§2d settled: `.neraignore` stays at the site root; the theme
  pass is unfiltered — verified in render.test.js and theme.test.js)*
- [ ] A theme whose `nera.generator` range excludes the running generator fails the
  build with a clear message; a theme whose plugin `peerDependencies` are
  unsatisfied warns and renders *(§5 — not yet implemented)*
- [x] No `❌ Failed to load npm plugin` line appears for the theme package
- [ ] Build time for `nera-website` does not regress measurably *(§6 — needs a
  baseline before caching work)*
