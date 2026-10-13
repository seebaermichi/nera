---
name: implement-step
description: "Implement exactly ONE step of an issue's plan (plans/issues/<id>-<slug>.md), self-review the diff, write the handoff report into the work log, then STOP. May write production code, tests and ordinary migrations. Triggered ONLY when the user explicitly types /implement-step, /implement-step <id>, or asks to 'implement the next step' / 'address the review findings'. Second gate of the controlled loop; follows /plan-issue or a rework verdict, precedes /review-step."
license: MIT
disable-model-invocation: true
metadata:
    author: snagio
---

# Implement one plan step

Implement a single step, review your own diff as the reviewer will, write the report
into the work log, stop. Never sweep multiple steps. The report in the log — not what
you print — is what `/review-step` reads, possibly in a fresh session.

Issue id: `$ARGUMENTS` — the issue's **full** id, all 36 characters, exactly as
copied from the board (empty → use `-`; the marker then names the issue). Below,
`<id>` means that value. Never shorten it to a prefix: UUIDv7 ids share their first
characters for a minute at a time, and the helper refuses anything shorter.
File reads go through
`bash .claude/scripts/issue-loop.sh`; never open the plan or the log whole.

## Step 1 — Bind the session and find the step

```bash
bash .claude/scripts/issue-loop.sh stamp <id>            # re-arms the gate for this session
bash .claude/scripts/issue-loop.sh phase <id>            # must print "implement"
bash .claude/scripts/issue-loop.sh index <id>
bash .claude/scripts/issue-loop.sh current <id>          # → N
bash .claude/scripts/issue-loop.sh last <id> N           # none | started | reviewed
```

If `phase` prints anything but `implement`, say so and name the command it printed.
Then pick the mode:

| `last` | mode |
|---|---|
| `none` | **fresh** — a step nobody has started |
| `started` | **resume** — a step begun in an earlier session and never reported; reuse its `base_sha`, show `git diff --stat <base_sha>` and continue from there |
| `reviewed` (verdict `rework`) | **rework** — address only the 🔴 findings of the last review |

**Dirty tree check (fresh mode only).** If `git status --porcelain` is not empty and
the previous step's `approved` section carries no `commit:` line, stop and tell the
user: the previous step was never committed, so this step's diff would include it.

## Step 2 — Read exactly what you need

```bash
bash .claude/scripts/issue-loop.sh header <id>           # context, decisions, acceptance criteria
bash .claude/scripts/issue-loop.sh step <id> N           # the one step block
bash .claude/scripts/issue-loop.sh section <id> N reviewed   # rework mode: the 🔴 list
```

Plus the conventions sections, by heading (`Non-negotiables`, `Framework correctness`,
`Tests & hygiene`; `UI / template rules` and the surface map when the step touches UI):

```bash
awk -v h='Non-negotiables' '$0 ~ "^## " h "$" {f=1} f && /^## / && $0 !~ "^## " h "$" {exit} f' .claude/issue-conventions.md
```

## Step 3 — Mark the step started, before the first edit

Fresh mode: flip the step's marker `⬜ todo` → `🔨 in progress` **with the Edit tool**
(never sed — the gate hook watches Edit), then record the base commit:

```bash
bash .claude/scripts/issue-loop.sh append <id> "Step N — started" <<MD
base_sha: $(git rev-parse HEAD)
mode: fresh
MD
```

Rework and resume modes reuse the existing `base_sha`
(`bash .claude/scripts/issue-loop.sh base-sha <id> N`) — the review diff must
cover the whole step, not just the latest fix.

## Step 4 — Implement

Write the code and tests for **this step only**, honouring every non-negotiable. In
rework mode, address each 🔴 finding and nothing else. A 🔴 that lists options is the
user's call: ask with `AskUserQuestion` before touching code. Decisions the user makes
on the way are logged the moment they are made:

```bash
bash .claude/scripts/issue-loop.sh append <id> "Decision" <<'MD'
<question> → <answer> (<why>)
MD
```

