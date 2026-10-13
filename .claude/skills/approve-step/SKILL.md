---
name: approve-step
description: "Close one reviewed step of an issue's plan: require an approve verdict in the work log, mark the step ✅ done, tick it off on the Snagio board (`snagio complete-step`), and commit the step on the current branch so the next review diffs exactly one step. Triggered ONLY when the user explicitly types /approve-step, /approve-step <id>, or says 'approve this step' / 'looks good, mark it done'. Fourth gate of the controlled loop; follows /review-step."
license: MIT
disable-model-invocation: true
metadata:
    author: snagio
---

# Approve one reviewed step

The forked reviewer cannot wait for a human to say "looks good", so approval is its own
command. It writes no production code and makes exactly three changes: the plan's
marker, the board's progress bar, and one commit.

Issue id: `$ARGUMENTS` — the issue's **full** id, all 36 characters, exactly as
copied from the board (empty → use `-`; the marker then names the issue). Below,
`<id>` means that value. Never shorten it to a prefix: UUIDv7 ids share their first
characters for a minute at a time, and the helper refuses anything shorter.
File reads go through
`bash .claude/scripts/issue-loop.sh`.

## Step 1 — Bind the session and check the verdict

```bash
bash .claude/scripts/issue-loop.sh stamp <id>
bash .claude/scripts/issue-loop.sh current <id>              # → N
bash .claude/scripts/issue-loop.sh verdict <id> N            # approve | rework | none
bash .claude/scripts/issue-loop.sh section <id> N reviewed   # the review to show
```

- `approve` → continue.
- `rework` → show the 🔴 list and ask **once** (`AskUserQuestion`) whether to approve
  anyway; on no, point at `/implement-step <id>` and stop.
- `none` → there is no review for this step; point at `/review-step <id>` and stop.

Show the user the review's **Fixed in review** and **Fixed alongside** lists, and the
implementer's **Fixed alongside** list (`section <id> N implemented`, or
`reworked`). Fixed-alongside entries change behaviour outside the step's goal; they
are there on purpose, but nobody else has looked at them — name each in one line.

## Step 2 — Mark the step done

Flip the step heading's marker `🔨 in progress` → `✅ done` **with the Edit tool** on the
plan file (`bash .claude/scripts/issue-loop.sh plan <id>`). The gate hook checks
here that a UI step has a walkthrough table in its log section; if it blocks, do what
it says and run `/approve-step` again — do not work around it.

## Step 3 — Tick the step off on the board

```bash
bash .claude/scripts/snagio complete-step <id> --title="<the step's goal, verbatim from the heading>"
bash .claude/scripts/issue-loop.sh append <id> "Step N — approved" <<'MD'
snagio: ticked
MD
```

Write `snagio: ticked` the moment the call succeeds. If an `approved` section for this
step already carries that line (a re-run after a crash), skip the call — the server
refuses a repeated title. The server picks which step is next; `--title` asserts you
are completing the one you think you are and fails loudly if the plan was reordered.
This is the only Snagio write this skill makes; status stays `/work-issue`'s job.

## Step 4 — Commit the step

One commit per approved step keeps the next review's `git diff <base_sha>` to exactly
one step. Plan and log are tracked files and belong in the commit — do not "clean
them up" out of it.

```bash
git add -A
git commit -m "<type>(<scope>): <the step's goal>" -m "Also fixes: <one line per fixed-alongside entry>"
```

`<type>` follows the repo's own convention (`feat`/`fix`/`chore`, or whatever the
history uses); `<scope>` is the module the step touched. Drop the second `-m` when
nothing was fixed alongside — otherwise it is what keeps those fixes findable in
`git log`. Then record the result:

```bash
printf 'commit: %s\n' "$(git rev-parse --short HEAD)" >> "$(bash .claude/scripts/issue-loop.sh log <id>)"
```

If the commit fails (a pre-commit hook such as the formatter), do **not** report the
step as approved: append `commit: failed (<reason>)`, show the user the hook output,
fix what it names, run the commit again and record the sha. The step is approved only
once its commit exists — `/implement-step` refuses to start the next step on a dirty
tree.

## Step 5 — Hand off

```bash
bash .claude/scripts/issue-loop.sh phase <id>
```

`implement` → "Type `/implement-step <id>` (`/clear` first is fine)."
`done` → "Every step is done — type `/work-issue <id>` to triage the carry-forwards,
reconcile and resolve."
