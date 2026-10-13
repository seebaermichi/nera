#!/usr/bin/env bash
# issue-loop.sh — slice the plan and work log of an in-flight issue.
#
# The /work-issue loop keeps two files per issue under plans/issues/:
#   <id>-<slug>.md       the plan (lean: header, context, decisions, steps)
#   <id>-<slug>.log.md   the append-only work log (snapshot, reports, verdicts)
#
# <id> is always the issue's FULL id (36 characters), in file names and arguments
# alike — never a prefix. Every <id> argument below may also be "-" (or empty) for
# the issue the marker .claude/.work-issue-active names. Plans written before this
# rule carry only eight characters in their name; they are found by the full id in
# their header.
#
# Every skill reads those files through THIS script, never whole, so that a
# session cleared between two loop commands still finds everything it needs, and
# a plan that grew over eight steps costs the same to read as a fresh one. The
# heading grammar the script parses is the contract:
#
#   plan:  ### Step N — <goal> — <marker>          N = 1, 2, … or 4b; marker ⬜ todo | 🔨 in progress | ✅ done
#   log:   ## Step N — <kind> (<date>)              kind = started | implemented | reviewed | reworked | approved
#          ## Issue snapshot (<date>) | ## Decision (<date>) | ## Carry forward (<date>) | ## Triage (<date>)
#          ## Browser test (<date>)                     with a '- **Result:** PASSED|FAILED|BLOCKED|SKIPPED' line
#          ### Carry forward | ### Fixed alongside       (subsections of an implemented/reworked/reviewed section or a browser test)
#
# Em dashes are part of the grammar. A hyphen matches nothing, on purpose: it is
# the mistake a model makes most, and a silent match on it would make every
# extractor lie.
#
# Usage: bash .claude/scripts/issue-loop.sh <command> [args]   (run from the project root)
#
#   slug <title>                 kebab-case ascii slug (umlauts transliterated)
#   init <id> [title]            create the log for a new issue (needs the title once); prints the log path
#   plan <id>                    path of the plan; exit 1 when it is not written yet
#   plan-path <id>               the plan's path even before it exists (derived from the log)
#   log <id>                     path of the log (created if missing)
#   uuid <id>                    the issue's full id ("-" resolves to the marker's)
#   index <id>                   one line per step: N<TAB>marker<TAB>goal
#   header <id>                  the plan up to '## Steps' (context, decisions, acceptance criteria)
#   current <id>                 N of the 🔨 step, else the first non-✅ step, else "none"
#   marker <id> <N>              todo | progress | done | unknown
#   step <id> [N]                exactly one step block (default: current)
#   section <id> <N> <kind>      the LAST '## Step N — <kind>' log section
#   last <id> <N>                kind of the last log section for step N, or "none"
#   base-sha <id> <N>            the base_sha recorded for step N
#   verdict <id> <N>             approve | rework | none
#   reviews <id> <N>             how many reviewed sections step N has
#   phase <id>                   plan | implement | review | approve | done  (+ reason on stderr)
#   snapshot <id>                the last '## Issue snapshot' section
#   snapshot-fresh <id>          exit 0 when the snapshot is from today or yesterday
#   append <id> <heading>        append "## <heading> (<today>)" + stdin to the log
#   stamp <id>                   write .claude/.work-issue-active as "<id> <session id>"
#   review-context <id>          everything a fresh reviewer needs, framed by sentinels
#   carry-forwards <id>          every carry-forward item in the log: <source><TAB><item>, "none" entries skipped
#   triaged <id>                 exit 0 when the log already holds a '## Triage' section
#   browser-test <id>            "none", or the last browser test's result + fresh|stale: "failed fresh"
#   board-steps <id>             the plan as a checklist for `snagio plan-steps --steps-file=-` ("[x] goal" / "[ ] goal")

set -euo pipefail

root="${CLAUDE_PROJECT_DIR:-$PWD}"
dir="$root/plans/issues"
marker="$root/.claude/.work-issue-active"

uuid_re='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

die() { printf 'issue-loop: %s\n' "$*" >&2; exit 1; }

today() { date +%F; }

marker_uuid() {
  [ -f "$marker" ] || return 0
  head -n1 "$marker" | awk '{print $1}'
}

