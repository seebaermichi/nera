---
name: test-issue-in-chrome
description: "Optional acceptance test of a finished issue in a real browser: turn the issue's acceptance criteria into a step-by-step test guide under plans/issues/browser-tests/, then work through it in Chrome via Playwright MCP (Claude-in-Chrome as fallback) — or hand it to the user to click through (--manual) — and log PASS / FAIL / BLOCKED per case. Fixes no code: failed cases become carry-forwards that /work-issue's triage turns into fix steps. Triggered ONLY when the user types /test-issue-in-chrome, /test-issue-in-chrome <id> [--manual | --auto]. Offered by /work-issue once every step is approved."
license: MIT
disable-model-invocation: true
argument-hint: "<id> [--manual | --auto]"
metadata:
    author: snagio
---

# Test an issue in Chrome

Proves the finished issue against its **acceptance criteria** in a real browser, the way
a manual tester would — but drives the browser itself. It writes a step-by-step test
guide to disk, prints it, and works through it. It stops for the user only when it has
to: a login, test data it may not create on its own, or a result it cannot judge.

**Optional.** `/work-issue` offers it once every plan step is approved, before the
triage; the user may skip it. Nothing in the loop gates on it.

**It fixes nothing.** A failing case is logged as a `### Carry forward` item. The
triage in `/work-issue` reads it like every other carry-forward and — the failed
criterion being the issue's own — makes it part of the first fix step it appends. That
step runs through the normal implement → review → approve loop.

How it differs from the UI walkthrough (`.claude/ui-walkthrough.md`): the walkthrough
checks, per surface and during the loop, that every control does what its label
promises. This skill checks, once and on the finished issue, that what the issue asked
for is true end to end. Neither replaces the other.

> Not a fork: this skill may need the user (login) and holds a browser tab, so it runs
> in the main conversation. It still starts from **disk state** — the plan and the log
> under `plans/issues/` — never from "as discussed earlier". All plan and log reads go
> through `bash .claude/scripts/issue-loop.sh <command> [args]`; never open either whole.

## Inputs

| Input | Required | Source |
|---|---|---|
| Issue id — the full 36 characters, never a prefix | No, when `.claude/.work-issue-active` names the issue | argument |
| Mode | No | `--manual` (the user clicks through the guide) or `--auto` (Claude drives the browser). Neither → ask once after step 5. |

**Manual mode** saves the tokens of driving the browser: steps 1–5 run as usual, the user
works through the guide and reports back, then steps 9–11 record the result (step 5a).

## Workflow

### 1. Locate the issue and check it is finished

```bash
bash .claude/scripts/issue-loop.sh phase <id>     # must print "done"
bash .claude/scripts/issue-loop.sh index <id>
bash .claude/scripts/issue-loop.sh stamp <id>
bash .claude/scripts/issue-loop.sh browser-test <id>
```

- **`phase` is not `done`** → stop. Show the index and name the command `phase` points
  to (`/plan-issue`, `/implement-step`, `/review-step` or `/approve-step`). The browser
  test runs on the finished issue only.
- **`browser-test` prints `<result> fresh`** → a test already describes this code. Say
  so and ask whether to run it again; on no, stop.

### 2. Load the acceptance criteria

```bash
bash .claude/scripts/issue-loop.sh header <id>          # context, decisions, ## Acceptance criteria
bash .claude/scripts/issue-loop.sh snapshot <id>        # the issue as the planner read it
bash .claude/scripts/issue-loop.sh snapshot-fresh <id>  # exit 0 = from today or yesterday
```

The plan's `## Acceptance criteria` are what the loop built toward; quote them, and
check them against the snapshot's description.

- **Snapshot older than yesterday** → re-pull the issue
  (`bash .claude/scripts/snagio pull --status=in_progress --json`, match the id). Criteria are
  often edited while an issue is in progress; testing a stale copy proves the wrong
  thing. A criterion that is new or changed since the snapshot gets its own case,
  marked **changed since plan**. Snagio unreachable → use the snapshot and say so in
  the guide header.
- **No acceptance criteria anywhere** → derive cases from the description and the
  plan's context, mark every such case **derived**, and say so in the guide header and
  the report. Do not stop for this. Never invent criteria beyond what the issue says.

### 3. Scope the UI surface

```bash
FIRST_BASE=$(bash .claude/scripts/issue-loop.sh base-sha <id> 1)
git diff --name-only "$FIRST_BASE"
git status --short
```

No `base_sha` for step 1 → `git diff --name-only $(git merge-base HEAD main)` and say
so in the guide header.

