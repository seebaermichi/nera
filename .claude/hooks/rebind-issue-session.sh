#!/usr/bin/env bash
# SessionStart hook (matcher: clear|compact|resume): keep the work-issue gate bound
# to the live session.
#
# .claude/.work-issue-active holds "<issue id> <session id>", and the PreToolUse gate
# (enforce-issue-step-gate.sh) only applies to that session. /clear — which the loop
# recommends between every command — starts a new session id, so without this hook
# the gate would silently stop applying for the rest of the issue. The payload of a
# SessionStart event always carries the new id; the marker is rewritten from it.
#
# `startup` is deliberately not matched: a second, unrelated session opened in the
# same checkout must not take the marker over. A fresh `claude` re-binds through
# /work-issue, which stamps the marker itself.
#
# Exit 0 always — this hook never blocks anything.

set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
marker="$root/.claude/.work-issue-active"

[ -f "$marker" ] || exit 0

input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || echo "")
[ -n "$sid" ] || exit 0

uuid=$(head -n1 "$marker" | awk '{print $1}' | tr -d '[:space:]')
[ -n "$uuid" ] || exit 0

printf '%s %s\n' "$uuid" "$sid" > "$marker"
exit 0