# Turn a title into the file-name slug both the log (written first) and the plan
# (written later) share, so the two can never drift apart.
slugify() {
  printf '%s' "$1" \
    | sed -e 's/ä/ae/g; s/ö/oe/g; s/ü/ue/g; s/Ä/ae/g; s/Ö/oe/g; s/Ü/ue/g; s/ß/ss/g' \
    | LC_ALL=C tr '[:upper:]' '[:lower:]' \
    | LC_ALL=C tr -c 'a-z0-9\n' '-' \
    | sed -e 's/-\{2,\}/-/g; s/^-//; s/-$//' \
    | awk '{ if (length($0) > 60) { $0 = substr($0, 1, 60); sub(/-[^-]*$/, "", $0) } print }'
}

# The issue id an argument names. Only the FULL id is accepted, never a prefix:
# UUIDv7 prefixes change only every ~65 s and imports batch, so eight characters
# name several issues, and a guess between them works on the wrong plan. Empty or
# "-" means the issue the marker names.
issue_id() {
  local id
  id=$(printf '%s' "${1:-}" | LC_ALL=C tr '[:upper:]' '[:lower:]')
  if [ -z "$id" ] || [ "$id" = "-" ]; then
    id=$(marker_uuid)
    [ -n "$id" ] || die "no issue id given and no .claude/.work-issue-active marker"
    printf '%s' "$id" | command grep -qE "^$uuid_re$" \
      || die "the marker holds '$id', not a full issue id — run /work-issue <full id> to re-arm it"
  fi
  printf '%s' "$id" | command grep -qE "^$uuid_re$" \
    || die "'$id' is not a full issue id — pass all 36 characters (copy it from the board), never a prefix"
  printf '%s\n' "$id"
}

# The base path (no extension) of the issue's file pair. Files are named
# <full id>-<slug>; files from before that carry only the first eight characters,
# so among those the one whose header names the full id wins.
find_base() {
  local id f base
  id=$(issue_id "$1") || exit 1
  for f in "$dir"/"$id"*.md; do
    [ -e "$f" ] || continue
    base="${f%.log.md}"; base="${base%.md}"
    printf '%s\n' "$base"; return 0
  done
  for f in "$dir"/"${id:0:8}"-*.md; do
    [ -e "$f" ] || continue
    command grep -qF -- "$id" "$f" || continue
    base="${f%.log.md}"; base="${base%.md}"
    printf '%s\n' "$base"; return 0
  done
  die "no plan or log for issue $id under plans/issues/ (run /work-issue $id)"
}

plan_of() { local b; b=$(find_base "$1") || return 1; printf '%s.md\n' "$b"; }
log_of() { local b; b=$(find_base "$1") || return 1; printf '%s.log.md\n' "$b"; }

require_plan() {
  local plan
  plan=$(plan_of "$1") || exit 1
  [ -f "$plan" ] || die "plan not written yet: ${plan#"$root"/} (run /plan-issue)"
  printf '%s\n' "$plan"
}

ensure_log() {
  local base log
  base=$(find_base "$1") || exit 1
  log="$base.log.md"
  if [ ! -f "$log" ]; then
    printf '# Work log — %s\n' "$(basename "$base")" > "$log"
  fi
  printf '%s\n' "$log"
}

uuid_of() {
  find_base "$1" >/dev/null || exit 1
  issue_id "$1"
}

# One step heading → "N<TAB>marker<TAB>goal". The goal may itself contain an em
# dash, so the marker is the LAST segment and the goal everything in between.
index_of() {
  local plan
  plan=$(require_plan "$1") || exit 1
  awk '
    /^### Step [0-9]+[a-z]? — / {
      n = split($0, a, " — ")
      id = a[1]; sub(/^### Step /, "", id)
      m = a[n]
      goal = a[2]; for (i = 3; i < n; i++) goal = goal " — " a[i]
      if (n < 3) { goal = a[2]; m = "" }
      status = "unknown"
      if (index(m, "✅")) status = "done"
      else if (index(m, "🔨")) status = "progress"
      else if (index(m, "⬜")) status = "todo"
      printf "%s\t%s\t%s\n", id, status, goal
    }' "$plan"
}

current_of() {
  local idx
  idx=$(index_of "$1") || exit 1
  awk -F'\t' '$2 == "progress" {print $1; found = 1; exit}
              END { if (!found) exit 1 }' <<<"$idx" && return 0
  awk -F'\t' '$2 != "done" {print $1; found = 1; exit}
              END { if (!found) print "none" }' <<<"$idx"
}

