#!/usr/bin/env bash
# Checks every public, non-archived, non-fork seebaermichi repo that belongs to Nera
# for the fleet's baseline:
#   - `protect-main` ruleset (no force-push, no deletion) on the default branch
#   - secret scanning + push protection
#   - for packages published to npm: Test + npm version badges in README.md
# Reads GitHub only, so it also catches repos that are not cloned locally.
# Works without credentials too (e.g. in a cloud routine): file contents come from
# raw.githubusercontent.com, and checks that need an admin token are skipped then.
#
# Runs weekly in .github/workflows/fleet-check.yml; a gap fails the run.
#
# Usage: scripts/fleet-check.sh [--fix] [repo ...]
#   --fix   create the ruleset and enable secret scanning/push protection where
#           missing. Badges are only reported: they need a commit and a patch release.
#   repo    limit the check to these repo names (default: all Nera repos)
set -uo pipefail

owner=seebaermichi
fix=0
[ "${1:-}" = --fix ] && { fix=1; shift; }

# GET as JSON: gh when it is logged in, otherwise the anonymous REST API (60 requests/hour).
if gh auth status >/dev/null 2>&1; then
    authed=1
    api() { gh api "$1"; }
else
    authed=0
    api() { curl -fsS -H 'Accept: application/vnd.github+json' "https://api.github.com/$1"; }
fi
raw() { curl -fsS "https://raw.githubusercontent.com/$owner/$1/HEAD/$2"; }

if [ $# -gt 0 ]; then
    repos="$*"
else
    # A failed or empty listing must fail the run: checking zero repos is not "all fine".
    if ! listing=$(api "users/$owner/repos?per_page=100&type=owner"); then
        echo "fleet-check: could not list the repos of $owner" >&2
        exit 2
    fi
    repos=$(jq -r '.[] | select(.archived | not) | select(.fork | not) | select(.private | not) | .name | select(test("^nera|^\\.github$"))' <<<"$listing")
    if [ -z "$repos" ]; then
        echo "fleet-check: the repo listing of $owner contains no Nera repo" >&2
        exit 2
    fi
fi

ruleset='{"name":"protect-main","target":"branch","enforcement":"active","bypass_actors":[],"conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}},"rules":[{"type":"non_fast_forward"},{"type":"deletion"}]}'
gaps=0

for r in $repos; do
    problems=()

    # A failed lookup (rate limit, network) is reported as such, never as a missing ruleset.
    if ! rulesets=$(api "repos/$owner/$r/rulesets" 2>/dev/null); then
        problems+=("ruleset: could not check")
    elif ! jq -r '.[].name' <<<"$rulesets" | grep -qx protect-main; then
        if [ $fix = 1 ] && echo "$ruleset" | gh api -X POST "repos/$owner/$r/rulesets" --input - >/dev/null; then
            problems+=("ruleset: FIXED")
        else
            problems+=("ruleset: missing")
        fi
    fi

    # security_and_analysis is only visible to an admin token.
    [ $authed = 1 ] && ss=$(gh api "repos/$owner/$r" --jq '[.security_and_analysis.secret_scanning.status, .security_and_analysis.secret_scanning_push_protection.status] | join(" ")')
    # A token without admin rights sees no status at all: skip rather than report a gap.
    if [ $authed = 1 ] && [ -n "${ss// /}" ] && [ "$ss" != "enabled enabled" ]; then
        if [ $fix = 1 ] && gh api -X PATCH "repos/$owner/$r" --input - >/dev/null <<<'{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}'; then
            problems+=("secret scanning: FIXED")
        else
            problems+=("secret scanning: $ss")
        fi
    fi

    # Badges only for @nera-static packages that are actually on npm (legacy packages are exempt).
    name=$(raw "$r" package.json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const p=JSON.parse(s);if(!p.private)console.log(p.name)}catch{}})')
    if [[ $name == @nera-static/* ]] && npm view "$name" name >/dev/null 2>&1; then
        readme=$(raw "$r" README.md 2>/dev/null)
        grep -q "seebaermichi/$r/actions/workflows/test.yml/badge.svg" <<<"$readme" || problems+=("README: Test badge missing")
        grep -q "img.shields.io/npm/v/$name" <<<"$readme" || problems+=("README: npm badge missing")
    fi

    if [ ${#problems[@]} -gt 0 ]; then
        printf '%-40s %s\n' "$r" "$(IFS=';'; echo "${problems[*]}")"
        for p in "${problems[@]}"; do [[ $p == *FIXED ]] || gaps=$((gaps + 1)); done
    fi
done

[ $authed = 0 ] && echo "fleet-check: not logged in to gh, secret scanning not checked"
[ $gaps = 0 ] && echo "fleet-check: all $(wc -w <<<"$repos" | tr -d ' ') repos meet the baseline" || echo "fleet-check: $gaps open gap(s)"
[ $gaps = 0 ]
