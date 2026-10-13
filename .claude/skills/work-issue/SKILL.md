---
name: work-issue
description: "Pick up an issue from the connected Snagio project, mark it in progress, and drive it through the /plan-issue → (/implement-step → /review-step → /approve-step)* loop, offer an optional browser test (/test-issue-in-chrome), then triage what the loop carried forward, reconcile project chores and resolve it — all via `bash .claude/scripts/snagio`. Resumable: run it again at any point (also after /clear) and it names the next command. Triggered when the user types /work-issue, /work-issue <id>, or asks to 'work on this issue' / 'resolve issue X' / 'what is next on this issue'."
license: MIT
metadata:
    author: snagio
---

# Work an issue end to end

Orchestrates one issue from `open` to `resolved`. This skill writes **no production
code** — the implementation happens inside the gated loop below, one step at a time,
and a PreToolUse hook (`.claude/hooks/enforce-issue-step-gate.sh`) enforces that.

Every handoff inside the loop lives in two files under `plans/issues/`, never in the
conversation:

- `<id>-<slug>.md` — the **plan** (context, decisions, steps with a status marker)
- `<id>-<slug>.log.md` — the **work log** (issue snapshot, one section per report,
  verdict and approval)

(Plans from before the full-id rule carry only eight characters in their name; the
helper finds them by the full id in their header, so they need no renaming.)

That is what makes **`/clear` between commands safe and recommended**: the next
command re-reads what it needs from the files. Run `/work-issue <id>` again after
any break and it tells you where the issue stands.

All file reads go through `bash .claude/scripts/issue-loop.sh <command> [args]` (run it
without arguments for the list). Never open a plan or log whole.

## Step 1 — Identify the issue

`<id>` is always the issue's **full** id — all 36 characters, as the board's copy
button and `snagio pull` give it. Never shorten it, not in a command you run and not in
a command you tell the user to type: UUIDv7 ids share their first characters for a
minute at a time, so a prefix can name several issues. `issue-loop.sh` refuses one.

If given a full id, use it. If given something shorter, do not guess — ask the user to
paste the full id from the board. Otherwise list and let the user choose:

```bash
bash .claude/scripts/snagio pull --status=open --status=in_progress --json
```

Find the target issue by its full id. Note its `id`, `type`, `title`,
`status`, `group` and `description`.

## Step 2 — Mark it in progress (only if it is still open)

```bash
bash .claude/scripts/snagio push <id> --status=in_progress
```

Skip this when the pull already shows `in_progress` — a resumed issue must not be
pushed again.

## Step 3 — Create the work log and snapshot the issue

```bash
bash .claude/scripts/issue-loop.sh init <id> "<title>"      # prints the log path; creates it once
bash .claude/scripts/issue-loop.sh snapshot-fresh <id>   # exit 0 = snapshot from today/yesterday
```

If `snapshot-fresh` fails, append the issue as the loop will read it (≤ ~3 KB; trim a
very long description to its headings and acceptance criteria):

```bash
bash .claude/scripts/issue-loop.sh append <id> "Issue snapshot" <<'MD'
- **Id:** `<id>`
- **Type:** <type>
- **Group:** <group or —>
- **Status:** <status>
- **Title:** <title>

<description as pulled, Markdown kept>
MD
```

`/plan-issue` reads this snapshot instead of calling Snagio again.

## Step 4 — Arm the gate

```bash
bash .claude/scripts/issue-loop.sh stamp <id>
```

This writes `.claude/.work-issue-active` as `<id> <session id>`. Every loop skill
re-stamps it, and the `SessionStart` hook re-binds it after `/clear`, so the gate
follows the work.

## Step 5 — Tell the user the next command, then STOP

```bash
bash .claude/scripts/issue-loop.sh phase <id>
```

| `phase` prints | say |
|---|---|
| `plan` | "Type `/plan-issue <id>`." |
| `implement` | "Type `/implement-step <id>`." (the reason on stderr says whether it is a fresh step, a resume or a rework) |
| `review` | "Type `/review-step <id>`." |
| `approve` | "Type `/approve-step <id>`." |
| `done` | continue with Step 6 |