marker_of() {
  awk -F'\t' -v n="$2" '$1 == n {print $2; found = 1; exit} END { if (!found) print "unknown" }' <<<"$(index_of "$1")"
}

step_of() {
  local plan n
  plan=$(require_plan "$1") || exit 1
  n="${2:-}"
  if [ -z "$n" ]; then
    n=$(current_of "$1") || exit 1
    [ "$n" != "none" ] || die "every step is done"
  fi
  awk -v n="$n" '
    $0 ~ "^### Step " n " — " { f = 1; print; next }
    f && /^(### |## )/ { exit }
    f' "$plan"
}

header_of() {
  local plan
  plan=$(require_plan "$1") || exit 1
  command grep -q '^## Steps' "$plan" || die "plan has no '## Steps' heading: ${plan#"$root"/}"
  awk '/^## Steps/ { exit } { print }' "$plan"
}

# The LAST "## Step N — <kind>" section, up to the next "## " heading. Last, not
# first: a reworked step is implemented twice and the reviewer wants the recent one.
section_of() {
  local log n kind
  log=$(log_of "$1") || exit 1; n="$2"; kind="$3"
  [ -f "$log" ] || return 0
  awk -v n="$n" -v k="$kind" '
    $0 ~ "^## Step " n " — " k "( |$)" { f = 1; buf = ""; }
    f && /^## / && $0 !~ "^## Step " n " — " k "( |$)" { f = 0 }
    f { buf = buf $0 "\n" }
    END { printf "%s", buf }' "$log"
}

last_kind_of() {
  local log n
  log=$(log_of "$1") || exit 1; n="$2"
  [ -f "$log" ] || { echo none; return 0; }
  awk -v n="$n" '
    $0 ~ "^## Step " n " — (started|implemented|reviewed|reworked|approved)( |$)" {
      k = $0; sub("^## Step " n " — ", "", k); sub(/[ (].*$/, "", k); last = k
    }
    END { print (last == "" ? "none" : last) }' "$log"
}

base_sha_of() {
  local log n
  log=$(log_of "$1") || exit 1; n="$2"
  [ -f "$log" ] || return 0
  awk -v n="$n" '
    $0 ~ "^## Step " n " — (started|implemented|reworked)( |$)" { f = 1; next }
    /^## / { f = 0 }
    f && /^base_sha: / { s = $2 }
    END { print s }' "$log"
}

verdict_of() {
  local v
  v=$(section_of "$1" "$2" reviewed \
      | command grep -oE '^[*_ ]*Verdict[*_]*:[*_ ]*(approve|rework)' \
      | command grep -oE '(approve|rework)$' | tail -n1 || true)
  printf '%s\n' "${v:-none}"
}

reviews_of() {
  local log
  log=$(log_of "$1") || exit 1
  [ -f "$log" ] || { echo 0; return 0; }
  command grep -c -E "^## Step $2 — reviewed( |$)" "$log" || true
}

# The state machine every skill agrees on. The reason goes to stderr so a
# caller can show it without parsing it.
phase_of() {
  local base plan n st last v
  base=$(find_base "$1") || exit 1; plan="$base.md"
  if [ ! -f "$plan" ]; then
    echo "no plan file yet" >&2; echo plan; return 0
  fi
  n=$(current_of "$1") || exit 1
  if [ "$n" = "none" ]; then
    echo "every step is ✅ done" >&2; echo done; return 0
  fi
  st=$(marker_of "$1" "$n") || exit 1
  last=$(last_kind_of "$1" "$n") || exit 1
  case "$st:$last" in
    todo:*)            echo "step $n is ⬜ todo" >&2; echo implement ;;
    progress:none)     echo "step $n is 🔨 but has no log section — implement or resume it" >&2; echo implement ;;
    progress:started)  echo "step $n was started (base_sha recorded) but not reported — resume it" >&2; echo implement ;;
    progress:implemented|progress:reworked)
                       echo "step $n is $last and awaits review" >&2; echo review ;;
    progress:reviewed) v=$(verdict_of "$1" "$n")
                       case "$v" in
                         approve) echo "step $n was reviewed: approve" >&2; echo approve ;;
                         rework)  echo "step $n was reviewed: rework — address the 🔴 findings" >&2; echo implement ;;
                         *)       echo "step $n has a review without a verdict line — review again" >&2; echo review ;;
                       esac ;;
    progress:approved) echo "step $n is logged as approved but still 🔨 — finish /approve-step" >&2; echo approve ;;
    *)                 echo "step $n: marker $st, last log section $last" >&2; echo implement ;;
  esac
}