Map the touched files to the pages a user reaches them through, with the surface map in
`## UI walkthrough` of `.claude/issue-conventions.md` (`surface → url, role, how to
open`). That tells you where each case starts. The full-pass walkthrough tables in the
log (`#### UI walkthrough — <surface>`) tell you which controls are already proven —
build on them, do not repeat them.

**Nothing browser-visible changed** (backend only, migration, artisan command, job,
config) → ask once:

> "<id> changes no browser-visible surface (<one-line reason from the diff>).
> Skip the browser test? If yes, give a short reason for the log."

On **yes**, append a `SKIPPED` section (step 9 format, reason as the clause, no table)
and go to step 11. On **no**, ask which page to start from — the user knows a surface
you missed.

### 4. Discover the environment

Read `## UI walkthrough` in `.claude/issue-conventions.md`: boot command, base URL,
login per role, surface map. **Missing or unfilled** → stop and print the block from
Step 0 of `.claude/ui-walkthrough.md` for the user to fill in. Do not guess URLs.

- **Reachability:** `curl -sk -o /dev/null -w '%{http_code}\n' <base url>` before
  opening the browser. Not reachable → name the declared boot command and ask before
  running it. If you boot it, you stop it in step 10.
- **Assets:** never run a cold production build to "make sure". If a dev-server watcher
  is running, its output tells you whether the changed files compiled.

### 5. Write the test guide

Write `plans/issues/browser-tests/<id>-<slug>.md` — the plan's base name, in the
`browser-tests/` subdirectory. **Never next to the plan:** every `*.md` in
`plans/issues/` is read as a plan or log, and a third file per issue there would be
taken for one. The guide is overwritten on each run; the log keeps the history.

```markdown
# Browser test: <id> — <issue title>

**Date:** <YYYY-MM-DD> · **Branch:** <branch> · **Base URL:** <url>
**AC source:** plan + snapshot <date> | fresh pull | derived (no criteria in the issue)

## Preconditions

- **Role / user:** <role from the conventions> **(user)** when a login is needed
- **Test data:** <what must exist, and how to get it> — **(user)** if it needs a
  command or a seeded record the skill may not create itself

## Test cases

### TC-1 — <criterion paraphrased as an observable outcome>

**AC:** "<verbatim acceptance criterion>"
**Status:** `[ ]`

1. Navigate to `<path>`.
2. Click **<visible label>** in <location>.
3. Fill **<field>** with `<value>`.
4. Expect: <what must be visible / must not be visible / what must change>.

**Expected:** <the pass condition in one sentence>
**Evidence:** —

---
```

Rules for the guide:

- One case per acceptance criterion; a criterion with several distinct outcomes gets
  one case per outcome.
- Add a **negative case** wherever the criterion implies one — the role that must *not*
  see the control, the invalid input that must be rejected, the record of another team
  that must not leak.
- Name UI elements by their **visible label**, in the app's language, not by CSS
  selector — the guide must be runnable by a human too.
- Status words are `PASS`, `FAIL`, `BLOCKED`. Never write the plan's step markers
  (`✅ done` and friends) into the guide.
- **≤ ~12 cases.** More means the criteria are too broad; group related outcomes into
  one case with several `Expect:` lines.

Print the guide in compact form (TC titles + one-line expectations), then:

- `--auto` → **continue immediately** with step 6.
- `--manual` → step 5a.
- **No flag** → ask once (`AskUserQuestion`): click through it yourself (manual, saves
  tokens) or let Claude drive the browser.

### 5a. Manual mode — hand the guide to the user

Do **not** load any browser tool. Print the full cases
(steps + Expected), with the base URL and the role per case, grouped by role. Then stop:

> "Please work through the cases and report back, e.g. `TC-1 pass, TC-2 fail:
> <observation>, TC-3 blocked: <reason>` — or fill in Status / Evidence in
> plans/issues/browser-tests/<id>-<slug>.md and say `done`."

When the user reports back (or re-invokes the skill and the guide already holds their
statuses), record every case exactly as reported — never upgrade an unreported case to
`PASS`; an unreported case is `BLOCKED` ("not run"). Update the guide's `**Status:**` /
`**Evidence:**` lines, then continue with step 9 with `- **Tested by:** user (manual)`.
Steps 6–8 and 10 are skipped.

### 6. Open the browser

Two bridges can drive the browser. Take the first one that is available **and passes
the probes**, and name it in the log (`Tested by`):

1. **Playwright MCP** — the default; `snagio:install` registers it in `.mcp.json`
   unless the project enables the Playwright plugin, which provides the same tools. It
   launches its own Chrome window and keeps the page it drives in front, so the run
   does not depend on the user's tabs or on which window has focus.
2. **Claude-in-Chrome** — the fallback. It drives a tab in the user's own Chrome,
   between their tabs; a tab that is not the **active tab of its window** is hidden
   and stops rendering, and it cannot bring its tab to the front itself.

**Playwright:** load its tools in **one** ToolSearch — the prefix depends on how the
host registered the server (`mcp__playwright__…` from `.mcp.json`,
`mcp__plugin_playwright_playwright__…` from the plugin), so search by name:

```
+playwright browser
```

You need `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_hover`,
`browser_type`, `browser_fill_form`, `browser_select_option`, `browser_press_key`,
`browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`,
`browser_evaluate`, `browser_handle_dialog` and `browser_close`; load what the search
did not return with a `select:` query. Then `browser_navigate` to the base URL.

**Claude-in-Chrome** (no Playwright tools, or Playwright failed a probe): invoke the
`claude-in-chrome` skill, then load every tool you need in **one** ToolSearch:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__gif_creator
```

