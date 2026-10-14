# Work log — 01a13a8e-5fc5-702e-a3c9-bab3ebdfb1c3-generator-fleet-apply-npm-pkg-fix-bin-paths-git-repository

- **Issue:** `01a13a8e-5fc5-702e-a3c9-bab3ebdfb1c3`

## Issue snapshot (2026-10-14)

- **Id:** `01a13a8e-5fc5-702e-a3c9-bab3ebdfb1c3`
- **Type:** improvement
- **Group:** —
- **Status:** in_progress
- **Title:** [generator] Fleet: apply npm pkg fix (./bin paths, git+ repository URLs) in 21 package.json files, and catch it in fleet-check

## Today
`npm publish` (also `--dry-run`) prints in nearly every published Nera package: "npm auto-corrected some errors in your package.json … Please run `npm pkg fix`" — `bin[...]` script name was cleaned, `repository.url` was normalized to `git+https://…` (reproduced 2026-10-14 in `nera-plugin-tags`, npm 10.9.4). Two causes, both fixed by `npm pkg fix`:

1. `bin` paths written `"./bin/…"` — npm wants `"bin/…"`.
2. `repository.url` written `"https://github.com/…/<repo>.git"` — npm wants `"git+https://github.com/…/<repo>.git"`.

- **both** (`./bin` + url), 17 repos: `nera-cli` (`nera`), `nera-validate`, `nera-plugin-canonical-links`, `-code-blocks`, `-contact-form` (also its `publish-template` bin), `-images`, `-link-attributes`, `-navigation`, `-page-navigation`, `-page-pagination`, `-popular-content`, `-search`, `-simple-page-list`, `-social-media-links` (also its `publish-template` bin), `-stacks`, `-statistics`, `-tags`.
- **url only**, 4 repos: `generator`, `nera-highlightjs-pug`, `nera-plugin-one-page`, `nera-plugin-utils`.
- **already clean:** `nera-plugin-feed`, `nera-plugin-sitemap`, `nera-theme-example`. `nera-plugin-main-navigation` is archived — leave it alone.

## Instead
Every published `package.json` is in the form `npm pkg fix` produces, so `npm publish` prints no auto-correct warning, and new repos can't bring the old form back.

## Why
Cosmetic: published manifests are already corrected by npm on publish; but the warning shows on every release and hides real publish warnings.

