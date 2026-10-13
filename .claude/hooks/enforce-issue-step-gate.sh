#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit): enforce the work-issue plan→step→review gate.
#
# Background: /work-issue's implementation phase must NOT be done in one sweep. The
# controlled loop is /plan-issue → (/implement-step → /review-step → /approve-step)*.
# The loop skills are `disable-model-invocation: true`, so they are invisible to the
# model's Skill list — which is exactly why the model keeps rationalising a
# one-sweep fix.
#
# This hook is the mechanical backstop. It is DORMANT during normal development:
# it only activates while a work-issue run is in flight, signalled by the marker
# file .claude/.work-issue-active (written by /work-issue, removed when it finishes).
#
# GATE 1: while the marker exists AND no plan file yet exists for the in-flight
# issue, edits to production code (app/, resources/, routes/) are blocked — forcing
# the /plan-issue gate first. The plan is recognised by the issue's full id in its
# header, never by a prefix: UUIDv7 prefixes collide (ten plans can share eight
# characters), and the work log `<plan>.log.md` exists before the plan does.
#
# GATE 2 (UI walkthrough): marking a step "done" in a plan file is blocked when the
# working tree carries UI changes and the step's section of the work log holds no
# walkthrough table. Automated tests cannot prove a control is wired to anything, so
# a step that changed the UI is not reviewed until somebody actually operated it.
# Exhortation in a skill gets rationalised away mid-session; a file check does not.
# The log itself is never gated: it is the evidence, and verdict text may contain ✅.
#
# SESSION SCOPING: the marker's first line is "<id> <session_id>". The gate only
# applies to the session that armed it (the one running the loop) — a parallel,
# unrelated session editing production code is never blocked. /clear starts a new
# session id; .claude/hooks/rebind-issue-session.sh (SessionStart) and the loop
# skills re-stamp the marker so the gate follows the work. Markers written without
# a session id stay global for backward-compat.
#
# Exit 0 = allow. Exit 2 = block, stderr fed back to the model.

set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
marker="$root/.claude/.work-issue-active"

# Not in a work-issue flow → no gate, zero cost.
[ -f "$marker" ] || exit 0

# Read the hook payload once from stdin.
input=$(cat)

file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")
[ -z "$file_path" ] && exit 0

# Normalise to a project-relative path.
rel="${file_path#"$root"/}"

# Parse the marker: first field is the issue id, optional second field is the
# session id that armed the gate.
marker_line=$(head -n1 "$marker")
uuid=$(printf '%s' "$marker_line" | awk '{print $1}' | tr -d '[:space:]')
marker_session=$(printf '%s' "$marker_line" | awk '{print $2}' | tr -d '[:space:]')

current_session=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || echo "")

# Session scoping: only the session that armed the gate is subject to it. A
# subagent (the forked /review-step) carries the parent's id in its environment,
# so that is accepted too. A marker without a session id (legacy) keeps the old
# global behaviour.
if [ -n "$marker_session" ] \
   && [ "$current_session" != "$marker_session" ] \
   && [ "${CLAUDE_CODE_SESSION_ID:-}" != "$marker_session" ]; then
  exit 0
fi

