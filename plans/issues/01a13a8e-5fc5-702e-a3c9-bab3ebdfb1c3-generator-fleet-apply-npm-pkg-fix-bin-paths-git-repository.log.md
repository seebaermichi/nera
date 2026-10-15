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
commit: f7fdcd5

## Step 2 — started (2026-10-15)

base_sha: f7fdcd501e2b3e990a29b4a6d1528cab602611ce
mode: fresh

## Step 2 — implemented (2026-10-15)

base_sha: f7fdcd5

Commits (one per repo, `package.json` only, not pushed):
- `generator` d2f3c5d · `nera-highlightjs-pug` 272dba1 · `nera-plugin-one-page` acda7a6 · `nera-plugin-utils` a142828 · `nera-installer` 7884a57

### Changed
- `generator/package.json` — `repository.url` → `git+https://github.com/seebaermichi/nera.git`
- `nera-highlightjs-pug/package.json` — `repository.url` → `git+…/nera-highlightjs-pug.git`
- `nera-plugin-one-page/package.json` — `repository.url` gains the `git+` prefix
- `nera-plugin-utils/package.json` — `repository.url` gains the `git+` prefix
- `nera-installer/package.json` — `bin.nera` `./bin/cli.js` → `bin/cli.js`, `repository.url` gains `git+`

All five produced by `npm pkg fix` (npm 10.9.4, Node 22); 4-space indent and trailing newline preserved (diff is exactly the url/bin lines).

### Fixed alongside
- none

### Carry forward
- none

### Verification
```
npm pkg fix && git diff --stat → package.json only, 1 line (installer: 2 lines) in each repo
npm publish --dry-run 2>&1 | grep -c 'auto-corrected' → 0 in all five (installer before the fix: 1 — the check is live)
npm ci → ok ×5
generator            Tests  143 passed (143)   lint ok
nera-highlightjs-pug Tests  70 passed (70)     lint ok   npm run build → dist/ unchanged (git status clean)
nera-plugin-one-page Tests  29 passed (29)     lint ok
nera-plugin-utils    Tests  57 passed (57)     lint ok
nera-installer       Tests  26 passed (26)     lint ok
git show --stat HEAD → 1 file changed in each repo; generator's plans/ and .claude/.work-issue-active left uncommitted
```

### Self-critique
- Commit body names the field(s) changed per repo and states "no release" so nobody tags it later; considered no body, rejected — the "why no bump" is the non-obvious part.
- Not pushed (non-negotiable). fleet-check reads GitHub HEAD, so its green is verified in Step 6 after the user's push, per D4.
- Least sure: whether `bin` without `./` still installs the `nera` shim for the deprecated installer — npm documents `bin/cli.js` as the canonical form and that is what the registry already holds, so consumers see no change.

### Pressure-test questions for the reviewer
1. Does each of the five commits touch `package.json` alone (`git -C ../<repo> show --stat HEAD`)?
2. Is generator's commit d2f3c5d free of the plan/log files and `.claude/.work-issue-active`?

Push commands for the user (also printed):
----- START: push step 2 -----
cd ~/workspace/nera/generator && git push
cd ~/workspace/nera/nera-highlightjs-pug && git push
cd ~/workspace/nera/nera-plugin-one-page && git push
cd ~/workspace/nera/nera-plugin-utils && git push
cd ~/workspace/nera/nera-installer && git push
----- END -----

## Step 2 — rebased (push rejected) (2026-10-15)

The user's `git push` in `generator` was rejected: GitHub `main` had 3 Dependabot merges (2026-10-14, `package-lock.json` only). Rebased the unpushed local commits onto `origin/main` in the four repos that were behind (no conflicts: our commits touch `package.json` alone), re-ran `npm ci`, the tests and lint against the new lockfiles, and `npm publish --dry-run`: all green, 0 auto-corrected warnings.

