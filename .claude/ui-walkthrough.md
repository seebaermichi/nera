# UI walkthrough

Operate the surface you changed, as a user would, and check that every control does what
its label promises.

Automated tests cannot do this. A unit or component test that calls a method directly
proves the method works — it cannot prove any control is wired to it. An end-to-end spec
proves the one path it was written for. Neither notices a button that quietly does nothing,
because nobody wrote a test for a behaviour nobody knew existed.

Two modes:

| Mode | Run by | Scope | Cost |
|---|---|---|---|
| **Short pass** | `/implement-step`, on every step whose plan block says `Walkthrough: short` or `full` | only the control you added or changed | ~6 browser calls |
| **Full pass** | `/review-step`, only on the step whose plan block says `Walkthrough: full (<surface>)` — the last step touching that surface, so it runs once per surface | the whole surface, every exit | ~12 browser calls |

> A short pass proves *your* control works. It proves nothing about the rest of the
> surface — that is the full pass's job. Do not treat the short pass as a safety net.
> A re-review after a rework repeats a walkthrough only if the rework touched a UI file.

---

## Step 0 — Check the host declared what you need, then prove the tools work

Read `## UI walkthrough` in `.claude/issue-conventions.md`. It must give you:

1. **Browser tooling** — the protocol needs exactly four capabilities: navigate, interact
   (click / type), read the rendered DOM or accessibility tree, and read the browser
   console. The host names which tools provide them.
2. **How to boot** — the cheapest command that yields a running app with usable data, plus
   the base URL and a login.
3. **A surface map** — `surface → (url, role, how to open)`. Many surfaces are not routable
   (a flyout reached by clicking a row), and guessing burns the whole budget.

**If that section is missing or unfilled, STOP.** Do not guess, and do not skip the
walkthrough. Tell the user the section is missing and print the block below for them to
fill in and paste — a bare stop leaves them with nothing to act on.

```markdown
## UI walkthrough

- Browser tooling: <tool names providing navigate / interact / read DOM / read console>
- Boot: <the cheapest command that gets a running app with data>
- Base URL / login: <url> — <user> / <password>
- Surfaces:
  | surface | url | role | how to open |
  |---|---|---|---|
  | <file> | <path> | <role> | <e.g. click the row action "Edit"> |
```

### Prove the tooling before you trust it

Declared is not available, and available is not working. Once per session — not once per
pass, and again after `/clear`, which starts a new session — spend a handful of calls probing against any page of the app before you believe a single
measurement:

| probe | how | why it is on this list |
|---|---|---|
| navigate + read | load the base URL, read the DOM or accessibility tree | the baseline |
| **rendering** | read `document.visibilityState`, then `await new Promise(r => requestAnimationFrame(() => r('fired')))` raced against a 2 s timeout; anything but `visible` + `fired` means fall a tier — or, on Claude-in-Chrome, ask the user to bring the tab to the front | a browser draws only the active tab of each window. A bridge that drives a tab in the person's own browser (Claude-in-Chrome) loses it the moment another tab is in front: the page reads `hidden`, stops rendering, and every screenshot, hit point and layout value after that is stale |
| **resize** | set the viewport to a width you did not start at, then read `window.innerWidth` back | a bridge that reports success and changes nothing silently invalidates every measurement you take afterwards |
| **scroll** | `window.scrollTo(0, 500)`, then read `window.scrollY` back | anchors, sticky headers and anything below the fold depend on it |
| **click** | install a counter — `window.__probeClicks = 0; document.addEventListener('pointerdown', () => window.__probeClicks++, true)` — hover a harmless element (a heading, a label), click it, read `window.__probeClicks` back; `0` means fall a tier | a bridge can report a click as done while no pointer event ever reaches the page — every control you "operate" afterwards proves nothing |
| console | read the console once | if this is empty on a page you know logs, you cannot trust a clean console later |

Read the value **back** every time. A tool that answers "ok" is not evidence — the changed
number is.

### If the declared tooling fails the probe

Do not fight it, and do not drop the walkthrough. Fall one tier and name the tier you used
in the log's first line, so a reader knows what produced the numbers:

1. **The host's declared browser tooling** — the default.
2. **A throwaway script driving the browser automation the project already has** —
   Playwright, Cypress, Puppeteer, whatever its e2e suite runs on. Write it to a scratch
   directory, run it, never check it in. It is more deterministic than a chat bridge, it
   drives real viewports, and its output pastes straight into the log. Reach for this the
   moment a bridge cannot resize or scroll.
3. **Any other browser tool available in this session**, with its limits stated up front.

Only when no tier can navigate, interact and read is the walkthrough genuinely impossible.
Then STOP and say which capability is missing.

---

## Step 1 — Inventory the surface from its source

Before opening a browser, read the template and list **every interactive control and every
way out**: each footer button, the close/X affordance, Escape, click-outside, row actions,
menu items, links that navigate away.

Write the list down. This is the step that surfaces the control nobody thought about — the
one that is not in the issue, not in the plan, and therefore not in any test.

## Step 2 — Rank the exits, then cap the work

Driving every exit on a large surface is dozens of round trips. Rank, and spend the budget
top-down:

1. **Exits that can discard unsaved state** — anything that closes the surface without
   submitting. *Always* drive, *always* with the nonce echo (Step 4).
2. **Exits whose label makes a promise about state** — "continue later", "save draft",
   "keep for now". Always drive; verify the promise *literally*.
3. **Destructive exits behind a confirmation** — drive once; check the dialog's wording
   matches what actually happens.
4. **Navigation exits** — assert the target resolves; do not follow it.
5. **Everything else** — inventory only; mark `to-verify` and move on.

Classes 1 and 2 are where label-versus-behaviour bugs live. If you run out of budget, you
run out *after* those two.

