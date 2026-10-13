# Issue conventions

Review rules for work on `@nera-static/core` (the Nera engine), run through Snagio
from `generator/`. The Snagio project **"Nera AI"** tracks `../nera-cli/ROADMAP-ai.md`;
its issues carry the target repo as a title prefix (`[generator] …`). **Work an issue
only from the repo it names**: the step skills commit in the current repo.

The workspace `../CLAUDE.md` holds the fleet-wide rules (semver, CHANGELOG,
releases, the plugin contract, the pipeline); this file only adds what a reviewer
checks per diff.

## Non-negotiables

- **The specs in this repo are single sources of truth:** `ROADMAP-themes.md`
  (themes, incl. the starter-ready themes for `ROADMAP-ai.md` L5) and
  `ROADMAP-core.md` (the consolidation record). A decision made while working an
  issue is written back into the spec in the same commit, never only into the issue.
  Extend them, never fork them; a spec section that `ROADMAP-ai.md` points to stays
  where the pointer expects it.
- **Semver + `CHANGELOG.md` in the same commit as the change** (Keep a Changelog,
  four-space bullets, `**BREAKING**:` prefix). Bump with
  `npm version <bump> --no-git-tag-version`, never by hand-editing `package.json`.
  The public contract is wide: the exports of `src/index.js`, the plugin hooks
  (`getAppData`/`getMetaData`/`getAssets`, their arguments, awaiting, order), the
  `app`/`meta` shape pages and plugins see, `config/app.yaml` keys, the view/asset
  resolution order (site → theme → core), and the rendered output. Classify by what an
  existing site, plugin or theme would notice. Spec, test, CI and `.claude/` changes
  ship nothing and get no release.
- **The version line continues** (4.x): theme `nera.generator` ranges depend on it.
  A rising Node floor follows the real dependencies (`^20.19.0 || >=22.0.0` today).
- **Never publish or push.** No `npm publish`, no `git push`, no tags pushed, no
  posts anywhere public. Releases go out from CI on a pushed `v*` tag; the session
  hands over the exact commands.
- **A themeless site renders byte-identically** after any theme/resolver change;
  additive behaviour stays opt-in.
- Paste-ready text for the maintainer goes in a fenced code block between
  `----- START: … -----` and `----- END -----` lines, never in a blockquote.

## Framework correctness

- ESM only; eslint style: 4-space indent, no semicolons, single quotes. No new
  runtime dependency without a stated reason: every Nera site installs this package.
- `files` in `package.json` lists what ships; a new `src/` module is added there or
  it is missing from the tarball.
- Pages without `layout` are never rendered; `public/` is deleted on every render, so
  nothing writes there before stage 4 (plugins use `getAssets`).
- `createdAt`/`date` come from frontmatter before file birth time (CI stamps every
  file the same date).
- A plugin hook with the wrong return shape is dropped with a warning, never a crash;
  keep that, and keep warnings specific (what, where, what to do).

## UI / template rules

- The bundled demo site's views live in `theme/views/` (Pug). A theme spec names the
  views, includes and blocks a theme must provide and the classes sites style; for a
  published theme, markup and BEM class changes are major.
- Interface language of messages and docs: English.

## UI walkthrough

The engine has no interactive UI; a browser test is normally skipped. When one is
wanted (a theme or render change):

- Browser tooling: Playwright MCP (`mcp__playwright__browser_navigate`,
  `mcp__playwright__browser_snapshot`, `mcp__playwright__browser_console_messages`).
- Boot: `npm run render && npx vite --port 3124` (the bundled demo site).
- Base URL / login: http://localhost:3124/, no login.
- Surfaces:
    | surface | url | role | how to open |
    |---|---|---|---|
    | demo home page | `/` | visitor | open the URL |

## Tests & hygiene

- `npx vitest run && npm run lint` must pass (`npm test` is watch mode, never use it
  here). Run from the package root. Tests live in `src/test/`.
- New behaviour has a test: unit tests for the resolver and site model, integration
  tests that build a throwaway site in a temp directory through `run()`. No network.
- Generate the lockfile with npm ≥ 10.9 (Node 22,
  `PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH`).

## Reconciliation steps (run when resolving an issue)

- Version bump + `CHANGELOG.md` entry in the change's commit, if it ships in the
  tarball; none for specs, tests, CI or `.claude/`.
- Update the spec the issue named (status, date, decisions) and, when an `L<n>` item
  of `ROADMAP-ai.md` moves, its status in `../nera-cli/ROADMAP-ai.md` (a commit in
  that repo).
- New theme repos are flat `nera-theme-<name>` siblings set up per "Starting a new
  repo for a Snagio issue" in `../CLAUDE.md`; file their work as `[nera-theme-<name>]`
  issues rather than building them from here.
- Hand over the release commands (`git push`, `git tag -a v<x.y.z> …`); do not run
  them.
- If the release changes a config key or default, a command, template markup or
  paths, `app.*`/`meta.*` output or a hook (minor or major): check the nera.js.org
  tutorials that stamp this package (`grep -l 'core:'
  ../nera-website/pages/tutorials/*.md`) — still right → bump their
  `verified_with`; stale → fix in en/de/es or file a `[nera-website] Tutorial …`
  issue. See "Check the tutorials too" in `../CLAUDE.md` and `/tutorial-review`.
- Remove the issue's plan files last, once nothing else needs them:
  `git rm` its tracked files under `plans/` (`plans/issues/<id>-*`,
  `plans/issues/browser-tests/<id>-*`, `plans/cloud/<id>-*`), delete the
  untracked ones, and commit
  `chore(plan): remove the plan files of the resolved <short title> issue`.
  Git history keeps them; `plans/` holds only open issues.
