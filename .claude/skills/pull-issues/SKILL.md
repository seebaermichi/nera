---
name: pull-issues
description: "Fetch the connected Snagio project's open work via `bash .claude/scripts/snagio pull`, show it, and hand a chosen issue to /work-issue. Triggered when the user types /pull-issues or asks to 'pull issues', 'what issues are open', or 'show my backlog'."
license: MIT
metadata:
    author: snagio
---

# Pull issues to work on

A thin wrapper around `bash .claude/scripts/snagio pull` that lists the project's
actionable issues and hands one off to `/work-issue`.

## Prerequisites

`SNAGIO_TOKEN` (and `SNAGIO_BASE_URL` if self-hosting) must be set in the host's
`.env`. Verify with `bash .claude/scripts/snagio doctor` if a call fails.

## Steps

1. List the actionable lanes:

   ```bash
   bash .claude/scripts/snagio pull --status=open --status=in_progress
   ```

   (Omit `--status` for the same default; add `--status=resolved` etc. to widen,
   or `--json` if you need to parse the result.)

2. Show the table to the user. If it's empty, say so and stop.

3. When the user picks one (by id or title), hand off with the issue's **full**
   id — all 36 characters, as the table shows it, never shortened:
   *"Ready to work on `<id>`? Type `/work-issue <id>`."*

Do **not** start implementing here — `/work-issue` owns the plan → step →
review loop.