## Where
- Each repo's `package.json` (`bin`, `repository.url`) — run `npm pkg fix`, check the diff touches only those two fields.
- `generator/scripts/fleet-check.sh` — add a read-only check (`raw()` already fetches files from each repo's HEAD) flagging a `bin` value starting with `./` or a `repository.url` lacking `git+`, so the weekly `fleet-check.yml` catches a regression.

## Release rule
No release owed. Commit straight to `main` in each repo (`chore(package): apply npm pkg fix`), push. Do not tag. `fleet-check.sh` change is CI tooling — no core release.

## Acceptance criteria
- [ ] In each of the 21 repos, `npm publish --dry-run` prints no `npm auto-corrected some errors` warning.
- [ ] Each repo's diff touches only `bin` and/or `repository.url` in `package.json` (no lockfile change — `npm ci` still passes), committed and pushed to `main`, its `test.yml` green.
- [ ] `fleet-check.sh` reports a repo with a `./bin/…` path or a URL without `git+` as a gap, and none once the sweep is done.
- [ ] If the workspace `CLAUDE.md` mentions the fleet-check items, add the new one there.

## Out of scope
- Any version bump, tag or npm release.
- Other `package.json` inconsistencies under "Known inconsistencies" (`files`/`bin` coverage, `prepare` scripts).

## Issue description (snapshot had none) (2026-10-14)

Today: `npm publish` warns "npm auto-corrected some errors in your package.json" in 21 repos (`./bin/…` bin paths, `repository.url` without `git+`). Instead: every published package.json is in `npm pkg fix` form, and `scripts/fleet-check.sh` flags a regression. Release rule: none — commit `chore(package): apply npm pkg fix` to main in each repo, no tag. AC: no auto-correct warning in `npm publish --dry-run`; diff only bin/repository.url, `npm ci` passes, pushed, test.yml green; fleet-check reports the gap and none after the sweep; workspace CLAUDE.md mentions the new item. Out of scope: version bumps, other package.json inconsistencies.

## Decision (2026-10-14)

**Survey (2026-10-14).** `npm pkg fix` on a temp copy of each package.json changes only `bin` values and `repository.url`, matching the issue's list exactly; lockfile root `bin` is already normalized (checked plugin-tags), so no lockfile change. `nera-website` has neither field.

**D1 — explicit two-rule node check, not a diff against `npm pkg fix`.** Running `npm pkg fix` in a temp dir per repo would mirror npm exactly, but needs npm in the check, a temp dir per repo, and would start flagging whatever future npm versions decide to normalize — an unpredictable weekly failure. Two explicit rules say exactly what the baseline is. Cost: another normalization npm adds later is not caught.

**D2 — every repo with a package.json, report only.** Gating on "published on npm" (like badges) would skip nera-website/unpublished repos for no gain; absent fields are not gaps. `--fix` would need a commit per repo, so like badges it only reports.

**D3 — fleet-check before the sweep.** Lets the check be verified red against today's GitHub HEAD; the sweep turns it green after push. Four batches of ≤ 6 repos keep each step reviewable.

**D4 — session commits, user pushes.** generator's non-negotiable forbids `git push`; the issue's "pushed" AC is verified after the user runs the handed-over commands (Step 6).

**D5 — nera-installer included.** Not in the issue's list, but public and non-archived (`gh api` → archived false, private false), so fleet-check checks it and would never go green; same defect (bin + url). The issue's own AC3 wins over its list.

## Step 1 — started (2026-10-14)

base_sha: c6fc2e24d9f0ed5d87cda140f180b5e931db62d1
mode: fresh

## Step 1 — implemented (2026-10-14)

base_sha: c6fc2e24d9f0ed5d87cda140f180b5e931db62d1

### Changed
- `scripts/fleet-check.sh` — header lists the new baseline item and that `--fix` only reports it; new `pkg_fix_check` node snippet (stdin manifest → one gap line per finding: `package.json: bin "<paths>"` deduped, `package.json: repository.url without git+`); `package.json` is fetched once into `$pkg` and feeds both the name lookup (badges) and the new check; findings go into `problems` without `FIXED`, so they count as gaps.

### Fixed alongside
- none

### Carry forward
- none

### Verification
```
bash -n scripts/fleet-check.sh → syntax-ok
bash scripts/fleet-check.sh nera-plugin-tags nera-plugin-utils nera-plugin-contact-form nera-plugin-feed nera-website →
nera-plugin-tags                         package.json: bin "./bin/publish-template.js";package.json: repository.url without git+
nera-plugin-utils                        package.json: repository.url without git+
nera-plugin-contact-form                 package.json: bin "./bin/publish-template.js", "./bin/publish-template.js";package.json: repository.url without git+
fleet-check: 5 open gap(s)
exit=1
(after deduping the bin list) bash scripts/fleet-check.sh .github nera-plugin-contact-form →
nera-plugin-contact-form                 package.json: bin "./bin/publish-template.js";package.json: repository.url without git+
fleet-check: 2 open gap(s)
exit=1      (.github: no package.json → no line, no crash under set -u)
Crafted manifests through the snippet (extracted from the script):
{"bin":"./cli.js","repository":"github:a/b"}                     → bin "./cli.js" | repository.url without git+
{"bin":"cli.js","repository":"git+https://github.com/a/b.git"}   → nothing
{"name":"x"}                                                     → nothing
{"bin":{"a":"./x.js","b":"./x.js","c":"y.js"},"repository":{"type":"git","url":"https://…"}} → bin "./x.js" | repository.url without git+
{"repository":{"type":"git"}}                                    → nothing
not json / empty                                                 → nothing
```
shellcheck is not installed here, so not run; no JS files changed, so eslint does not apply.

### Self-critique
- Kept the `[ -n "$pkg" ]` guard although the snippet already prints nothing for empty input: it saves a node spawn per manifest-less repo and makes the "no package.json" path obvious.
- A string `repository` shorthand (`github:a/b`, `a/b`) is reported as "repository.url without git+" — `npm pkg fix` rewrites it to an object with a `git+https` URL, so it is a real gap, but the wording says `.url` for a field that is a string. Considered a separate message; rejected as noise (D1 treats both forms as one rule).
- Unparsable JSON is silent (no gap). An unparsable manifest on `main` would be caught by `test.yml` (`npm ci` fails) long before this; reporting it here would duplicate that.
- Least sure: `raw` failing for a transient network reason yields an empty `$pkg`, i.e. a silent pass for that repo — same behaviour the badge check already had, not a false gap.

### Pressure-test questions for the reviewer
1. Does the `while read … < <(node …)` loop work on macOS bash 3.2 under `set -uo pipefail` with an empty `problems` array for a clean repo (verified: feed/website print nothing, exit path unchanged)?
2. Is `startsWith("git+")` the right test for every URL form `npm pkg fix` leaves alone (e.g. `git+ssh://`) and flags (e.g. `git://`, `git@github.com:`)?
3. Is the raw.githubusercontent.com call count truly unchanged (one `package.json` fetch per repo, as before)?

## Step 1 — reviewed (2026-10-14)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- `scripts/fleet-check.sh:39` — `pkg_fix_check` crashed with a TypeError stack trace on a manifest that parses to a non-object (`null`); added `if(!p||typeof p!=="object")return` and widened the comment on line 38 to say so (+1/−1 net per line, 2 lines) — snippet fed `null`, `5`, `{"bin":"./cli.js","repository":"github:a/b"}`, `{"name":"x"}` → nothing, nothing, both gaps, nothing; Verify command re-run → same output as before, exit=1

### Fixed alongside
- none

### Carry forward
- none

### Checked
goal (header item, per-repo gap lines, counted as gaps, never FIXED) · `bash -n` + Verify run under /bin/bash 3.2.57 (tags/contact-form both items, utils url only, feed/website/.github silent, "5 open gap(s)", exit=1) · crafted manifests incl. git+ssh, git://, git@, string/object/null bin+repository · Non-negotiables / Framework correctness / Tests & hygiene (script + .claude only: no release, no push; no JS in src, eslint/vitest n/a) · scope: only scripts/fleet-check.sh · self-critique claims verified · walkthrough n/a

### Answers to the pressure-test questions
1. Yes. `bash` here is /bin/bash 3.2.57; the Verify run printed nothing for nera-plugin-feed, nera-website and .github and finished with exit=1 and no unbound-variable error. The `while read … < <(node …)` loop with an empty `problems` array works because the existing `${#problems[@]}` guard was already there.
2. Yes for the fleet. `npm pkg fix` on `"repository":"git+ssh://git@github.com/a/b.git"` leaves the URL alone (it only turns the string into an object), and the snippet does not flag it. `git://…` and `git@github.com:…` are both flagged. Edge case per D1: a *string* `repository` that already has `git+` is not flagged, although `npm pkg fix` would turn it into an object. No repo in the workspace uses a string `repository`, so this has no effect today.
3. Yes. Before the change there was one `raw "$r" package.json` per repo, piped straight into the name lookup. After it there is still one, stored in `$pkg` and passed to both node snippets through here-strings. README is still fetched only for published packages.

## Step 1 — approved (2026-10-14)

snagio: ticked