# ---------------------------------------------------------------- gate 2 ----
# Marking a step done in the plan while the working tree carries UI changes.
case "$rel" in
  plans/issues/*.log.md | plans/issues/browser-tests/*)
    # The work log and the browser-test guides are evidence, never a gate.
    exit 0
    ;;
  plans/issues/*.md)
    # What is being written (Edit: new_string, Write: content, MultiEdit: edits).
    payload=$(printf '%s' "$input" | jq -r '
      [.tool_input.new_string?, .tool_input.content?, (.tool_input.edits[]?.new_string)]
      | map(select(. != null)) | join("\n")
    ' 2>/dev/null || echo "")

    # Only interested in a step being closed out.
    #
    # Here-strings, never `printf … | grep -q`: under `set -o pipefail` grep -q exits
    # at its first match, printf is killed by SIGPIPE while still writing, and the
    # pipeline reports 141 although grep matched. It only bites once the text exceeds
    # the pipe buffer (~64 KB), and then this line would `exit 0` and let the step be
    # closed without any check (fail-open).
    grep -q '✅ done' <<<"$payload" || exit 0

    # Does the working tree actually contain UI changes? Hosts may override the
    # pattern in .claude/.ui-paths (one extended regex, first line).
    ui_re='(^resources/views/|\.blade\.php$|\.vue$|\.jsx$|\.tsx$|\.svelte$|^resources/js/|^resources/css/)'
    if [ -f "$root/.claude/.ui-paths" ]; then
      ui_re=$(head -n1 "$root/.claude/.ui-paths")
    fi

    # -uall matters: plain --porcelain collapses untracked directories to
    # "?? resources/", which would hide a brand-new view file from this check.
    changed=$(git -C "$root" status --porcelain -uall 2>/dev/null | awk '{print $NF}' | grep -E "$ui_re" | head -5 || true)
    [ -z "$changed" ] && exit 0

    # A walkthrough log = the heading plus at least one table row.
    log="${file_path%.md}.log.md"
    n=$(grep -oE '^### Step [0-9]+[a-z]?' <<<"$payload" | head -n1 | sed 's/^### Step //' || true)
    evidence=""
    where=""

    if [ -f "$log" ]; then
      # The step's section of the work log: from its last "— implemented" heading
      # through its later reworked/reviewed sections, stopping at another step.
      # awk reads the file directly, so the pipe-buffer trap above does not apply.
      where="the log's '## Step ${n:-N} — implemented' section (or its later reviewed section)"
      if [ -n "$n" ]; then
        evidence=$(awk -v n="$n" '
          $0 ~ "^## Step " n " — implemented( |$)" { f = 1; buf = "" }
          f && /^## / && $0 !~ "^## Step " n " — " { f = 0 }
          f { buf = buf $0 "\n" }
          END { printf "%s", buf }' "$log")
      else
        evidence=$(awk '
          /^## Step [0-9]+[a-z]? — implemented( |$)/ { f = 1; buf = "" }
          f { buf = buf $0 "\n" }
          END { printf "%s", buf }' "$log")
      fi
    else
      # Legacy plan (no work log yet): the walkthrough lives in the plan itself.
      # Accept it from the file already on disk or from the text being written now.
      where="this step in the plan (this plan has no work log yet)"
      existing=""
      [ -f "$file_path" ] && existing=$(cat "$file_path")
      evidence="${existing}
${payload}"
    fi

    if grep -q 'UI walkthrough' <<<"$evidence" && grep -qE '^[[:space:]]*\|' <<<"$evidence"; then
      exit 0
    fi

    {
      echo "Blocked: marking a step done, but this step changed UI and no walkthrough is logged."
      echo
      echo "  plan:    $rel"
      [ -f "$log" ] && echo "  log:     ${log#"$root"/}"
      echo "  changed: $(printf '%s' "$changed" | tr '\n' ' ')"
      echo
      echo "A passing test suite does not prove a control is wired — calling a method"
      echo "directly passes whether or not any button reaches it. Operate the surface."
      echo
      echo "Follow .claude/ui-walkthrough.md, then append under ${where}:"
      echo "  #### UI walkthrough — <surface>"
      echo "  | control | label promises | nonce | observed after | resulting URL | verdict |"
      echo "  |---|---|---|---|---|---|"
      echo
      echo "Every exit that can discard state, or whose label promises something about"
      echo "state, needs a nonce readback: type a random token, take the exit, come back,"
      echo "and quote what the field actually holds. Then run /approve-step again."
      echo
      echo "If this project has no UI (or this path is misclassified), set a pattern in"
      echo "  .claude/.ui-paths   (one extended regex on the first line)"
    } >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------- gate 1 ----
# Only gate production code. Tests, plans, migrations, docs, config and .claude
# are always allowed (plan files are handled above).
case "$rel" in
  app/* | resources/* | routes/*) ;;
  *) exit 0 ;;
esac

# A plan file for the in-flight issue opens the gate (we are in /implement-step).
# The plan is the file that names the full issue id; the work log is not a plan.
plan_found=""
if [ "${#uuid}" -ge 36 ]; then
  for f in "$root"/plans/issues/*.md; do
    [ -e "$f" ] || continue
    case "$f" in *.log.md) continue ;; esac
    if grep -q -- "$uuid" "$f" 2>/dev/null; then
      plan_found="$f"
      break
    fi
  done
else
  # Legacy marker with a short id: fall back to the file-name prefix.
  for f in "$root"/plans/issues/"$uuid"*.md; do
    [ -e "$f" ] || continue
    case "$f" in *.log.md) continue ;; esac
    plan_found="$f"
    break
  done
fi

[ -n "$plan_found" ] && exit 0

{
  echo "Blocked: work-issue is in flight ($uuid) but no plan file exists yet."
  echo
  echo "  target: $rel"
  echo
  echo "Do NOT implement /work-issue in one sweep. The required loop is (always the full id):"
  echo "  1. /plan-issue $uuid     → writes plans/issues/${uuid}-<slug>.md (no production code)"
  echo "  2. /implement-step $uuid → one step, then STOP"
  echo "  3. /review-step $uuid    → reviews that step's diff, fixes small findings itself"
  echo "  4. /approve-step $uuid   → marks the step done, ticks it off, commits it"
  echo "  (repeat 2–4 until every step is done, then /work-issue $uuid resolves the issue)"
  echo
  echo "These are user-typed slash commands (disable-model-invocation:true);"
  echo "you cannot invoke them — hand control back and ask the user to type /plan-issue."
  echo
  echo "If this marker is stale (a crashed run), clear it: rm .claude/.work-issue-active"
} >&2
exit 2
