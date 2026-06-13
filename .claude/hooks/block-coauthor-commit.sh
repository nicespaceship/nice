#!/usr/bin/env bash
#
# PreToolUse(Bash) guard — block any `git commit` whose message carries a
# Co-Authored-By trailer. Benjamin is the sole author of NICE commits; no AI
# attribution is ever added (see CLAUDE.md → Git Commit Standards).
#
# Decision: hard `deny`. There is no legitimate Co-Authored-By in this repo,
# so this never needs an override.
#
# Known limitation: only the command string is inspected, so a message piped
# via a file (`git commit -F msg.txt`) where the trailer lives in the file is
# not caught. Claude authors commits with inline `-m`, which this covers.
#
# Output contract: emit a deny decision as JSON on stdout and exit 0. Emitting
# nothing (exit 0) defers to the normal permission flow.

set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Act only on a git commit whose message carries an actual trailer. Match the
# trailer form (token followed by a colon) rather than the bare phrase, so a
# commit body that merely discusses the policy does not trip the guard.
if printf '%s' "$cmd" | grep -qi 'commit' \
  && printf '%s' "$cmd" | grep -qiE 'co-authored-by[[:space:]]*:'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Blocked: this git commit carries a Co-Authored-By trailer. NICE commits add no AI attribution (CLAUDE.md → Git Commit Standards). Re-run the commit without the Co-Authored-By line."
    }
  }'
fi

exit 0
