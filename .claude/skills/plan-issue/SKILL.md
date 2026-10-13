---
name: plan-issue
description: "Turn an open Snagio issue into a written, version-controlled implementation plan broken into at most eight small, individually reviewable AND verifiable steps, and report those steps to Snagio so the board shows progress — writing NO production code. Triggered ONLY when the user explicitly types /plan-issue, /plan-issue <id>, or asks to 'plan this issue' / 'break this issue into steps'. First gate of the controlled plan → step → review → approve loop."
license: MIT
disable-model-invocation: true
metadata:
    author: snagio
---

# Plan an issue into reviewable steps

Decompose one issue into a lean step plan. Writes the **plan file** and appends the
reasoning behind it to the **work log** — and **no production code**. Creating the plan
is what opens the PreToolUse gate for `/implement-step`.

Issue id: `$ARGUMENTS` — the issue's **full** id, all 36 characters, exactly as
copied from the board (empty → use `-`; the marker then names the issue). Below,
`<id>` means that value. Never shorten it to a prefix: UUIDv7 ids share their first
characters for a minute at a time, and the helper refuses anything shorter.
File reads go through `bash .claude/scripts/issue-loop.sh`.

## Step 1 — Load the issue from the work log

```bash
bash .claude/scripts/issue-loop.sh snapshot <id>
```

That is the snapshot `/work-issue` wrote. Call Snagio only when it is empty or stale
(`snapshot-fresh <id>` exits 1):

```bash
bash .claude/scripts/snagio pull --status=open --status=in_progress --json
bash .claude/scripts/issue-loop.sh init <id> "<title>"       # creates the log if /work-issue was skipped
bash .claude/scripts/issue-loop.sh append <id> "Issue snapshot" <<'MD'
…title, type, group, description…
MD
```

Read `title`, `type` and `description` carefully. The plan's job is to make the issue's
acceptance criteria true — not to fix everything you notice on the way.

## Step 2 — Understand the change against project rules

Read the sections of `.claude/issue-conventions.md` you need, by heading:

```bash
awk -v h='Non-negotiables' '$0 ~ "^## " h "$" {f=1} f && /^## / && $0 !~ "^## " h "$" {exit} f' .claude/issue-conventions.md
```

Always: `Non-negotiables`, `Framework correctness`, `Tests & hygiene`. When a UI
surface is touched: `UI / template rules` and the surface map under `UI walkthrough`.
Hold every listed non-negotiable in mind as you plan. Do **not** re-read CLAUDE.md,
README or CI files — they are already in context.

## Step 3 — Write the plan

```bash
bash .claude/scripts/issue-loop.sh plan-path <id>     # plans/issues/<id>-<slug>.md — use exactly this path
```

The headings are a grammar the loop parses. Copy them exactly — em dashes included;
a hyphen matches nothing:

```markdown
# Plan: <title>

- **Issue:** `<full id>`
- **Type:** <type>
- **Plan written:** <YYYY-MM-DD>

## Context

<3–8 sentences: what the issue asks, why, where in the code it lands.>

## Design decisions

**D1 — <decision>.** <one or two sentences; the reasoning goes to the log, see Step 4>

## Acceptance criteria

- [ ] <from the issue, one per line>

## Steps

### Step 1 — <one-line goal> — ⬜ todo

- **Goal:** <what is true after this step>
- **Files:** `path` — what changes (≤ ~6 files)
- **Verify:** `<literal command>` — <what must hold>
- **Review hardest:** <the one thing most likely to be wrong>
- **Risks:** <what could break elsewhere>
- **Walkthrough:** none | short | full (<surface>)
```

Rules:

- **≤ 8 steps**, each independently implementable, reviewable and committable. A step
  block is **≤ 40 lines excluding its control inventory table**. If the issue needs
  more, cut scope — put the rest under a `## Carry forward` section in the log for a
  follow-up issue, one line each in the shape `/review-step` uses
  (`- <bug|design|infra|debt> · <S|M|L> · <where> — what — why not now`).
- Later-discovered scope never *silently* enters a running plan. It has exactly three
  ways in, and nothing else: a **fix alongside** within the review budget (a small
  defect fixed in the step that found it — no plan change), a step **inserted by the
  user's decision** for a 🔴 that needs one (`4b`), and the **fix steps**
  `/work-issue` appends after its triage. The ≤ 8 cap applies to what you plan here;
  those additions come on top.
- Step ids are `1`, `2`, … A step inserted later may be `4b`, but that is a smell.
- **Verify** lines are literal commands (from `## Tests & hygiene`), not prose — the
  implementer and the reviewer run exactly these.
- Every step starts `⬜ todo`; markers are only ever changed with the Edit tool.
- **Walkthrough:** for every UI surface the issue touches, the **last** step touching
  it says `full (<surface>)`, earlier steps on that surface say `short`, steps without
  UI say `none`. The full pass runs once per surface, in the review of that last step.

### Steps that touch an existing UI surface

The most expensive planning mistake is drawing the frame too small: the issue names
one control, the plan verifies that control, every test passes, and a different
control on the same surface has been broken for months. Tests are written from the
plan, so whatever the plan omits is invisible.

So for any step touching an existing surface, the plan must additionally carry a
**control inventory** — read from the template source, not from memory:

```markdown
**Control inventory — <surface>**

| control | what its label promises | status |
|---|---|---|
| "Save" | persists and closes | touched |
| "Continue later" | keeps the draft | untouched — to verify |
| close X / Escape | — | untouched — to verify |
```

List *every* control and *every* exit, including the ones this issue does not
mention. If the surface is not already in the host's surface map under
`## UI walkthrough` in `.claude/issue-conventions.md`, add a row for it as part of
the step.

## Step 4 — Put the reasoning in the log, not the plan

The plan carries the decisions; the log carries why. Append once:

```bash
bash .claude/scripts/issue-loop.sh append <id> "Decision" <<'MD'
**D1 — <decision>.** <alternatives considered, why they lost, what it costs>
MD
```

## Step 5 — Self-check before handing off

Read the plan back through the helper and confirm, in one short list:

- every acceptance criterion maps to at least one step;
- every control on a touched surface is in an inventory;
- no step exceeds the budget; no step depends on an undecided question;
- `bash .claude/scripts/issue-loop.sh index <id>` lists every step with `todo`.

Fix the plan if any point fails. An open question the user must answer is asked now
(`AskUserQuestion`), and the answer is logged as a `Decision` — never deferred into a
step.

## Step 6 — Report the steps to Snagio

```bash
bash .claude/scripts/snagio plan-steps <id> \
  --step="<step 1 goal>" \
  --step="<step 2 goal>" \
  --step="<step 3 goal>"
```

Use the exact goals from the step headings, in order — they become the card's
progress bar and the checklist in the issue's flyout. Re-planning replaces the whole
list. (A plan that changes mid-run — an inserted `Nb`, the reconciliation step — is
re-synced with `issue-loop.sh board-steps <id> | bash .claude/scripts/snagio plan-steps <id>
--steps-file=-`, which keeps the ticked steps ticked.) This is the only Snagio write this skill makes: the issue's **status** stays
`/work-issue`'s job.

## Step 7 — Hand off

STOP. Tell the user the plan is ready, that `/clear` is safe, and to type
`/implement-step <id>` to begin the first step. Do not implement anything.
