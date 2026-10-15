# Plan: [generator] Fleet: apply npm pkg fix (./bin paths, git+ repository URLs) in 21 package.json files, and catch it in fleet-check

- **Issue:** `01a13a8e-5fc5-702e-a3c9-bab3ebdfb1c3`
- **Type:** improvement
- **Plan written:** 2026-10-14

## Context

`npm publish` warns "npm auto-corrected some errors in your package.json" in 21 published
Nera repos, because their `bin` values start with `./` and/or their `repository.url` lacks
the `git+` prefix. `npm pkg fix` produces the normalized form. The issue asks for that form
in every repo (committed to `main`, no release — the published manifests are already
cleaned by npm) and for a regression check in `scripts/fleet-check.sh`, which the weekly
`fleet-check.yml` runs against each repo's GitHub HEAD. A survey on 2026-10-14 (`npm pkg fix`
on a temp copy of each `package.json`) confirmed the issue's list exactly: `npm pkg fix`
changes only `bin` values and `repository.url`; the lockfiles' root `bin` is already in the
normalized form. `nera-website` has neither field and is clean.

## Design decisions

**D1 — The fleet-check rule is two explicit tests in node, not a diff against `npm pkg fix`.** A `bin` value (string or object) starting with `./`, or a `repository.url` (object or string shorthand) without `git+`, is a gap; absent fields are fine.

**D2 — The rule runs for every checked repo that has a `package.json`, reported only.** Not gated on "published on npm" like the badges; `--fix` does not touch it (it needs a commit).

**D3 — fleet-check first, then the sweep in four batches, then docs.** The check is verified red against today's HEAD, and green once the user has pushed the sweep.

**D5 — `nera-installer` is swept too (22 repos).** It is public and not archived, so fleet-check checks it and would stay red otherwise; same one-commit fix, no release.

**D4 — The session commits; the user pushes.** Per the non-negotiable "never push", each sweep step ends with paste-ready push commands; "pushed + `test.yml` green" and the green fleet-check are verified after the user's push, in the docs step.

## Acceptance criteria

- [ ] In each of the 21 repos (plus `nera-installer`, D5), `npm publish --dry-run` prints no `npm auto-corrected some errors` warning.
- [ ] Each repo's diff touches only `bin` and/or `repository.url` in `package.json`, `npm ci` still passes, committed and pushed to `main`, its `test.yml` green.
- [ ] `scripts/fleet-check.sh` reports a repo with a `./bin/…` path or a URL without `git+` as a gap, and reports none once the sweep is done.
- [ ] The workspace `CLAUDE.md` lists the new fleet-check item where it lists the others.

## Steps

<!-- Ladder: 3 Behaviour (fleet-check rule) → 3 Behaviour (sweep, 4 batches) → 5 Docs -->

**Sibling inventory — non-normalized `bin`/`repository.url`** (`for r in …; do cp $r/package.json $t/; (cd $t && npm pkg fix); diff $r/package.json $t/package.json; done`, survey 2026-10-14)