Call `tabs_context_mcp` first, then create a **new** tab — never reuse a tab the user
has open.

**Then, on either bridge, run two probes from Step 0 of `.claude/ui-walkthrough.md`
once, in this order:**

- **rendering** — `document.visibilityState` must read `visible` and a
  `requestAnimationFrame` must fire within 2 s. A page that does not render answers
  every read with a stale frame and swallows clicks; nothing measured on it counts.
- **click** — a bridge that reports clicks as done while no pointer event reaches the
  page makes every result afterwards worthless.

A failed probe on Playwright → fall back to Claude-in-Chrome and probe again. A failed
**rendering** probe on Claude-in-Chrome → stop and ask once:

> "The test tab is not rendering — Chrome only draws the active tab of each window.
> Please click the tab <title> (Claude tab group) so it is in front, or drag the
> Claude tab group into a window of its own, then tell me to continue."

Re-run the probe after the user answers; still failing → stop.

No bridge connected, or every bridge fails a probe → **stop and say which probe
failed on which bridge**, and offer `--manual`. Never substitute curl or a test suite
and present that as this test.

### 7. Establish the session

Check who is logged in from what the app renders — load a page that needs the role and
read the result (the user menu shows the expected name; no redirect to the login page).
Never judge auth from `document.cookie`: session cookies are usually HttpOnly and read
as "logged out" while logged in.

Wrong or missing session → log in with the credentials declared for that role in
`## UI walkthrough`, or, when none are declared, **stop and ask the user**:

> "Please log in as <role> in the browser window I opened (<url>), then tell me to
> continue."

Credentials the user gives you are for this run only — **never write a password to the
guide, the log, or any file**. Re-check the session before the first case. Group the
cases by role so the login switches as rarely as possible.

### 8. Execute the test cases

Work through the cases in order (grouped by role). For each case:

1. Perform the steps like a user would: locate the element by its label in the
   accessibility tree (`browser_snapshot`; Chrome: `find` / `read_page`), then a real
   click on it (`browser_click`; Chrome: `computer`) — hover first, the hit point can
   be stale. `element.click()` from `browser_evaluate` / `javascript_tool` bypasses
   hit-testing and "passes" on a control covered by an overlay; use JS to *read*
   state, not to operate the UI.
2. Take a screenshot at the `Expect:` point and judge the outcome against **Expected**.
3. Read the console for errors and warnings (`browser_console_messages`; Chrome:
   `read_console_messages` with pattern `error|Error|warn`) and the network for 4xx/5xx
   on the case's requests (`browser_network_requests`; Chrome: `read_network_requests`).
   A new console error or failed request is evidence even when the visible outcome
   passes, and fails the case if it breaks the criterion.
4. Update the case in the guide: `**Status:**` → `PASS` / `FAIL` / `BLOCKED`, and
   `**Evidence:**` → one line (what was observed, the failing request or console error).

Rules while executing:

- **≤ 3 attempts per action**, then stop and ask. Never write workaround code, never
  edit source or test files to get past a step.
- **Ambiguous results** — timing, animations, a page that stopped rendering mid-run
  (`requestAnimationFrame` / `ResizeObserver` no longer tick; re-run the rendering
  probe) — mean ask, not loop. Describe what you saw.
- **Dialogs:** on Playwright, answer an `alert` / `confirm` with `browser_handle_dialog`
  as the case expects. On Claude-in-Chrome never trigger one, or a Basic-Auth modal,
  without warning the user first; it blocks the extension.
- **Data:** actions performed through the UI are the test. Setup commands are not:
  before any artisan / SQL / seeder command, read `DB_DATABASE` from `.env`, name the
  target, and ask. Never run destructive commands (`migrate:fresh`, truncates, wipes).