Show the step index (`bash .claude/scripts/issue-loop.sh index <id>`) so the user
sees the progress, mention that `/clear` is safe now, and stop. The loop commands are
user-typed (`disable-model-invocation: true`) — you cannot invoke them.

`/plan-issue` reports the step titles to Snagio and `/approve-step` ticks each one
off, so the issue's card grows a progress bar as the loop runs. You do not report
progress yourself.

## Step 6 — Offer the browser test (only when `phase` is `done`)

Every step is approved — the one moment the finished issue can be tested against its
acceptance criteria in a real browser before it is resolved. The test is optional.

```bash
bash .claude/scripts/issue-loop.sh browser-test <id>
```

| prints | do |
|---|---|
| `none` | offer it (below) |
| `<result> stale` | a step was approved after the last test — typically the triage's fix steps. Offer a re-run (below). |
| `blocked fresh` | the last run could not finish. Offer a re-run (below). |
| `passed fresh` · `failed fresh` · `skipped fresh` | continue with Step 7 |

The offer is **one** `AskUserQuestion`:

- **Test in Chrome (Recommended)** → "Type `/test-issue-in-chrome <id>` (`/clear`
  first is fine). Add `--manual` to click through the guide yourself." Then stop — the
  skill is user-typed (`disable-model-invocation: true`); you cannot invoke it.
- **Skip** → record the answer, so the offer is not repeated, and continue with Step 7:

  ```bash
  bash .claude/scripts/issue-loop.sh append <id> "Browser test" <<'MD'
  - **Result:** SKIPPED — <the user's reason, or "declined when offered">
  MD
  ```

  A skip is the answer for the whole issue: it never goes stale.

A failed test needs nothing from you here: its failing cases are carry-forwards with
`Browser test` as their source, and Step 7 triages them like every other item.

## Step 7 — Triage the carry-forwards (only when `phase` is `done`)

This is the one moment the whole issue is in view with the branch still open. The
carry-forwards were logged step by step, repeat each other, and most are small fixes
in or beside files this issue already changed. **The default is to fix them here.**
Whoever works an issue expects it to come back finished — not with a list of new
issues for defects the work itself surfaced. A follow-up issue is the exception and
has to earn its place.

If `bash .claude/scripts/issue-loop.sh triaged <id>` exits 0, the triage already
ran — and `phase` printing `done` means its fix steps are approved too. Go to Step 8;
it says what happens to a carry-forward that is not in the triage table (a browser
test re-run after the fix steps included). There is never a second triage round.

Otherwise collect the list — every item, from the plan's cut scope and every report
and review, one per line with its source:

```bash
bash .claude/scripts/issue-loop.sh carry-forwards <id>
bash .claude/scripts/snagio pull --status=open --status=in_progress --json
```

1. **Clean the list before anyone sees it.** Merge duplicates (two reviews of one
   step logging the same finding is one item; three findings in one file are one fix)
   and **check each against the code on the branch now and against the board you
   just pulled** — never from memory. Whatever a later step already fixed, whatever
   is a duplicate, is already filed, or is owned by another open issue **leaves the
   list** — it never becomes a table row. An item is owned when an open issue's title
   or description covers it, and that includes **behaviour a planned issue will
   build**: in a young app most of what a walkthrough misses is a later task's
   feature, not a defect of this one. It gets one summary line under the table, ids
   or `file:line` only:
   `Already done / elsewhere: 5 fixed by later steps (…), 1 filed as <id>, 2 owned by <id>.`
   The table holds only what still needs work.