snapshot_of() {
  local log
  log=$(log_of "$1") || exit 1
  [ -f "$log" ] || return 0
  awk '
    /^## Issue snapshot( |$)/ { f = 1; buf = "" }
    f && /^## / && !/^## Issue snapshot( |$)/ { f = 0 }
    f { buf = buf $0 "\n" }
    END { printf "%s", buf }' "$log"
}

snapshot_fresh() {
  local d
  d=$(snapshot_of "$1" | head -n1 | command grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -n1 || true)
  [ -n "$d" ] || return 1
  [ "$d" = "$(date +%F)" ] || [ "$d" = "$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)" ]
}

append_to_log() {
  local log heading body
  log=$(ensure_log "$1") || exit 1; heading="$2"
  body=$(cat)
  {
    printf '\n## %s (%s)\n\n' "$heading" "$(today)"
    printf '%s\n' "$body"
  } >> "$log"
  printf '%s\n' "$log"
}

stamp_marker() {
  local u
  u=$(issue_id "$1") || exit 1
  mkdir -p "$(dirname "$marker")"
  printf '%s %s\n' "$u" "${CLAUDE_CODE_SESSION_ID:-}" > "$marker"
  printf '%s\n' "$u"
}

init_issue() {
  local u="$1" title="${2:-}" base log
  printf '%s' "$u" | command grep -qE "^$uuid_re$" || die "init needs the full issue id, got '$u'"
  if base=$(find_base "$u" 2>/dev/null); then
    log="$base.log.md"
    [ -f "$log" ] || printf '# Work log — %s\n\n- **Issue:** `%s`\n' "$(basename "$base")" "$u" > "$log"
    printf '%s\n' "$log"
    return 0
  fi
  [ -n "$title" ] || die "no files for $u yet — pass the issue title so the slug can be derived"
  mkdir -p "$dir"
  base="$dir/$u-$(slugify "$title")"
  log="$base.log.md"
  printf '# Work log — %s\n\n- **Issue:** `%s`\n' "$(basename "$base")" "$u" > "$log"
  printf '%s\n' "$log"
}

review_context() {
  local id="$1" plan log n last sha
  plan=$(require_plan "$id") || exit 1; log=$(log_of "$id") || exit 1
  n=$(current_of "$id") || exit 1
  [ "$n" != "none" ] || die "every step is done — nothing to review"
  last=$(last_kind_of "$id" "$n") || exit 1
  sha=$(base_sha_of "$id" "$n") || exit 1

  echo "<<<PLAN>>> ${plan#"$root"/}"
  echo "<<<LOG>>> ${log#"$root"/}"
  echo "<<<STEP>>> $n (last log section: $last, reviews so far: $(reviews_of "$id" "$n"), base_sha: ${sha:-missing})"
  echo "<<<INDEX>>>"; index_of "$id"
  echo "<<<STEP BLOCK>>>"; step_of "$id" "$n"
  echo "<<<IMPLEMENTED>>>"
  # A reworked section always follows the implemented one, so when it exists it
  # is the report the reviewer wants; the previous review carries the 🔴 list.
  rework=$(section_of "$id" "$n" reworked) || exit 1
  if [ -n "$rework" ]; then printf '%s' "$rework"; else section_of "$id" "$n" implemented; fi
  if [ "$(reviews_of "$id" "$n")" -gt 0 ]; then
    echo "<<<PREVIOUS REVIEW>>>"; section_of "$id" "$n" reviewed
  fi
  echo "<<<CHANGES>>>"
  if [ -n "$sha" ]; then
    git -C "$root" diff --stat "$sha" -- 2>/dev/null || echo "(git diff --stat $sha failed)"
    git -C "$root" ls-files --others --exclude-standard | sed 's/^/untracked: /'
  else
    echo "(no base_sha recorded — the implementer skipped the started section; diff against HEAD is the fallback)"
  fi
  echo "<<<END>>>"
}

