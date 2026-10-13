---
name: review-step
description: "Critically review one implemented step of an issue's plan in a fresh context: the step's diff (git diff <base_sha>) against .claude/issue-conventions.md and the implementer's own report in the work log. Fixes polish and small defects (behaviour changes included, within a line budget and with a test) itself and re-runs the checks; sends only blocking findings back; carries forward only what cannot be done here, and never a security finding. Appends a verdict (approve | rework) to the log. Triggered ONLY when the user explicitly types /review-step, /review-step <id>, or asks to 'review this step' / 'review the diff'. Third gate of the controlled loop; follows /implement-step, precedes /approve-step. Never rubber-stamps, never approves."
license: MIT
disable-model-invocation: true
context: fork
agent: general-purpose
background: false
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
metadata:
    author: snagio
---

# Review one plan step

You are a reviewer with **no memory of the implementation**. That is deliberate: you
read the step, the implementer's report and the diff, and nothing else. You cannot ask
the user anything — an open question becomes a 🔴 finding with the options spelled
out. Permission prompts reach the user through the parent session, which waits for
you.

## Inputs (loaded when this skill was invoked)

!`bash .claude/scripts/issue-loop.sh review-context "$ARGUMENTS"`

If the block above does not run from `<<<PLAN>>>` to `<<<END>>>`, run the same
command yourself: `bash .claude/scripts/issue-loop.sh review-context "$ARGUMENTS"`
(an empty argument means the issue named in `.claude/.work-issue-active`). The
argument is the issue's **full** id, never a prefix — the helper refuses a prefix, so
if it says so, stop and ask for the full id. Below, `<id>` means that id.

## Step 1 — Gather the rest

- The conventions, by section (`Non-negotiables`, `Framework correctness`,
  `Tests & hygiene`; `UI / template rules` and the surface map when the step touches
  UI):

  ```bash
  awk -v h='Non-negotiables' '$0 ~ "^## " h "$" {f=1} f && /^## / && $0 !~ "^## " h "$" {exit} f' .claude/issue-conventions.md
  ```

- The diff of **this step only** — new files included, never `git diff HEAD`:

  ```bash
  git add -N .
  git diff <base_sha>
  ```

  If `base_sha` is missing from the inputs, say so in the verdict and diff against
  `HEAD` as the fallback.

## Step 2 — Review

Work through, in this order:

1. **The step's goal and Verify line.** Does the diff make the goal true? Run the
   Verify commands yourself and quote the result.
2. **The implementer's self-critique and pressure-test questions.** Verify every
   claim; answer every question with evidence from the diff or a command you ran.
3. **The conventions checklist** — every non-negotiable, framework rule, UI/template
   rule and test expectation the host listed.
4. **Scope.** Anything outside this step's files or goal is a finding, not a bonus —
   except a `### Fixed alongside` entry in the implementer's report. Check that one
   like the rest of the diff: within the budget below, with its test, and needing no
   decision. Over budget is a 🔴.
5. **Re-review** (the inputs show a `<<<PREVIOUS REVIEW>>>` block): check **only**
   that each 🔴 of that review is addressed, plus anything the rework itself
   introduced. Do not start a new sweep — that is how a step takes a week.

One full pass. After listing what you checked, "nothing found" is a valid result.

## Step 3 — Sort what you found

Every deferred finding costs a whole issue lifecycle later — file, plan, implement,
review, approve, resolve — so two lines in a file this step already has open are
fixed here, not filed. The budgets below are what keeps that from turning into a
second, unreviewed step.

**🔴 Blocking → `Verdict: rework`.** Behaviour wrong; a non-negotiable violated; a
required test missing; a control that does nothing or contradicts its label; scope
creep; a fix that blows the budgets below; anything that needs a decision from the
user (state the options). These go back to `/implement-step`.