New SHAs (they replace the ones above):
- `generator`: Step 1 f7fdcd5 → 9340942, Step 2 d2f3c5d → 506d89d; base for review is 9340942 (Step 2 diff = `git diff 9340942 506d89d`)
- `nera-plugin-one-page` acda7a6 → 1055c4a · `nera-plugin-utils` a142828 → a6069ab · `nera-installer` 7884a57 → 2da3441
- `nera-highlightjs-pug` 272dba1 unchanged (was not behind)

## Step 2 — reviewed (2026-10-15)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- none

### Fixed alongside
- none

### Carry forward
- none

### Checked
Goal: each of the five repos has one `chore(package): apply npm pkg fix` commit touching `package.json` only (generator 506d89d, highlightjs-pug 272dba1, one-page 1055c4a, utils a6069ab, installer 2da3441 — the post-rebase SHAs from the "rebased" log section; the inputs' base_sha f7fdcd5 is the pre-rebase Step 1 commit, so the step diff was taken as `git diff 9340942 506d89d` → `package.json` 1 line). Verify, run by the reviewer with npm 10.9.4 / Node 22: `npm pkg fix` → no diff ×5; `npm publish --dry-run | grep -c auto-corrected` → 0 ×5; `npm ci` ok ×5; vitest 143/70/29/57/26 passed; lint ok ×5; highlightjs-pug `npm run build` leaves the tree clean. Conventions: no version bump or CHANGELOG is right, since a package.json metadata normalization ships nothing and npm already holds the corrected form. Push: the reflogs show `update by push` at 09:54, after the log's handover (09:49) and the user's rejected push, so the user pushed, not the session; all five remotes match HEAD. Self-critique: the installer's `bin/cli.js` without `./` is the form npm itself normalizes to, and the registry already serves it, so consumers see no change. Note (cosmetic, already pushed, not worth a rewrite): the installer commit body has literal backslashes around `bin`. Walkthrough n/a.

### Answers to the pressure-test questions
1. Yes. `git show --stat HEAD` → `package.json | 2 +-` in generator, highlightjs-pug, one-page and utils, and `package.json | 4 ++--` in installer. The diffs are exactly the url line(s), plus the bin line in installer.
2. Yes. 506d89d (the rebased d2f3c5d) changes only `package.json`. `plans/…` stays modified and `.claude/.work-issue-active` stays untracked in the working tree.

## Step 2 — approved (2026-10-15)

snagio: ticked
commit: b4f5c4e

## Step 3 — started (2026-10-15)

base_sha: b4f5c4ec9dd8bebf38de8965748c4483588c0e0b
mode: fresh

## Step 3 — implemented (2026-10-15)

base_sha: b4f5c4e

Commits (one per repo, `package.json` only, not pushed):
- `nera-cli` 2d3ff44 · `nera-validate` af4ff73 · `nera-plugin-canonical-links` 97cb7e7 · `nera-plugin-code-blocks` dc306f5 · `nera-plugin-contact-form` 58d932a · `nera-plugin-images` c42f764

Before the sweep, `nera-cli`, `-canonical-links` and `-contact-form` were behind `origin/main` (Dependabot merges); fetched and `pull --ff-only` first so the commits sit on the remote tip and the user's push fast-forwards. `nera-validate` was clean and in sync (the survey's dirty tree/unpushed commit is gone — v1.4.3 has been pushed since), so nothing unrelated could enter its commit.

### Changed
- `nera-cli/package.json` — `bin.nera` `./bin/nera.js` → `bin/nera.js`; `repository.url` gains `git+`
- `nera-validate/package.json` — `bin.nera-validate` drops `./`; `repository.url` gains `git+`
- `nera-plugin-canonical-links/package.json` — `bin.nera-canonical-links` drops `./`; `repository.url` → `git+…/nera-plugin-canonical-links.git`
- `nera-plugin-code-blocks/package.json` — `bin.nera-code-blocks` drops `./`; `repository.url` → `git+….git`
- `nera-plugin-contact-form/package.json` — both bin entries (`publish-template`, `nera-contact-form`) drop `./`; `repository.url` gains `git+`
- `nera-plugin-images/package.json` — `bin.nera-images` drops `./`; `repository.url` → `git+….git`