## Step 3 — Boot

Use the host's boot command. Prefer an already-running instance over starting a new one.
Never start a full development stack (asset watcher, queue worker, log tailer) for a
walkthrough — you need an HTTP server and data, nothing else.

## Step 4 — Drive, with a nonce echo

For every class-1 and class-2 exit:

1. Open the surface.
2. Type a **random token** you invent now (e.g. `WT-7f3a2`) into a free-text field.
3. Take the exit.
4. Return to the surface the way a user would.
5. **Quote what the field actually contains.**

The token cannot be predicted from the source, and the outcome cannot be known without
performing the exit. An empty field where the label promised persistence *is the bug
report*.

**When the nonce does not apply.** A surface with no class-1 and no class-2 exit — a static
page, a read-only view, a form that holds no discardable state — has nothing to echo. Write
one line saying so and move on. Do not manufacture evidence for a risk the surface does not
carry, and above all do not spend calls fighting your tooling to produce it.

Then read the browser console and record it **verbatim, including the noise** — framework
warnings, asset-server chatter, all of it.

### Two things that will otherwise eat your budget

- **Hover before you click.** Some bridges compute the hit point against a stale layout, so
  a click lands beside the target, reports success, and does nothing. Hovering first settles
  the coordinates. When a click "did nothing", suspect this before you suspect the page.
- **Never put a focus check and a scroll check in the same call.** Focusing an element
  scrolls it into view, which destroys the scroll position you were about to measure. Two
  calls, in that order.

## Step 5 — Log it into the work log

The log is the evidence the gate hook checks when a step is marked done. Append the
table to the step's section of `plans/issues/<id>-<slug>.log.md` — inside the
`## Step N — implemented` report for a short pass, inside `## Step N — reviewed` for a
full pass (both are written through `bash .claude/scripts/issue-loop.sh append`):

```markdown
#### UI walkthrough — <surface>

| control | label promises | nonce | observed after | resulting URL | verdict |
|---|---|---|---|---|---|
| "Continue later" | draft is kept | WT-7f3a2 | field empty — state discarded | /plots | ✗ contradicts label |
| "Save" | persists + closes | WT-9c1d4 | field shows WT-9c1d4 | /plots | ✓ |

Console: <verbatim, including warnings>
Divergence: <the one thing that differed from what the source predicted>
```

Rules for the log:

- Record values the template does not contain — computed counters, generated ids, the
  record id in the URL, the actual toast text. Anything copyable from source proves nothing.
- Every class-1 and class-2 row needs its nonce; rows of the other classes put `—` in
  that column. Every row needs its resulting URL.
- **Name at least one divergence**, or state explicitly that there was none and what you
  predicted for each control and why. A log where every row reads "as expected" is a smell.

## Step 6 — Turn findings into something durable

A table in a work log is read once and never again. If a class-2 exit fails its label's
promise, the step is not done until there is **a regression test for that exit**, or the
issue that will add one. Otherwise the next agent to break it gets nothing.

---

## Step 7 — Tear down what you started

A walkthrough leaves two things running, and neither closes itself: the **browser** the
tooling launched, and any **server** you booted in Step 3. Nobody but you knows they are
yours, so nobody else will ever close them. They accumulate silently across sessions —
one abandoned browser per walkthrough, still there days later.

Close the browser as the last action of the walkthrough, before you write the log —
Playwright MCP's `browser_close` (`mcp__playwright__browser_close` when the server comes
from `.mcp.json`, `mcp__plugin_playwright_playwright__browser_close` from the plugin). On
Claude-in-Chrome, close only the tab you created; the browser is the person's.

Then stop the server you started, and **only** that one. Match on the working directory,
never on a process-name pattern — sibling worktrees and the main checkout share the
process table, and a pattern kill takes theirs too:

```bash
for pid in $(lsof -nP -iTCP:<your port> -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u); do
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
  case "$cwd" in
    "$PWD"/*|"$PWD") kill "$pid" ;;
    *) echo "not mine, leaving: $pid ($cwd)" ;;
  esac
done
```

If a browser survives anyway — a crashed run, an interrupted session — identify it by its
profile directory, never by name. Playwright MCP's instances carry
`--user-data-dir=…/ms-playwright-mcp/…`; a real browser the person is using does not. That
string is the only safe way to tell one from the other:

```bash
ps -eo pid,command | grep "MacOS/Google Chrome" | grep -v Helper |
  grep "ms-playwright-mcp"          # ← only these are yours to kill
```

**Never kill a browser process that lacks an automation profile flag.** It is the one the
person is working in, with their tabs open in it.

---

## Failure modes

| Symptom | What it means |
|---|---|
| No `## UI walkthrough` section | Stop; print the block above. Never proceed by guessing. |
| Surface not in the map | Add the row as part of this step. |
| A confirmation dialog blocks you | The host must pre-approve dialog handling in its tooling. Say so rather than skipping the exit. |
| Every row "as expected" | You probably drove the happy path only. Re-read Step 2. |
| The log has no nonce, and the surface has a class-1/2 exit | It is not evidence. Redo it. |
| A tool reports success but the value did not change | You skipped the Step 0 probe. Read values back, then fall a tier. |
| A click "succeeds" but the page never reacts | The bridge delivers no pointer events. The Step 0 click probe reads `0`; fall a tier. |
| Screenshots stale, `requestAnimationFrame` never fires, `visibilityState` is `hidden` | The page is not rendering — on Claude-in-Chrome its tab is not the active tab of its window. The Step 0 rendering probe catches it; bring the tab to the front or fall a tier. |
| Browser windows piling up between sessions | Step 7 was skipped. Close the browser as the walkthrough's last action, not "later". |