**Fixed in review — polish, you fix it now.** Everything you would otherwise call
should-fix or nitpick that changes no behaviour: naming, duplicated literals,
docblocks and comments, a missing assertion for existing behaviour, dead code,
formatting, an accessibility attribute, message wording. Inside the step's files and
provable by the step's Verify commands. **Cap:** ~40 changed lines and 3 files in total.

**Fixed alongside — small defects, you fix them now, behaviour changes included.** A
real defect you found on the way — even one outside the step's goal: a wrong
comparison, a lost value on cancel, an untranslated message, a missing validation
rule — is fixed here when **all** of these hold:

- it lives in a file the step's diff already touches, **or** it is provably the
  *same* fix on a sibling surface (the page or component that mirrors the one this
  step fixed — shipping it together is what stops the two drifting apart);
- **≤ ~20 changed lines of production code in ≤ 2 files**, plus its test;
- it ships with a test that pins the new behaviour — one that fails without the fix;
- it needs no decision: there is one obviously correct outcome.

At most **3** per review; the rest are carried forward. Edit, run the new test, the
Verify commands and the formatter, and log each with `file:line`, the defect, the
diff size and the result. `/approve-step` shows these to the user before committing.

**Security is never carried forward.** An authorization gap, mass assignment,
injection, a cross-tenant read, a secret in a log or a response — whatever its size
and whatever the step's scope. Within the fixed-alongside budget: fix it alongside.
Otherwise it is a 🔴 with two options for the user: (a) fix it in this step's rework,
(b) insert a step `Nb` right after this one.

**Carry forward — only what cannot be done here.** It needs a user decision or
design work, it is over budget, or it is unrelated to what this issue touches. One
line each, in the shape the reconcile triage in `/work-issue` reads:

```
- <bug|design|infra|debt> · <S|M|L> · `file:line` — what — why not now (decision | over budget | unrelated)
```

On a re-review, do not log again what an earlier review of this step already carried.

## Step 4 — UI walkthrough (only when the step says `Walkthrough: full`)

Follow `.claude/ui-walkthrough.md` in **full-pass** mode — the whole surface, every
exit, with the nonce readback on every exit that can discard state or whose label
promises something about it. Inventory the controls from the template source before
opening a browser; use the plan's control inventory. Steps marked `short` or `none`
get no walkthrough here (the implementer's short pass is in the log — check it is
there and reads like evidence). On a re-review, walk through only if the rework
touched a UI file. Close the browser and stop any server you started (protocol Step 7)
before writing the log — nothing survives this fork.

## Step 5 — Append the verdict to the log

```bash
bash .claude/scripts/issue-loop.sh append <id> "Step N — reviewed" <<'MD'
Verdict: approve

### 🔴 Blocking
- none  |  `file:line` — what is wrong — what "fixed" looks like — (options, if the user must decide)

### Fixed in review
- none  |  `file:line` — what changed — `<verify command>` → result

### Fixed alongside
- none  |  `file:line` — the defect — +N/−M lines — `<test>` → result

### Carry forward
- none  |  <bug|design|infra|debt> · <S|M|L> · `file:line` — what — why not now

### Checked
<one line: goal · verify commands run · conventions sections · self-critique claims · pressure-test answers · walkthrough or n/a>

### Answers to the pressure-test questions
1. <answer with evidence>

#### UI walkthrough — <surface> (full pass)          ← only for `full` steps
| control | label promises | nonce | observed after | resulting URL | verdict |
|---|---|---|---|---|---|

Console: <verbatim>
Divergence: <the one thing that differed from what the source predicted, or "none — predicted: …">
MD
```

`Verdict:` is a plain line — `approve` when there is no 🔴, otherwise `rework`. Write it
exactly like that: `/approve-step` parses it.

You never flip the step's marker, never call `.claude/scripts/snagio`, never commit, never approve.

## Step 6 — Return

Return at most 30 lines: the verdict, the 🔴 list, the fixed-in-review and
fixed-alongside lists, the carry forwards, and the next command — `/approve-step <id>` on `approve`,
`/implement-step <id>` on `rework`. The parent session relays this verbatim.