All produced by `npm pkg fix` (npm 10.9.4, Node 22). Three urls also gained the `.git` suffix — that is npm's own normalization, still only the url line.

### Fixed alongside
- none

### Carry forward
- debt · S · `nera-installer` 7884a57 (Step 2, unpushed) — its commit body reads `\`bin\` without \`./\`` with literal backslashes (shell escaping leaked in); cosmetic, could be fixed with `git commit --amend` before the push — not this step's commit (decision)

### Verification
```
npm publish --dry-run 2>&1 | grep -c 'auto-corrected' → before: 1, after: 0 in all six
npm pkg fix && git diff --stat → package.json only; 2 lines changed (contact-form: 3)
npm ci → ok ×6
nera-cli                    Tests  221 passed (221)   lint ok
nera-validate               Tests  158 passed (158)   lint ok
nera-plugin-canonical-links Tests  23 passed (23)     lint ok
nera-plugin-code-blocks     Tests  102 passed (102)   lint ok
nera-plugin-contact-form    Tests  46 passed (46)     lint ok
nera-plugin-images          Tests  264 passed (264)   lint ok
node bin/nera.js --help → "Nera — the static site generator CLI / Usage:"
node bin/nera-validate.js (in nera-validate) → "✓ No problems found."
grep tests/src for literal pkg.bin / './bin/' reads → none in all six
git show --stat HEAD → 1 file changed in each repo; git status --porcelain → empty ×6
```

### Self-critique
- Pulled before committing rather than committing on stale HEADs; the alternative (user resolves on push) would make the paste-ready push fail. `--ff-only` so nothing was merged or rewritten.
- Did not run the plugins' `publish-template`/`publish-config` bins: they copy files into cwd; the tests cover them and the path change does not affect how `node` resolves them.
- Least sure: nothing in the diff — it is exactly npm's output. The one open point is the Step 2 commit-message cosmetics (carried forward).

### Pressure-test questions for the reviewer
1. Does each of the six commits touch `package.json` alone (`git -C ../<repo> show --stat HEAD`)?
2. Are both `nera-plugin-contact-form` bin entries normalized (`git -C ../nera-plugin-contact-form show HEAD`)?
3. Is each repo exactly one commit ahead of `origin/main` (`git -C ../<repo> status -sb`)?

Push commands for the user:
----- START: push step 3 -----
cd ~/workspace/nera/nera-cli && git push
cd ~/workspace/nera/nera-validate && git push
cd ~/workspace/nera/nera-plugin-canonical-links && git push
cd ~/workspace/nera/nera-plugin-code-blocks && git push
cd ~/workspace/nera/nera-plugin-contact-form && git push
cd ~/workspace/nera/nera-plugin-images && git push
----- END -----

## Decision (2026-10-15)

Who pushes the Step 3 sweep commits? → the session pushes them (the user asked explicitly, overriding the "never push" non-negotiable for these commits). Pushed 2026-10-15: nera-cli 2d3ff44, nera-validate af4ff73, -canonical-links 97cb7e7, -code-blocks dc306f5, -contact-form 58d932a, -images c42f764; all six now in sync with origin/main.

## Step 3 — reviewed (2026-10-15)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- none

### Fixed alongside
- none

### Carry forward
- none (the Step 2 `nera-installer` commit-message cosmetics is already carried by the implementer)

### Checked
Goal: six commits, `package.json` only, each changing only `bin` values (`./` dropped) and `repository.url` (`git+` prefix, `.git` suffix where missing) — `git show HEAD -U0` per repo confirms exactly those lines · Verify re-run with Node 22: `npm publish --dry-run | grep -c auto-corrected` → 0 ×6; `npx vitest run` → 221/158/23/102/46/264 passed, `npm run lint` ok ×6; `node bin/nera.js --help` → "Nera — the static site generator CLI"; no literal `pkg.bin`/`'./bin/` reads in test/src · conventions: Non-negotiables (no release owed — metadata-only, npm already auto-corrected these at publish, so the published tarballs are unchanged; no CHANGELOG/bump needed), Framework correctness (n/a), Tests & hygiene (suites pass) · self-critique: pull --ff-only before committing verified by each commit's parent being the former remote tip; nera-validate clean (porcelain empty) · generator diff since b4f5c4e touches only the plan/log files · walkthrough n/a (`none`).
Note: at review time all six repos are already at `origin/main` (HEAD == origin/main, nothing ahead) — the commits have been pushed since the implementer's report; the "push step 3" commands are no longer needed.