| call site | same defect? | handled in |
|---|---|---|
| `generator`, `nera-highlightjs-pug`, `nera-plugin-one-page`, `nera-plugin-utils` | url only | Step 2 |
| `nera-cli`, `nera-validate`, `-canonical-links`, `-code-blocks`, `-contact-form` (2 bins), `-images` | bin + url | Step 3 |
| `-link-attributes`, `-navigation`, `-page-navigation`, `-page-pagination`, `-popular-content`, `-search` | bin + url | Step 4 |
| `-simple-page-list`, `-social-media-links` (2 bins), `-stacks`, `-statistics`, `-tags` | bin + url | Step 5 |
| `nera-plugin-feed`, `-sitemap`, `nera-theme-example`, `nera-website` | no — already clean / no such fields | — |
| `nera-plugin-main-navigation` | archived, excluded by fleet-check's listing | — |
| `nera-installer` | yes — bin + url (deprecated, but public and non-archived, so fleet-check checks it; not in the issue's list) | Step 2 (D5) |

### Step 1 — fleet-check flags a non-normalized `bin` path or `repository.url` — ✅ done

- **Goal:** `scripts/fleet-check.sh` reports `package.json: bin "./…"` and/or `package.json: repository.url without git+` per repo, counted as gaps, never `FIXED`; the header comment lists the new baseline item.
- **Files:** `scripts/fleet-check.sh` — reuse the `raw "$r" package.json` fetch (fetch once, feed both the name lookup and the new check)
- **Verify:** `bash -n scripts/fleet-check.sh && bash scripts/fleet-check.sh nera-plugin-tags nera-plugin-utils nera-plugin-contact-form nera-plugin-feed nera-website` — tags and contact-form report both items, utils only the url, feed and website report no package.json item; exit code 1. Also feed a crafted manifest (string `bin`, string `repository`, no `repository`) through the node snippet by hand and see the right verdicts.
- **Review hardest:** a repo without `package.json` (`.github`) or with unparsable JSON must not produce a false gap or a crash under `set -u`; string vs object forms of `bin`/`repository`.
- **Risks:** fetching `package.json` once for both checks keeps the raw.githubusercontent.com calls unchanged; `nera-installer` will show a gap until Step 2 (D5).
- **Walkthrough:** none

### Step 2 — Apply `npm pkg fix` in the four url-only repos and nera-installer — ✅ done

- **Goal:** `generator`, `nera-highlightjs-pug`, `nera-plugin-one-page`, `nera-plugin-utils` (url only) and `nera-installer` (bin + url) each have one commit `chore(package): apply npm pkg fix` on `main`, touching only those fields.
- **Files:** `package.json` in each of the five repos
- **Verify:** per repo: `git status --porcelain` empty before; `npm pkg fix && git diff --stat` → only `package.json`, `git diff` → only the url line; `npm publish --dry-run 2>&1 | grep -c 'auto-corrected'` → `0`; `npm ci && npx vitest run && npm run lint` pass (highlightjs-pug: also `npm run build` leaves `dist/` unchanged)
- **Review hardest:** `generator` has untracked `plans/` and `.claude/.work-issue-active` — commit `package.json` alone, nothing else.
- **Risks:** `npm publish --dry-run` must never become a real publish — type `--dry-run` every time. Use npm ≥ 10.9 (Node 22 PATH) for consistency with the lockfiles.
- **Walkthrough:** none

### Step 3 — Apply `npm pkg fix` in nera-cli, nera-validate and four plugins — ✅ done

- **Goal:** `nera-cli`, `nera-validate`, `nera-plugin-canonical-links`, `-code-blocks`, `-contact-form`, `-images` each have the commit, touching only `bin` values and `repository.url`.
- **Files:** `package.json` in each of the six repos
- **Verify:** as Step 2, per repo; plus `node bin/<the bin file> --help` or the repo's bin test still runs (nera-cli: `npx vitest run` covers `bin/nera.js`)
- **Review hardest:** `-contact-form` has two bin entries — both normalized; `nera-validate` showed a dirty tree/unpushed commit in the survey — inspect and leave unrelated work out of the commit.
- **Risks:** a bin path change could break a test that reads `pkg.bin` literally — the tests catch it.
- **Walkthrough:** none

### Step 4 — Apply `npm pkg fix` in six more plugins — ✅ done

- **Goal:** `-link-attributes`, `-navigation`, `-page-navigation`, `-page-pagination`, `-popular-content`, `-search` each have the commit.
- **Files:** `package.json` in each of the six repos
- **Verify:** as Step 2, per repo
- **Review hardest:** `-search` has one unpushed `chore(claude)` commit already on `main` — it rides along with the push; say so in the hand-over. `-page-pagination`'s field order differs (url before bin) — diff must still be two lines.
- **Risks:** none beyond Step 2's.
- **Walkthrough:** none

### Step 5 — Apply `npm pkg fix` in the last five plugins — ✅ done

- **Goal:** `-simple-page-list`, `-social-media-links`, `-stacks`, `-statistics`, `-tags` each have the commit; all 22 repos are done.
- **Files:** `package.json` in each of the five repos
- **Verify:** as Step 2, per repo; then the survey loop from the sibling inventory prints no change for any of the 22 repos
- **Review hardest:** `-social-media-links` has two bin entries — both normalized.
- **Risks:** none beyond Step 2's.
- **Walkthrough:** none

### Step 6 — Document the new fleet-check item and hand over the push — ✅ done

- **Goal:** the workspace `CLAUDE.md` paragraph on `fleet-check.sh` names the `package.json` check; the user has the paste-ready push commands for all 22 repos and, after pushing, `bash scripts/fleet-check.sh` reports all repos meet the baseline and every `test.yml` is green.
- **Files:** `../CLAUDE.md` (workspace root, untracked)
- **Verify:** `grep -n 'npm pkg fix' ../CLAUDE.md`; after the user's push: `bash scripts/fleet-check.sh` → `all … repos meet the baseline`; `for r in …; do gh run list -R seebaermichi/$r -w test.yml -L 1; done` → all `success`
- **Review hardest:** fleet-check reads GitHub HEAD, so it stays red until the push — do not mark the AC done before the user confirms the push.
- **Risks:** an unrelated pre-existing gap (e.g. a badge) would keep fleet-check red — report it separately, not as this issue's failure.
- **Walkthrough:** none
