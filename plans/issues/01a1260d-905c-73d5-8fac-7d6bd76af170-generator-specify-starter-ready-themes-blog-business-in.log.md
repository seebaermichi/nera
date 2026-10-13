# Work log — 01a1260d-905c-73d5-8fac-7d6bd76af170-generator-specify-starter-ready-themes-blog-business-in

- **Issue:** `01a1260d-905c-73d5-8fac-7d6bd76af170`

## Issue snapshot (2026-10-13)

- **Id:** `01a1260d-905c-73d5-8fac-7d6bd76af170`
- **Type:** feature
- **Group:** Parallel: themes and plugins
- **Status:** in_progress
- **Title:** [generator] Specify starter-ready themes (blog, business) in ROADMAP-themes

Spec: `nera-cli/ROADMAP-ai.md` — L5.

Extend `generator/ROADMAP-themes.md` with the themes the starters need; theme repos as `nera-theme-*` siblings.

## Cloud launch (2026-10-13)

- **Worked in a Claude Code cloud session**, outside the local plan → implement → review → approve loop (to use the cloud credit). The gate was not armed.
- **Brief:** `plans/cloud/01a1260d-905c-73d5-8fac-7d6bd76af170-brief.md` · **Branch:** `issue/01a1260d-starter-themes` · **Session:** launched by the user (URL to be added)
- **Decisions given to the cloud (maintainer, 2026-10-13):** themes named by purpose (`theme-business`, `theme-blog`); portfolio reuses a theme (likely business), no third theme; neutral, distinct look per theme on `config/theme.yaml` tokens, no font/script CDN.
- **On return:** `/work-issue-cloud 01a1260d-905c-73d5-8fac-7d6bd76af170` — verify locally, triage, merge, reconcile (spec note in `nera-cli/ROADMAP-ai.md` L5), resolve.

## Cloud result (2026-10-13)

- **Branch:** `issue/01a1260d-starter-themes` (identical to `claude/starter-ready-themes-t0g847`) · 8 commits · result file `plans/cloud/01a1260d-905c-73d5-8fac-7d6bd76af170-result.md`
- **Summary:** New section "Starter-ready themes" (S1–S9) at the end of `ROADMAP-themes.md` plus one status-header pointer. It specifies `theme-business` (business + portfolio) and `theme-blog`: package shape, views/blocks/seams, token set → `--theme-*`, `t()` keys, a11y/privacy guarantees, page types, plugin classes, semver/release, starter duties, acceptance, open questions T1–T5.
- **Verified locally (Node 22.22.0):** `npm run lint` clean; `npx vitest run` 140/140; `git diff main --stat` = the two files only.
- **Verified locally:** independent class grep over fresh `npm pack` tarballs: 48/51 literal, the 3 plugin-navigation classes computed from `navBlock` default `'nav'` (as S8 says); peer floors = current npm latest; `a11y-h1`/`a11y-nav-name`/`legal-imprint-link` exist in validate 1.4.2; canonical-links default `page_identifier: slug`; core passes `basedir: viewsFolder` (absolute `/vendor/…` includes work); plugin-images ships `picture` mixin; page-pagination `<nav>` has no `aria-label`; contact-form is `mailto:` (no third-party request).
- **Review findings:** none blocking. Spec-only; nothing rendered with Pug yet (cloud's own hint).

### Decisions
- Starter `blank` uses no theme; `portfolio` uses `theme-business` (list + gallery views).
- `nera.generator: ">=4.15.0"`, no upper bound; peer floors = verified release, all optional.
- Conventional `layouts/layout.pug` / `pages/default.pug` paths; `nera new --theme` already skips scaffold defaults.
- Plugin output only through seam partials the site overrides; theme never reads plugin data.
- One token set → inline `<style>:root{…}` with value filter; `theme.css` repeats defaults as `var()` fallbacks.
- Theme keys `extra_css` (root-absolute only) and `footer_links` (legal links).
- Business facts under `app.business` in `config/app.yaml`.
- One `<h1>` per page; page bodies start at `##`; blog tag page's seam owns the `<h1>`.
- Language switch by `meta.slug`, else language home.
- No theme JS, no font files, no dark mode in 1.0; no theme-shipped translations (T3).
- Blog posts selected by `blog.post_layouts`; no paged lists (T1).
- Raising `nera.generator` floor or dropping a plugin major = major; token default change = minor.

### Carry forward
- `ROADMAP-themes.md:3-11, 87-104` stale status header (slice-1 branch, "not npm-published", installer).
- `ROADMAP-themes.md` §1b stale "must be refactored" note.
- `ROADMAP-themes.md` §5/§7/§8 still describe the git-clone generator and installer `nera update`.
- `src/render.js:452` themed site without own views folder renders nothing (T2).
- plugin-page-pagination `<nav>` lacks `aria-label` (`a11y-nav-name`).
- plugin-page-navigation / plugin-navigation `simpleNav`/`pipeSeparatedNav` emit unlabelled `<nav>`s.
- plugin-social-media-links always `target="_blank"`; ships `fontawesome-cdn-link.pug`.
- plugin-tags `tag-overview.pug` hard-codes `Read more`; plugin-search hard-codes `Search`/`Search...` and an `<h1>`.
- theme-example 0.1.3 `config/theme.yaml` stale "not wired up yet" comment.

## Triage (2026-10-13)

Maintainer: "Fix all of them now" (2026-10-13). All nine carry-forwards fixed, none filed.

| # | Carry-forward | Verdict | Done in |
|---|---|---|---|
| 1–3 | `ROADMAP-themes.md` stale header, §1b note, §5/§7/§8 pre-consolidation wording | fix | `generator` c4942b3: dated "Current state" paragraph, §1b done note |
| 4 | T2: themed site without own views folder renders nothing | fix | `generator` b7d3038, core **4.16.0** (minor) + 3 tests |
| 5 | plugin-page-pagination unlabelled `<nav>` | fix | `nera-plugin-page-pagination` 34a1add, **2.4.0** (`aria-label=t('Pagination')`) |
| 6 | plugin-page-navigation / plugin-navigation unlabelled `<nav>` | fix | `nera-plugin-page-navigation` 99bdb9a **2.5.0**; `nera-plugin-navigation` 279cea8 **3.1.0** (`label` mixin arg) |
| 7 | plugin-social-media-links `target="_blank"` + Font Awesome CDN | fix | `nera-plugin-social-media-links` dc14130 **2.3.0** (`open_in_new_tab`; CDN template deprecated, removal in 3.0.0) |
| 8 | plugin-tags hard-coded `Read more` | fix | `nera-plugin-tags` 6f48af1 **3.3.0** (`t('Read more')`); search half already resolved (01a133d2) |
| 9 | theme-example stale theme.yaml comment | fix | `nera-theme-example` b2d90f1 **0.1.4** |

Spec follow-up: `generator` 7fe90ac — S6 items 4–5 and S8 point at the new plugin releases (raise theme peer floors when the theme repos are built).
