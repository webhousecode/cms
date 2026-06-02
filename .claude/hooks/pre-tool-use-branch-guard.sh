#!/usr/bin/env bash
# F035.4 — PreToolUse branch-guard for spawned cc sessions.
#
# Fires before every tool call. Refuses Bash `git commit` (or `git push`)
# when the session is a dispatch_card-spawned agent AND the current branch
# is not the assigned agent branch.
#
# Inputs (stdin JSON from cc):
#   { tool_name: "Bash", tool_input: { command: "..." }, session_id: ... }
#
# Env:
#   CARDMEM_SPAWNED_BRANCH — set by dispatch_card's buddy_payload.env.
#     (legacy PROJECTS_SPAWNED_BRANCH honored as fallback for one release).
#     If unset, this hook is a no-op (human cc workflow unchanged).
#
# Exit codes:
#   0  — allow tool call
#   2  — block (cc surfaces stderr to the user/agent)

# Early bail-out BEFORE any potentially-unset-var derefs, so non-spawned
# sessions (the 99% case) never error even on a strict POSIX shell.
SPAWNED_BRANCH="${CARDMEM_SPAWNED_BRANCH:-${PROJECTS_SPAWNED_BRANCH:-}}"
if [ -z "$SPAWNED_BRANCH" ]; then
  exit 0
fi

set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=/dev/null
. "$DIR/_common.sh" 2>/dev/null || true

input=$(cat 2>/dev/null || true)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || echo "")

# Only inspect Bash tool calls
if [[ "$tool_name" != "Bash" ]]; then
  exit 0
fi

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

# Only intervene on git commit / git push
if ! printf '%s' "$cmd" | grep -qE '\bgit\s+(commit|push)\b'; then
  exit 0
fi

# Bail if not in a git repo (nothing to enforce)
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [[ "$current" == "$SPAWNED_BRANCH" ]]; then
  # On the right branch, allow
  exit 0
fi

# Wrong branch — refuse with explicit instruction
{
  printf 'F035.4 branch-guard: this spawned cc session must operate on branch "%s".\n' "$SPAWNED_BRANCH"
  printf 'Current branch is "%s". Run:\n\n' "$current"
  printf '    git checkout -b %s\n\n' "$SPAWNED_BRANCH"
  printf '(or `git checkout %s` if the branch already exists). Then retry the commit/push.\n' "$SPAWNED_BRANCH"
} >&2
exit 2
