# Roadmap — installable, updatable themes

**Status:** design settled (2026-07-22, sections 1–5, 7, 8; section 6 caching
deferred). **Implementation in progress on `feat/themes-slice-1`.**

Shipped so far, proven end to end against `@nera-static/theme-example`
(`../nera-theme-example`, installed via a `file:` dependency):

- **Slice 1** — layered view resolution: layouts and partials resolve through
  `[site, theme]`, site overrides per file (`render.js` `makeLayeredResolver` /
  `resolveEntry`; `theme.js` `resolveTheme`).
- **Slice 2** — themes as real npm packages: bare-name and `@scope` resolution
  from `node_modules`, the plugin-loader prefix skip (§1d), and two-pass asset
  copy with the site winning collisions (§2).

Still open: `config/theme.yaml` merge + `app.theme.config` exposure (§1c),
compatibility checks (§5), caching (§6).

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

| value | resolves to (a **package root**) |
|---|---|
| `docs` | `@nera-static/theme-docs` |
| `@acme/my-theme` — contains `/` or starts with `@` | verbatim package name |
| `.` — starts with `.` | path relative to `process.cwd()` |

Every form resolves to a **package root**, never to the payload directly. The
payload always lives under the root's `theme/` wrapper (§1b), so resolution
appends `theme/views`, `theme/assets`, `theme/config/theme.yaml` in all three
cases. That symmetry is the point: local and npm themes resolve through the exact
same join, so they cannot drift. Developing a theme in place therefore uses
`theme: .` (payload at `<cwd>/theme/`, alongside the site's own `<cwd>/views/`);
a private theme vendored into a subfolder uses `theme: ./path/to/it`.

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

#### 1b. Package layout — payload under `theme/`

The theme's payload lives in a `theme/` folder, not at the package root:

```
# installed                              # local (in development, or private)
node_modules/@nera-static/theme-docs/    <site>/
  theme/                                   theme/
    views/                                   views/
    assets/                                  assets/
    config/theme.yaml                        config/theme.yaml
  package.json                             package.json
```

The wrapper folder is what makes the local case possible at all — at the package
root, `views/` would collide with the site's own `views/`. With `theme/`, both
cases have an identical shape, so there is one resolution chain and no branching:
site `views/` → theme `theme/views/`, site `assets/` → theme `theme/assets/`.
This mirrors the generator's existing dual discovery for plugins (`src/plugins/*`
local, `@nera-static/*` from npm), and it means developing a theme against a real
site no longer requires `npm link`.

It also separates payload from package furniture (README, tests, eslint config,
`.github/`) and makes `files: ["theme"]` a single entry.

**Locating an installed theme on disk:** a theme has no JS entry point, so
`import()` is not available. Resolve `<pkg>/package.json` and take its dirname.
Theme packages must therefore either omit `exports` or explicitly include
`"./package.json"` in it — a constraint for the theme-authoring contract, worth
writing down before the first theme exists.

#### 1c. `config/theme.yaml` — optional, and **merged** with the theme's defaults

The theme ships `theme/config/theme.yaml` containing real defaults; the site's
`config/theme.yaml` is optional and deep-merges over it. Objects merge per key,
arrays are replaced wholesale, the site wins at the leaf.

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
<site>/assets/css/custom.css        # new file, no theme counterpart
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

Everything in 2a applies unchanged to JS. The site adds `assets/js/custom.js`,
does not override the theme's `main.js`, and gets it in via the same two routes —
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
// <site>/assets/js/main.js  — overrides the theme's entry file, and only that
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
author already controls its payload through `files: ["theme"]`, so if a theme
ships a file it is meant to be served.

Decision: **no change.** The site's `.neraignore` filters the site's assets pass,
exactly as today; the theme's pass is unfiltered.

An earlier draft proposed applying the site's list to both roots so a site could
drop unused theme assets. Rejected: the benefit is disk space rather than
correctness, and excluding an asset the theme's CSS references produces a silent
404. Revisit only if a real site actually needs it.

One implementation footgun to avoid: `getIgnoredFiles` derives its location from
`path.dirname(sourceFolder)` (`render.js:36`), so calling `copyFolder` on the
theme root as-is would read `<pkg>/theme/.neraignore` and apply it to that pass —
undocumented behaviour nobody asked for. Pass the ignore list in, or skip it for
the theme pass.