**Inserting a step** (the user chose it for a 🔴, e.g. a security finding too big to
fix alongside): add a `### Step Nb — <goal> — ⬜ todo` block right after this step
with the Edit tool, in the plan grammar, log the `Decision`, and re-sync the board so
the new step appears without losing the ticked ones:

```bash
bash .claude/scripts/issue-loop.sh board-steps <id> | bash .claude/scripts/snagio plan-steps <id> --steps-file=-
```

The rework of this step then records the finding as "moved to Step Nb". That is the
only way scope enters a running plan mid-loop — by the user's decision, never on
your own.

Do not touch the issue's status (`/work-issue`) and do not report progress to Snagio
(`/approve-step` ticks a step off once it is verified).

## Step 5 — Verify

Run the step's **Verify** commands exactly as written, plus the formatter/linter on the
changed files (from `## Tests & hygiene`). Keep the output lines you will quote.

## Step 6 — Self-review, as the reviewer will

This is the step that removes review rounds. Mark new files so the diff shows them,
then read your own diff with the conventions open:

```bash
git add -N .
git diff <base_sha>
```

Fix **now** everything you would flag in someone else's diff: names, duplicated
literals, missing docblocks, a test that asserts too little, dead code, an unguarded
edge, a message that lies about what the code does. Re-run the Verify commands after
fixing. What remains is either fine or a genuine question for the reviewer — write it
down in the self-critique, do not leave it for the review to find.

A defect you notice **outside the step's goal** follows the reviewer's rules (Step 3
of `/review-step`), so it is decided the same way on both sides:

- in a file this step touches (or the same fix on a sibling surface), ≤ ~20 lines of
  production code in ≤ 2 files, with a test that fails without it, no decision
  needed, at most 3 → **fix it alongside** and list it under `### Fixed alongside`;
- a security finding is never carried forward — fix it alongside if it fits,
  otherwise stop and ask the user: fix it in this step, or insert a step `Nb`;
- anything else → one line under `### Carry forward`.

## Step 7 — Short UI walkthrough (only if the step says `short` or `full`)

A test suite cannot prove a control is wired: calling a method directly passes whether
or not any button reaches it. Follow `.claude/ui-walkthrough.md` in **short-pass** mode
(~6 browser calls): open the surface, operate the control you added or changed, read
the console, reload and read the value back. The tooling probe (Step 0 of the
protocol) is per session — after `/clear` it must be redone. Close the browser when you
are done (Step 7 of the protocol).

If the host has no `## UI walkthrough` section, say so and follow the STOP
instructions in `.claude/ui-walkthrough.md` rather than skipping silently.

## Step 8 — Write the report into the log, then print a summary

Append the full report **before** you print anything (heading `Step N — implemented`,
or `Step N — reworked` in rework mode):

````bash
bash .claude/scripts/issue-loop.sh append <id> "Step N — implemented" <<'MD'
base_sha: <sha>

### Changed
- `path` — what and why (one line each)

### Fixed alongside
- none  |  `file:line` — the defect — +N/−M lines — `<test>` → result

### Carry forward
- none  |  <bug|design|infra|debt> · <S|M|L> · `file:line` — what — why not now (decision | over budget | unrelated)

### Verification
```
<command> → <result line, verbatim>
```

### Self-critique
- <what you considered and rejected, and why>
- <what you are least sure about>

### Pressure-test questions for the reviewer
1. <the check that would hurt most if it failed>
2. …

#### UI walkthrough — <surface> (short pass)          ← only for short/full steps
| control | label promises | nonce | observed after | resulting URL | verdict |
|---|---|---|---|---|---|
| … | … | … | … | … | … |

Console: <verbatim>
MD
````

In rework mode the `### Changed` list maps each 🔴 finding to its fix.

Then print **at most 15 lines**: step number and goal, files touched, the verification
result, the open questions, and the closing line "Type `/review-step <id>` —
`/clear` first is fine." Leave the marker at `🔨 in progress` and STOP.
