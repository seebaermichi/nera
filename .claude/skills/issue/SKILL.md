---
name: issue
description: "Capture a new issue (bug report, improvement, or feature request) and push it to the connected Snagio project via `bash .claude/scripts/snagio report`. Gathers the details through guided questions, refines them into a structured Markdown body, and creates the issue over the API. Triggered when the user types /issue or asks to 'log this as an issue', 'file a bug', 'note an improvement', or 'add a feature request'."
license: MIT
metadata:
    author: snagio
---

# Capture an issue

Turn a rough report into a **well-structured** issue and push it to Snagio via
`bash .claude/scripts/snagio report` — no local database, no migrations. You gather the
details through a few guided questions, refine them into clean Markdown, and
create the issue through the API.

**Quality bar — this is the whole point of the skill.** The finished issue must
be detailed enough that a future Claude session with **zero context about this
conversation** can pick it up via `/work-issue`, understand exactly what to do,
and ship it without coming back to ask. Future-Claude has only this issue's
fields to work from — nothing else. A one-line description fails this bar.

## Step 0 — Load the project conventions

Read `.claude/issue-conventions.md` first. It tells you the host's
non-negotiables, framework, roles/permissions vocabulary, and **UI language**.

- **Match the host's language** when you ask questions and when you write the
  description. If the app is German-first, ask and write in German; otherwise
  use English.
- **Use the codebase's own vocabulary** — real route names, enum cases,
  permission keys, and `app/…` file paths — not generic descriptions. Grep the
  code when you need the exact identifier.

## Step 1 — Type

If the user hasn't already said, ask with `AskUserQuestion`:

- **Bug** → `bugfix` — something is broken or shows an error.
- **Improvement** → `improvement` — it works, but could be better/faster/clearer.
- **Feature** → `feature` — a brand-new capability that doesn't exist today.

## Step 2 — Title (and only the title)

Ask for a one-line title, max 180 characters, that reads like an email subject.

**One question, one answer — do NOT ask for the description in the same turn.**
If the reporter volunteers a long description anyway, extract the title, confirm
it in one sentence, and defer the body to Step 3. If the title is vague
("Login is broken"), ask one follow-up to sharpen it first.

Why title-first: it forces clarity of intent, surfaces duplicates early, and
keeps the reporter's cognitive load low.

## Step 3 — Guided detail gathering

The reporter shouldn't have to write structured Markdown. Ask a small set of
plain-language questions tailored to the type; they answer in prose, you refine.

### 3a — Ask the type-specific questions (as a single message)

Make clear that **"don't know" is a valid answer** — missing pieces become
follow-ups, not blockers.

**bugfix**
0. If this is on an existing screen: what else is on it? (the other buttons and
   ways out — the neighbouring control is often the real culprit)
1. What did you do when it happened? (the click path, or the exact URL)
2. What happened? (the precise behaviour — quote any error message verbatim)
3. What should have happened instead?
4. Which role / permission were you acting as?
5. Where — which page or route, and (if the app is multi-tenant) which account/tenant?
6. Does it reproduce? Always, or only sometimes?
7. Any screenshots or console / server errors? (paste them if handy)

**improvement**
0. If this changes an existing screen: what else is on it? (the other buttons and
   ways out — name them even if this issue does not touch them)