### 3. What else layers, and what doesn't — **DECIDED 2026-07-22**

Settled as a consequence of 1–5 rather than on its own.

| Artifact | Layers? | Reasoning |
|---|---|---|
| `views/**/*.pug` | **yes**, per file | the core of this proposal |
| `assets/` | **yes**, per file | same rule as views; token-based CSS is an authoring recommendation, not a mechanism (§2) |
| `views/vendor/**` | **n/a** | a theme never ships it (§4); the site's copies are the only ones that exist |
| `config/theme.yaml` | **yes**, deep-merged | the theme's defaults, overridden per key by the site (§1c) |
| `config/cms.yaml` | **yes** | if adopted, the editing schema is part of the theme |
| `config/<plugin>.yaml` | **no** | `getConfig` reads the site's file wholesale; merging would change documented behaviour |
| `pages/` | **no** | seed content, copied once at scaffold |

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

#### A theme must never ship `theme/views/vendor/`

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

Verified against `nera-installer/src/update.js` — all four things that could have
broken this already work, with no installer change required:

| Behaviour | Effect on a themed site |
|---|---|
| `config/app.yaml` backed up and restored (`update.js:57,69`) | the `theme:` key survives |
| `views/` deliberately not updated (`update.js:60-63`) | the site's overrides survive |
| `assets/` backed up and restored | the site's assets survive |
| `dependencies` merged `{...current, ...new}` (`update.js:251`) | the theme dependency survives |

The `views/` exclusion deserves a note: its existing rationale ("a Nera site is a
clone of the generator, so `views/layouts/layout.pug` is the user's own site
layout") still holds under themes, and gets *stronger* — on a themed site
`views/` contains nothing but deliberate overrides.

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

## Semver

The generator change is **additive**: a site with no theme configured resolves
exactly as today, from its own `views/` only. That makes it a **minor** bump,
with no migration required.

The installer gaining a `--theme` flag is likewise **minor** — and nearly free,
since `create.js:28` already accepts a `repoUrl` option and clones-then-strips
`.git`.

---

## Why this is worth doing regardless of the platform

This was surfaced while planning the hosted CMS platform
(`nera-platform/plans/04-themes.md`), where maintainable themes are the product
for non-technical users. But it stands alone: **every Nera user benefits from a
presentation layer that can be updated**, and nothing here depends on the
platform existing. It can ship first, on its own merits.

---

## Acceptance criteria

Checked items are implemented and verified (test + end-to-end against
`@nera-static/theme-example`).

- [x] A site with no `theme:` configured renders byte-identically to today —
  including when a `./theme` folder happens to exist
- [x] A site with a theme renders layouts and partials from the theme package
- [x] `theme: docs`, `theme: @acme/my-theme` and `theme: .` all resolve, and a
  locally-developed theme behaves identically to an installed one
- [x] A `theme:` naming a package that is not installed fails loudly with an
  actionable message and a non-zero exit code — it does not render an unstyled site
- [ ] A site `config/theme.yaml` setting one key inherits every other key from the
  theme's own defaults *(§1c — not yet implemented)*
- [x] A file placed in the site's `views/` overrides the theme's copy of that file,
  and only that file
- [ ] `npm update` of the theme package changes the rendered output for
  non-overridden files, and does not change it for overridden ones *(follows from
  the resolution model; not yet exercised by an actual `npm update`)*
- [x] Assets from the theme reach `public/`, with site assets winning on conflict
- [x] A site adding `assets/css/custom.css` with no theme counterpart gets it
  copied, and the theme's `main.css` still updates via `npm update`
- [x] The site's `.neraignore` filters its own assets exactly as today, and a
  theme's assets are copied whole
- [ ] A theme whose `nera.generator` range excludes the running generator fails the
  build with a clear message; a theme whose plugin `peerDependencies` are
  unsatisfied warns and renders *(§5 — not yet implemented)*
- [x] No `❌ Failed to load npm plugin` line appears for the theme package
- [ ] Build time for `nera-website` does not regress measurably *(§6 — needs a
  baseline before caching work)*