- **FAIL repro:** optionally keep a screenshot of the failing state with a meaningful
  filename (`<id>-tc-<n>-<slug>.png`; `browser_take_screenshot` takes one). On
  Claude-in-Chrome, a re-run under `gif_creator` (`<id>-tc-<n>-<slug>.gif`, frames
  before and after) shows the whole path.
- A case that cannot run (data the user declined to create, unreachable page) is
  `BLOCKED` with the reason — never `PASS`.

### 9. Log the result

```bash
bash .claude/scripts/issue-loop.sh append <id> "Browser test" <<'MD'
- **Result:** <PASSED | FAILED | BLOCKED | SKIPPED> — <one clause>
- **Guide:** plans/issues/browser-tests/<id>-<slug>.md
- **Base URL / roles:** <url> · <roles used>
- **AC source:** <plan + snapshot date | fresh pull | derived>
- **Tested by:** <Claude (Playwright MCP) | Claude (Claude-in-Chrome) | user (manual)>

| TC | AC (short) | Status | Evidence |
|---|---|---|---|
| TC-1 | … | PASS | … |

### Carry forward
- bug · TC-2 — <criterion, short>: <what was observed instead> (guide TC-2)
MD
```

- `PASSED` — every case passed.
- `FAILED` — at least one case failed.
- `BLOCKED` — none failed, but at least one could not run.
- `SKIPPED` — no browser-visible surface; the user confirmed (step 3), reason in the
  clause.

The `### Carry forward` subsection holds **one item per root cause** of the failed
cases (two cases failing on the same missing query are one item), each naming its TC
ids — or `- none`. That is how a failure reaches the triage: `issue-loop.sh
carry-forwards` lists it with `Browser test` as its source. Keep the `**Result:**` line
exactly in this shape; `issue-loop.sh browser-test` parses it.

### 10. Close what you opened

Close what the bridge opened: on Playwright, `browser_close` — the window is the
automation's own; on Claude-in-Chrome, the tab you created (`tabs_close_mcp`) and only
that one — the user's other tabs and the browser itself stay. If you booted the app in step 4, stop it the way Step 7 of
`.claude/ui-walkthrough.md` describes (match the working directory, never a process
name).

### 11. Report and stop

```
## Browser test: <id> · <RESULT>

| TC | Status | Evidence |
|---|---|---|
| … | … | … |

Guide: plans/issues/browser-tests/<id>-<slug>.md · Result appended to the work log.
State is on disk; this session can be /clear'ed.

Next: <exactly one line>
```

- `PASSED` / `SKIPPED` → `Next: /work-issue <id>   ← triage and close out`
- `FAILED` → `Next: /work-issue <id>   ← the triage turns TC-<ids> into a fix step`
- `BLOCKED` → `Next: resolve <what blocked it>, then /test-issue-in-chrome <id> again — or /work-issue <id> to go on without it`

Then stop. Do not start fixing, do not run `/work-issue`. The `Next:` line is a pointer
for the user, not permission to chain.

---

## Constraints

- **No code changes.** Never edit source, test, config or migration files — not even
  to get a case past a step. Never edit the plan either: fix steps are the triage's job.
- **Two writes, no more:** the guide file and one appended log section.
- **Never invent acceptance criteria.** Derived cases are labelled derived.
- **Never fake a browser test.** No browser bridge that passes the probes → stop and
  say so (or offer manual mode). In manual mode, record only what the user reported.
- **No credentials on disk.**
- **Ask, don't loop.** Three failed attempts or an ambiguous result → the user decides.
- **No chaining.** After the report, stop.

## Error handling

| Situation | Action |
|---|---|
| No plan or log for the id | Stop; suggest `/work-issue <id>`. |
| `phase` is not `done` | Stop; show the index and the command `phase` points to. |
| No criteria, no snapshot, Snagio unreachable | Stop; the criteria cannot be known. |
| `## UI walkthrough` missing in the conventions | Stop; print the block from `.claude/ui-walkthrough.md` Step 0. |
| App not reachable | Name the declared boot command and ask before running it. |
| Playwright MCP missing, or it fails a probe | Fall back to Claude-in-Chrome; name the bridge in `Tested by`. |
| Claude-in-Chrome tab not rendering (`visibilityState: hidden`) | Ask the user to bring the tab to the front or move the Claude tab group into its own window; re-probe. |
| No bridge connected, or every bridge fails a probe | Stop; name the failed probe per bridge; offer `--manual`. |
| Login required, no credentials declared | Stop and ask; resume after the user continues. |
| Setup data needed | Name the command and its target database, ask before running it. |