1. How does it work today? (concrete click path or current behaviour)
2. What bothers you about it? (the pain, how often, who's affected)
3. How should it work instead?
4. Where in the app does this happen? (page / module / route)
5. Which role is affected?
6. Is there an existing, well-solved mechanism in the app we should mirror?

**feature**
1. What should the app be able to do that it can't today? (one line)
2. Who (which role) will use it?
3. What real task does that person solve with it? (the motivation, not the mechanic)
4. Is there a similar mechanic in the app to model this on? (existing page / flow / permissions)
5. Scope: available to everyone, or per-account / behind a feature flag?
6. What should deliberately NOT be part of it? (so the scope doesn't balloon)
7. Acceptance criteria: what must measurably work at the end? (3–5 points)

### 3b — Refine the answers into the template

The answers are raw material. Turn them into clean Markdown using the templates
below. Keep the reporter's own words where they're already precise; **never
paraphrase an exact error message or button label.** Each non-empty answer
becomes its own `## Section`, in template order. If a critical answer was "don't
know" or missing, ask **one or two specific follow-ups** before saving. **Don't
fabricate — omit a section rather than write a placeholder.**

**bugfix template**

```markdown
## What happens
<exact symptom — quote any error text or button labels verbatim>

## What should happen
<one or two sentences>

## Reproduction
1. As <role> on <page / tenant> …
2. <click path or route>
3. <action>
4. → <symptom>

## Environment
- Route / page: `…`
- Role: `…`
- Feature flag (if relevant): `…`
- Browser / device (if relevant): `…`

## Code pointers (optional)
- `app/…/Foo.php:42` — suspected spot
- `resources/views/…` — affected view
```

**improvement template**

```markdown
## Today
<current behaviour — precise: "takes 3 clicks because X", not "it's not great">

## Instead
<desired behaviour — precise>

## Why
<user pain, how often, who's affected>

## Where
- Route / page: `…`
- Component / file: `…`

## Acceptance criteria
- [ ] …
- [ ] …
```

**feature template**

```markdown
## Capability
<one line: what the app can do afterwards that it couldn't before>

## User goal
<the real task solved, and by which role>

## Acceptance criteria
- [ ] <measurable, clickable, testable>
- [ ] …
- [ ] …

## Scope
- Roles: `…`
- Feature flag: <new flag needed? default on/off?>
- Tenancy: <global / per-account>   (omit if the app isn't multi-tenant)

## Related places
- Existing mechanic to model on: `…`

## Out of scope
- <what is deliberately excluded>
```

### Refinement rules

- **Quote exact UI strings** — error messages, button labels, route names. Don't paraphrase.
- **Use the codebase's vocabulary** — real enum cases, permission keys, route names, `app/…` paths (from `.claude/issue-conventions.md` and the code). "Mirror `ImpersonateController`" beats "a similar mechanism".
- **Don't invent** reproduction steps, error text, or acceptance criteria — omit rather than fabricate.
- **Name the neighbours.** For a change to an existing screen, list the surface's other
  controls and exits in the issue, even the untouched ones. Whatever the issue omits is
  omitted from the plan, and whatever the plan omits is omitted from every test written
  from it — which is how a control ends up broken for months while its surface is
  covered by a green suite.
- **Match the host's UI language** throughout; code identifiers stay as-is.

## Step 4 — Group (ask; never assume)

A **group** is a free-text label that clusters related issues on the board, and
`--order` ranks an issue inside its group. Both are optional, and both are only
ever set because the reporter said so.

**There is no default group.** Never derive one from the issue type, the
project, the reporter, the route, the association/tenant, the current branch, or
anything else you happen to know. An issue with no answer is ungrouped, and that
is a perfectly good outcome — an unwanted group is worse than none, because it
silently splits a board that reads fine flat.

First find out which groups already exist, so you can offer them instead of
inviting a near-duplicate ("Onboarding" vs "onboarding flow"):

```bash
bash .claude/scripts/snagio pull --json
```

Collect the distinct non-empty `group` values from the result. Then ask with
`AskUserQuestion` — a single question, offering:

- each existing group, most-used first (say how many issues each holds);
- **A new group** — then ask for the label (max 60 characters, matching the
  host's UI language, reusing the casing style of the existing ones);
- **No group** — always present, always a legitimate choice.

If the reporter is unsure, skips, or the answer is ambiguous: **no group**. Do
not ask twice.

### Order number (only when a group was chosen)

Skip this entirely for an ungrouped issue — an order number without a group is
rejected by the API.

Show what the group holds today, in its current order, so a number means
something:

```bash
bash .claude/scripts/snagio pull --group="<group>"
```

Then offer: a position in that list, or **leave unranked**. Unranked issues sort
last within the group, which is the right default for something just filed —
prefer it unless the reporter has an opinion. Renumbering the rest of the group
is not your job here; that is a triage decision on the board.

## Step 5 — Create the issue

Write the assembled Markdown to a temporary file (avoids shell-escaping), then
run:

```bash
bash .claude/scripts/snagio report \
  --type=<bugfix|improvement|feature> \
  --title="<title>" \
  --description-file=<tmpfile> \
  --json
```

Add `--group="<group>"` when Step 4 produced one, and `--order=<n>` only
alongside it.

Optionally add:
- `--reported-app-version="<version>"` if the host exposes one (e.g. `config('app.version')`).
- `--context='{"url":"…"}'` for the page it was found on.
- `--external-ref=<ref>` — a stable id (GitHub issue number, support ticket) so
  re-running is idempotent (a repeat returns the existing issue instead of a duplicate).

For filing many issues at once (importing a backlog), assemble one JSON-array or
NDJSON file of payloads and use `bash .claude/scripts/snagio import <file>` instead of
calling this per issue.

## Step 6 — Report back

Confirm the created issue id from the command's JSON output and point the user
at the board (`<SNAGIO_BASE_URL>/board`). If the command reported the issue
already existed (matched on `external_ref`), say so instead of implying a new
one was created.

Then stop — don't try to plan or fix the issue in the same turn unless the user
asks. That's `/work-issue`'s job.