### Answers to the pressure-test questions
1. Yes — `git show --stat HEAD` → `package.json | 1 file changed` in all six (2 insertions/2 deletions; contact-form 3/3).
2. Yes — both `publish-template` and `nera-contact-form` go `./bin/publish-template.js` → `bin/publish-template.js` in 58d932a.
3. Not one ahead any more: each HEAD equals `origin/main` (2d3ff44, af4ff73, 97cb7e7, dc306f5, 58d932a, c42f764) — already pushed; working trees clean.

## Step 3 — approved (2026-10-15)

snagio: ticked
commit: d96c9f2

## Step 4 — started (2026-10-15)

base_sha: d96c9f2b2136d9408e5816557430f81faf753c90
mode: fresh

## Step 4 — implemented (2026-10-15)

base_sha: d96c9f2

Commits (one per repo, `package.json` only, not pushed):
- `nera-plugin-link-attributes` d71e442 · `-navigation` e2e4ce3 · `-page-navigation` 3971b72 · `-page-pagination` 6537a10 · `-popular-content` ee8017f · `-search` 51e9e3d

All six were behind `origin/main` by 2–3 Dependabot commits; the five clean ones were `pull --ff-only`ed first. `-search` had diverged (its local `chore(claude)` commit 3590a28, touching only `.claude/`, vs. two Dependabot commits touching deps): rebased that unpushed commit onto `origin/main` (now 096f1d7, no conflict), so the push fast-forwards and carries both commits.

### Changed
- `nera-plugin-link-attributes/package.json` — `bin.nera-link-attributes` drops `./`; `repository.url` → `git+….git`
- `nera-plugin-navigation/package.json` — `bin.nera-navigation` drops `./`; `repository.url` gains `git+`
- `nera-plugin-page-navigation/package.json` — `bin.nera-page-navigation` drops `./`; `repository.url` → `git+….git`
- `nera-plugin-page-pagination/package.json` — `repository.url` → `git+….git` (comes first, field order url-before-bin kept); `bin.nera-page-pagination` drops `./`
- `nera-plugin-popular-content/package.json` — `bin.nera-popular-content` drops `./`; `repository.url` gains `git+`
- `nera-plugin-search/package.json` — `bin.nera-search` drops `./`; `repository.url` gains `git+`

All produced by `npm pkg fix` (npm 10.9.4, Node 22).

### Fixed alongside
- none

