#!/usr/bin/env bash
#
# PreToolUse(Bash) guard — when Claude runs `gh pr merge`, inspect the PR's
# changed files and, if they touch a protected area, escalate the merge to the
# human instead of letting Claude merge unattended.
#
# Protected areas (the locked auto-merge carve-out):
#   - supabase/migrations/**          (schema changes)
#   - billing: stripe-config.js, token-config.js, subscription.js, wallet.js
#   - auth/security: security.js, auth-modal.js, any path containing "oauth"
#
# Decisions (set by Benjamin):
#   - Posture on a protected match: `ask` (surface to the human; in an
#     unattended Routine there is no approver, so it effectively holds).
#   - On inspection failure (gh error, offline, PR not found): FAIL OPEN — allow
#     the merge rather than block on a transient error.
#
# Output contract: emit an `ask` decision as JSON on stdout and exit 0. Emitting
# nothing (exit 0) defers to the normal permission flow.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Only act on `gh pr merge` invocations.
if ! printf '%s' "$cmd" | grep -qiE 'gh[[:space:]]+pr[[:space:]]+merge'; then
  exit 0
fi

# Resolve the PR target: the first non-flag token after `merge` (a number, URL,
# or branch). If none is present, `gh pr diff` falls back to the current branch.
after=$(printf '%s' "$cmd" | sed -E 's/.*gh[[:space:]]+pr[[:space:]]+merge//')
target=""
set -f
for tok in $after; do
  case "$tok" in
    -*) continue ;;
    *) target="$tok"; break ;;
  esac
done
set +f

# Fetch the changed-file list. FAIL OPEN on any error or empty result.
if [ -n "$target" ]; then
  files=$(gh pr diff "$target" --name-only 2>/dev/null) || exit 0
else
  files=$(gh pr diff --name-only 2>/dev/null) || exit 0
fi
[ -n "$files" ] || exit 0

# Match changed paths against the protected areas.
protected=$(printf '%s\n' "$files" | grep -iE '(^|/)supabase/migrations/|(^|/)(stripe-config|token-config|subscription|wallet|security|auth-modal)\.js$|oauth' || true)

if [ -n "$protected" ]; then
  reason="This PR touches protected files, which are human-merged under the locked auto-merge policy (migrations / billing / auth-security):
$(printf '%s' "$protected" | sed 's/^/  - /')

Approve only if you intend Claude to run this merge; otherwise decline and merge it yourself."
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
fi

exit 0