# Every carry-forward the loop logged, one item per line, prefixed with where it
# came from. Two shapes exist: a top-level '## Carry forward' section (the planner
# cutting scope) and a '### Carry forward' subsection inside a step's report or
# review. A wrapped item (indented continuation lines) is joined onto one line, and
# "- none" placeholders are dropped, so the reconcile triage reads a list, not a log.
carry_forwards_of() {
  local log
  log=$(log_of "$1") || exit 1
  [ -f "$log" ] || return 0
  awk '
    function flush() { if (item != "") print src "\t" item; item = "" }
    /^## / {
      flush(); cf = 0
      src = $0; sub(/^## /, "", src); sub(/ \([0-9-]+\)$/, "", src)
      if (src ~ /^Carry forward/) cf = 1
      next
    }
    /^### / { flush(); cf = ($0 ~ /^### Carry forward/); next }
    !cf { next }
    /^[-*] / {
      flush()
      line = $0; sub(/^[-*] +/, "", line)
      if (tolower(line) ~ /^none([^a-z]|$)/) next
      item = line; next
    }
    /^[ \t]+[^ \t]/ && item != "" { line = $0; sub(/^[ \t]+/, "", line); item = item " " line; next }
    /^[ \t]*$/ { flush(); next }
    END { flush() }' "$log"
}

triaged() {
  local log
  log=$(log_of "$1") || exit 1
  [ -f "$log" ] && command grep -q -E '^## Triage( |$)' "$log"
}

# The last browser test, and whether it still describes the code. A test is stale
# once a step is approved after it — the fix steps the triage added for its failures,
# typically — because that step changed what was tested. A skip is the user's
# answer for the whole issue and never goes stale.
browser_test_of() {
  local log
  log=$(log_of "$1") || exit 1
  [ -f "$log" ] || { echo none; return 0; }
  awk '
    /^## Browser test( |$)/ { t = NR; r = "unknown"; inb = 1; next }
    /^## Step [0-9]+[a-z]? — approved( |$)/ { a = NR }
    /^## / { inb = 0; next }
    inb && /^[-*] +\*\*Result:\*\*/ {
      line = $0; sub(/^[-*] +\*\*Result:\*\* */, "", line); sub(/[^A-Za-z].*$/, "", line)
      r = tolower(line)
    }
    END {
      if (!t) { print "none"; exit }
      print r " " ((a > t && r != "skipped") ? "stale" : "fresh")
    }' "$log"
}

# The plan as the board should show it: every step goal in plan order, ticked
# when ✅. Re-sending this replaces the board's list WITHOUT losing progress,
# which is what lets a step inserted mid-run (4b) or the reconciliation step
# appear on the card while the bar keeps the steps already approved.
board_steps_of() {
  local idx
  idx=$(index_of "$1") || exit 1
  awk -F'\t' '{ printf "[%s] %s\n", ($2 == "done" ? "x" : " "), $3 }' <<<"$idx"
}

cmd="${1:-}"
[ -n "$cmd" ] || { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
shift

case "$cmd" in
  slug)           slugify "${1:-}" ;;
  init)           init_issue "${1:-}" "${2:-}" ;;
  plan)           require_plan "${1:-}" ;;
  plan-path)      plan_of "${1:-}" ;;
  log)            ensure_log "${1:-}" ;;
  uuid)           uuid_of "${1:-}" ;;
  index)          index_of "${1:-}" ;;
  header)         header_of "${1:-}" ;;
  current)        current_of "${1:-}" ;;
  marker)         marker_of "${1:-}" "${2:?step number}" ;;
  step)           step_of "${1:-}" "${2:-}" ;;
  section)        section_of "${1:-}" "${2:?step number}" "${3:?kind}" ;;
  last)           last_kind_of "${1:-}" "${2:?step number}" ;;
  base-sha)       base_sha_of "${1:-}" "${2:?step number}" ;;
  verdict)        verdict_of "${1:-}" "${2:?step number}" ;;
  reviews)        reviews_of "${1:-}" "${2:?step number}" ;;
  phase)          phase_of "${1:-}" ;;
  snapshot)       snapshot_of "${1:-}" ;;
  snapshot-fresh) snapshot_fresh "${1:-}" ;;
  append)         append_to_log "${1:-}" "${2:?heading}" ;;
  stamp)          stamp_marker "${1:-}" ;;
  review-context) review_context "${1:-}" ;;
  carry-forwards) carry_forwards_of "${1:-}" ;;
  triaged)        triaged "${1:-}" ;;
  browser-test)   browser_test_of "${1:-}" ;;
  board-steps)    board_steps_of "${1:-}" ;;
  *)              die "unknown command '$cmd'" ;;
esac