2. **Classify** what is left. There are two dispositions:
   - `fix` — the default, for every item this issue surfaced: a defect, a security
     gap, a failed browser-test case, a pre-existing bug found on a surface the issue
     touched, debt or a typo in a touched or neighbouring file, an infra or
     convention note. "Pre-existing", "not in the plan's goal" and "a file no step
     changed" are **not** reasons to file it — the walkthroughs found it because this
     issue works there.
     An item that needs a decision is still `fix`: pick the sensible default, write
     it in the `why` column (`default: refuse delete while plots exist`) and let the
     user overrule it in the one question below.
   - `file` — the exception, and only for one of two reasons, named in `why`:
     **size** — the fix is a piece of work of its own (roughly: more than one plan
     step on its own, a migration of shared data, a redesign of a flow), or
     **separate feature** — it adds behaviour nobody asked for here, on a surface this
     issue does not touch. "Unrelated" alone is not a reason; say which of the two it
     is. Expect zero or one, rarely more than two.
   An item worth no line of code is not dropped in a row of its own: it goes into the
   summary line with a three-word reason.
3. **Planning signal.** If the `fix` items need more than one step, the plan drew
   its frame too small. Name the frame it missed in one line — it is a lesson for
   the next plan, not a reason to file anything.
4. **Log** it, then show the table and ask **once** (`AskUserQuestion`) whether to go
   ahead — options: as classified (Recommended) · file nothing, fix everything ·
   let me change items. Log any change, and every default the user overrules, as a
   `Decision`.

```bash
bash .claude/scripts/issue-loop.sh append <id> "Triage" <<'MD'
| # | item | from | disposition | why |
|---|---|---|---|---|
| 1 | <bug · `file:line` — what> | Step 3 — reviewed | fix | file changed in step 4; 1 token + test |
| 2 | <design · `file:line` — what> | Step 2 — reviewed | fix | default: <the decision taken> |
| 3 | <design · where — what> | Plan cut scope | file | size: <why it is its own piece of work> |

Already done / elsewhere: <n> fixed by later steps (<refs>), <n> filed as <id>  |  none
Planning signal: none  |  the plan missed <frame>
MD
```

5. **`fix` items become fix steps, not a sweep.** This skill writes no production
   code, so append step blocks after the last one with the Edit tool, in the plan
   grammar (`### Step <next> — <goal naming the fixes> — ⬜ todo`, with Goal, Files,
   Verify, Review hardest, Risks, Walkthrough), one bullet per item with the test that
   pins it. Group the items by surface; each step follows the step budget
   (≤ ~6 files). When they do not fit one step, add a second or a third — running
   out of budget is **never** a reason to turn a `fix` into `file`. Security items
   and failed browser-test cases go first. Put them on the board without losing the
   ticked steps:

   ```bash
   bash .claude/scripts/issue-loop.sh board-steps <id> | bash .claude/scripts/snagio plan-steps <id> --steps-file=-
   ```

   Then go back to Step 5 — `phase` now prints `implement`. A few more
   implement → review → approve rounds are the whole cost of what would otherwise
   have been several issues. Once they are approved, Step 6 offers a browser test
   re-run, since the fix steps changed what was tested.

No `fix` items → continue with Step 8.

## Step 8 — Reconcile

Perform the reconciliation steps listed under `## Reconciliation steps` in
`.claude/issue-conventions.md` (e.g. version bump, changelog entry, docs reindex).
If that section is empty, skip this.

Offer the `file` items — usually none — to the user as candidates for `/issue`, one
line each with its reason (size or separate feature). Do not implement any of them.

A carry-forward the fix steps logged after the triage gets no second triage and no
question. Check it against a fresh `snagio pull` (as in Step 7, point 1): what an open
issue owns or will build is dropped. Offer one as an `/issue` candidate only if it is
a defect in what this issue's acceptance criteria promise and no open issue covers
it. Everything else is named in **one** summary line (`Noted, not filed: 8 — …`) and
the issue is resolved.

## Step 9 — Resolve and disarm

Push the terminal status (the API stamps `resolved_at` automatically) and remove the
marker:

```bash
bash .claude/scripts/snagio push <id> --status=resolved --target-version=<version>
rm -f .claude/.work-issue-active
```

Use `--status=closed` or `--status=wontfix` instead of `resolved` when appropriate.
Each approved step was already committed by `/approve-step`; suggest
`/commit-changes` for the reconciliation edits, then confirm the result to the user.

Resolving is independent of the step count — a finished plan does not resolve the
issue by itself, and an issue can be closed or marked wontfix with steps still
outstanding.
