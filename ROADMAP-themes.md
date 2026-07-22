# Roadmap — installable, updatable themes

**Status:** design seed, nothing implemented. Written 2026-07-22.

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

## Open questions

### 1. Discovery

How does the generator know which theme a site uses?

`setup-plugins.js:118-127` loads **every** dependency starting with
`@nera-static/` as a plugin and calls `import()` on it. A theme package would be
picked up, fail to import (no JS entry point), and log
`❌ Failed to load npm plugin theme-docs` on every build.

So discovery needs an explicit decision. Candidates:

- **`theme:` key in `config/app.yaml`** — explicit, swappable in one line, and
  independent of dependency-name conventions. Requires excluding the named
  package from plugin discovery.
- **`@nera-static/theme-*` name convention** — no config, but couples discovery
  to naming and still needs the plugin loader to skip the prefix.

Leaning: explicit `theme:` key, plus a prefix skip in `setup-plugins.js` so a
stray theme dependency never produces a scary log line.

### 2. Assets need a *different* strategy than templates

Two-pass copy (theme first, site second, site wins) is a small additive change to
`copyFolder`. But **file-level override is wrong for CSS.** If a theme ships
`main.css` and the site overrides it to change one colour, every future CSS fix
is lost — and CSS is the most-customised file in any theme.

Wanted instead: the theme's stylesheet exposes design tokens (custom properties);
the site adds an *additional* sheet rather than replacing one. That is already
the approach `nera-website/DESIGN-BRIEF.md` describes ("hand-written CSS,
token-driven, no framework, no build step").

Open: does the generator enforce/encourage this, or is it purely a theme-authoring
convention? Note `.neraignore` is read from `path.dirname(sourceFolder)`
(`render.js:15`) and will need care with two source roots.

### 3. What else layers, and what doesn't

| Artifact | Layers? | Reasoning |
|---|---|---|
| `views/**/*.pug` | **yes**, per file | the core of this proposal |
| `assets/` | **yes**, but token-based for CSS | see above |
| `config/cms.yaml` | **yes** | if adopted, the editing schema is part of the theme |
| `config/<plugin>.yaml` | **no** | `getConfig` reads the site's file wholesale; merging would change documented behaviour |
| `pages/` | **no** | seed content, copied once at scaffold |

### 4. `views/vendor/` and the future of `publish-template`

A theme will want to ship *styled* versions of plugin templates. Today users run
`npm run publish-template` to copy them into `views/vendor/<plugin>/` and then
style them by hand.

If a theme provides `views/vendor/plugin-tags/…`, the resolution chain covers it
and **`publishTemplates` becomes largely unnecessary for themed sites** — which
also removes the "already exists, skipping" trap. Worth deciding whether that is
an explicit goal or an accident to be managed.

### 5. Compatibility declarations

A theme's CSS targets plugin BEM class names, and `CLAUDE.md` classifies those
changes as **major**. So a theme must declare which plugin majors and which
generator version it supports, and a mismatch should warn rather than render
subtly-broken HTML.

### 6. Caching

The `resolve` hook fires for every `include`/`extends` in every page. It must
memoise, and it must not stat the filesystem repeatedly. Note `createHtmlFiles`
already re-runs `pug.compileFile` per page with no template cache — worth
measuring together rather than separately.

### 7. Interaction with `nera update`

`nera-installer`'s `update` command updates the generator core in a project.
Themes introduce a second updatable layer. Decide whether `nera update` touches
themes, or whether `npm update` is the whole story.

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

- A site with no `theme:` configured renders byte-identically to today
- A site with a theme renders layouts and partials from the theme package
- A file placed in the site's `views/` overrides the theme's copy of that file,
  and only that file
- `npm update` of the theme package changes the rendered output for
  non-overridden files, and does not change it for overridden ones
- Assets from the theme reach `public/`, with site assets winning on conflict
- No `❌ Failed to load npm plugin` line appears for the theme package
- Build time for `nera-website` does not regress measurably