### Carry forward
- none (Step 3's `nera-installer` commit-message cosmetics still stands)

### Verification
```
npm publish --dry-run 2>&1 | grep -c 'auto-corrected' → before: 1, after: 0 in all six
npm pkg fix && git diff --stat → package.json | 4 ++-- (2 lines) in all six, incl. page-pagination
npm ci → ok ×6
nera-plugin-link-attributes Tests  15 passed (15)  lint ok
nera-plugin-navigation      Tests  36 passed (36)  lint ok
nera-plugin-page-navigation Tests  24 passed (24)  lint ok
nera-plugin-page-pagination Tests  28 passed (28)  lint ok
nera-plugin-popular-content Tests  20 passed (20)  lint ok
nera-plugin-search          Tests  67 passed (67)  lint ok
grep test/tests/src for literal pkg.bin / './bin/' → none in all six
git show --stat HEAD → 1 file changed, 2 insertions(+), 2 deletions(-) ×6; git status --porcelain → empty ×6
status -sb → ahead 1 ×5; -search ahead 2 (chore(claude) + this)
```

### Self-critique
- Rebasing `-search`'s unpushed commit changes its sha (3590a28 → 096f1d7); acceptable since it was never pushed, and the alternative (a merge commit, or a push that fails non-fast-forward) is worse.
- Least sure: nothing in the diffs — they are npm's own output. Pre-commit hooks ran lint again on commit, green.

### Pressure-test questions for the reviewer
1. Does each of the six commits touch `package.json` alone, two lines (`git -C ../<repo> show --stat HEAD`)?
2. Is `-search`'s extra commit only `.claude/` (`git -C ../nera-plugin-search show --stat HEAD~1`) and the repo exactly 2 ahead, 0 behind?
3. Are the five others exactly 1 ahead, 0 behind `origin/main`?

Push commands for the user (`-search` also pushes its `chore(claude)` commit):
----- START: push step 4 -----
cd ~/workspace/nera/nera-plugin-link-attributes && git push
cd ~/workspace/nera/nera-plugin-navigation && git push
cd ~/workspace/nera/nera-plugin-page-navigation && git push
cd ~/workspace/nera/nera-plugin-page-pagination && git push
cd ~/workspace/nera/nera-plugin-popular-content && git push
cd ~/workspace/nera/nera-plugin-search && git push
----- END -----

## Step 4 — reviewed (2026-10-15)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- none

### Fixed alongside
- none

### Carry forward
- none

### Checked
goal (six commits present, `package.json` only, 2+/2− each) · Verify re-run in all six under Node 22: `npm publish --dry-run | grep -c auto-corrected` → 0 ×6; `npm pkg fix` → working tree clean ×6; `npx vitest run` → 15/36/24/28/20/67 passed; `npm run lint` → ok ×6 · conventions Non-negotiables (no push/publish/tag; no release owed — npm already published the corrected form, commit message says so; START/END block for the hand-over) · self-critique (search rebase 3590a28 → 096f1d7 never pushed, fine) · walkthrough n/a (none)

### Answers to the pressure-test questions
1. Yes. `git show --stat HEAD` → `package.json | 4 ++--`, 1 file, 2 insertions, 2 deletions in all six (d71e442, e2e4ce3, 3971b72, 6537a10, ee8017f, 51e9e3d). page-pagination's hunks are `repository.url` (line ~39) then `bin` (line ~63) — field order kept, still two lines.
2. Yes. `nera-plugin-search` HEAD~1 = 096f1d7 `chore(claude): …` touching only `.claude/issue-conventions.md` and `.claude/skills/plan-issue/SKILL.md`; after `git fetch`, `rev-list --left-right --count origin/main...HEAD` → `0 2`.
3. Yes. After `git fetch`, `0 1` for link-attributes, navigation, page-navigation, page-pagination, popular-content; `git status --porcelain` empty in all six.

## Step 4 — approved (2026-10-15)

snagio: ticked
commit: 48e36c9

## Step 5 — started (2026-10-15)

base_sha: 48e36c9
mode: fresh

## Step 5 — implemented (2026-10-15)

base_sha: 48e36c9

Commits (one per repo, `package.json` only, not pushed):
- `nera-plugin-simple-page-list` e31e1e7 · `-social-media-links` 03f940e · `-stacks` 3f6abe6 · `-statistics` c86342c · `-tags` e93e31b

All five were clean and 3 Dependabot commits behind `origin/main`; each was `pull --ff-only`ed first, so every repo is now exactly 1 ahead, 0 behind.

### Changed
- `nera-plugin-simple-page-list/package.json` — `bin.nera-simple-page-list` drops `./`; `repository.url` gains `git+`
- `nera-plugin-social-media-links/package.json` — both bin entries (`publish-template`, `nera-social-media-links`) drop `./`; `repository.url` → `git+….git`
- `nera-plugin-stacks/package.json` — `bin.nera-stacks` drops `./`; `repository.url` gains `git+`
- `nera-plugin-statistics/package.json` — `bin.nera-statistics` drops `./`; `repository.url` → `git+….git`
- `nera-plugin-tags/package.json` — `bin.nera-tags` drops `./`; `repository.url` → `git+….git`

All produced by `npm pkg fix` (npm 10.9.4, Node 22).

### Fixed alongside
- none

### Carry forward
- none. (Step 3's `nera-installer` commit-message cosmetics still stands.) The survey also flags `nera-plugin-main-navigation` (archived, out of scope), `pug` (read-only upstream clone) and `nera-theme-blog`. For `nera-theme-blog`, `npm pkg fix` only re-expands inline JSON objects: its url already has `git+` and it has no `bin`, so the D1 rule passes and nothing is owed.

### Verification
```
npm publish --dry-run 2>&1 | grep -c 'auto-corrected' → before: 1, after: 0 in all five
git diff --stat → package.json | 4 ++-- ×4; social-media-links package.json | 6 +++--- (two bin lines + url)
npm ci → ok ×5
nera-plugin-simple-page-list   Tests  22 passed (22)  lint ok
nera-plugin-social-media-links Tests  25 passed (25)  lint ok
nera-plugin-stacks             Tests  27 passed (27)  lint ok
nera-plugin-statistics         Tests  37 passed (37)  lint ok
nera-plugin-tags               Tests  79 passed (79)  lint ok
grep test/tests/src for pkg.bin / './bin/ → none ×5
git status -sb → [ahead 1] ×5, porcelain empty ×5
survey (npm pkg fix on a temp copy, every sibling with package.json + .git, 31): clean for all 22 in scope; CHANGED only main-navigation, nera-theme-blog (format only), pug
```

### Self-critique
- Same mechanics as Step 4; the diffs are npm's own output. Pre-commit hooks re-ran lint on commit, green.
- Least sure: whether `nera-theme-blog`'s format-only `npm pkg fix` delta could trip the publish warning. It can't: npm warns about corrections (bin/url/etc.), not formatting, and fleet-check's two explicit tests (D1) pass for it.

### Pressure-test questions for the reviewer
1. Does `-social-media-links` normalize **both** bin entries (`git -C ../nera-plugin-social-media-links show HEAD`)?
2. Is each of the five commits `package.json` alone and each repo exactly 1 ahead, 0 behind?
3. Does the survey really show all 22 in-scope repos clean?

## Step 5 — reviewed (2026-10-15)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- none

### Fixed alongside
- none

### Carry forward
- none

### Checked
goal (five commits e31e1e7/03f940e/3f6abe6/c86342c/e93e31b, each `package.json` only, 1 ahead/0 behind origin/main) · survey loop (npm 10.9.4, 31 siblings) → clean for all 22 in scope, CHANGED only main-navigation, nera-theme-blog, pug · `npm publish --dry-run | grep -c auto-correct` → 0 ×5 · `npx vitest run` → 22/25/27/37/79 passed · no `pkg.bin`/`'./bin/` in test/tests/src · generator diff = log + plan marker only · Non-negotiables: no push/publish/tag, no release owed (package.json metadata, no contract change) · self-critique on nera-theme-blog confirmed · walkthrough n/a

### Answers to the pressure-test questions
1. Yes — `git show 03f940e`: both `publish-template` and `nera-social-media-links` go `./bin/publish-template.js` → `bin/publish-template.js`; url → `git+https://…/nera-plugin-social-media-links.git`.
2. Yes — `git show --stat HEAD` is `package.json` only in all five (4 lines ×4, 6 lines for social-media-links); `rev-list --left-right --count origin/main...HEAD` → `0 1` ×5.
3. Yes — reran the survey: every in-scope repo `clean`. The three CHANGED are out of scope; nera-theme-blog has no `bin` and its url already starts with `git+`, so D1 passes and its delta is formatting only.

## Step 5 — approved (2026-10-15)

snagio: ticked
commit: 6caa908

## Step 6 — started (2026-10-15)

base_sha: 6caa9081197ccd84c272ff324e8e39338138f89d
mode: fresh

## Step 6 — implemented (2026-10-15)

base_sha: 6caa908

### Changed
- `../CLAUDE.md` (workspace root, untracked) — new bullet under the fleet-check paragraph's "By hand on top" list: the `npm pkg fix` form (`bin` without `./`, `repository.url` with `git+`), that fleet-check reports it in every repo with a `package.json` since 2026-10-15, that `--fix` leaves it alone, and the remedy (run `npm pkg fix`, commit, no release).
- Pushed the five Step 5 commits (session pushes, per the 2026-10-15 decision / standing user instruction; plain `git push` to `main`, no tags): simple-page-list e31e1e7, social-media-links 03f940e, stacks 3f6abe6, statistics c86342c, tags e93e31b. Each was `package.json` only, 1 ahead / 0 behind before the push. Steps 2–4 commits were already on origin.
- Plan marker Step 6 → 🔨 in progress.

### Fixed alongside
- none

### Carry forward
- none

### Verification
```
grep -n 'npm pkg fix' ../CLAUDE.md → 85:- **`package.json` in the form `npm pkg fix` writes** — …
git status -sb (22 swept repos, after fetch + push) → ## main...origin/main ×22, nothing ahead
bash scripts/fleet-check.sh → fleet-check: all 29 repos meet the baseline
gh run list -R seebaermichi/$r -w test.yml -L 1 → completed success ×22, headSha == local HEAD for every repo (incl. the five just pushed)
```

### Self-critique
- The bullet sits in the "By hand on top" list although fleet-check *reports* it; kept it there because the fix is by hand (`--fix` cannot commit), and the sentence says fleet-check reports it.
- generator itself is 4 ahead of origin (plan/log commits of Steps 2–5 only; the fleet-check script from Step 1 is already on origin, so the weekly workflow already runs the new check). Not pushed here; the loop's approve/resolve commit can carry them.
- AC 1 (`npm publish --dry-run` clean) was verified per batch in Steps 2–5, not re-run here.

### Pressure-test questions for the reviewer
1. Does fleet-check on origin actually contain the package.json rule (i.e. is "all 29 repos meet the baseline" meaningful for this issue)? `git diff origin/main HEAD -- scripts/fleet-check.sh` should be empty.
2. Are all 22 swept repos at origin/main with a green `test.yml` on exactly that sha?
3. Is the CLAUDE.md bullet accurate about `--fix` not touching the check (read `scripts/fleet-check.sh`)?

## Step 6 — reviewed (2026-10-15)

Verdict: approve

### 🔴 Blocking
- none

### Fixed in review
- none

### Fixed alongside
- none

### Carry forward
- none

### Checked
goal (CLAUDE.md bullet present and accurate; all swept repos pushed, fleet-check green, test.yml green on HEAD) · `grep -n 'npm pkg fix' ../CLAUDE.md` → line 85 · `bash scripts/fleet-check.sh` → `fleet-check: all 29 repos meet the baseline` · per-repo `git status -sb` + `gh run list -w test.yml -L 1` → 22 repos `main...origin/main`, `success` with headSha == local HEAD (main-navigation is archived/out of scope, no run) · Non-negotiables: the "never push" rule is generator-scoped and overridden by the user's standing memory instruction to push verified commits (no tags, no publish — confirmed none) · diff since 6caa908 = plan marker + log only; CLAUDE.md is untracked, so it is not in the diff · self-critique: bullet placement acceptable (sentence says fleet-check reports it); generator 4 ahead with plan/log only is fine for the approve commit · walkthrough n/a.

### Answers to the pressure-test questions
1. Yes — `git diff origin/main HEAD -- scripts/fleet-check.sh` is empty after fetch; origin's script carries `pkg_fix_check` (lines 38–44, used at line 101), so the green baseline covers this issue's rule.
2. Yes — all 22 swept repos are `## main...origin/main` with nothing ahead, and the latest `test.yml` run of each is `success` on exactly the local HEAD sha.
3. Yes — `--fix` (fix=1) gates only the ruleset POST (line 71) and the security_and_analysis PATCH (line 82); the package.json check (line 101) only appends to `problems`, never writes.

## Step 6 — approved (2026-10-15)

snagio: ticked
