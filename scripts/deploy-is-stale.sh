#!/usr/bin/env bash
# Is the commit we are about to deploy OLDER than the one already live?
#
#   deploy-is-stale.sh <candidate-sha> <live-sha>
#   exit 0 + "stale"  → candidate is a strict ancestor of live: do NOT deploy
#   exit 1 + "deploy" → anything else (newer, same, unrelated, unknown live)
#
# Why: 23 Oct 2026 three pushes landed minutes apart. The oldest run's test gate
# finished LAST, and its deploy then replaced the newest code with older code —
# cms.fysio.work fell back to English for ~5 minutes. GitHub's concurrency group
# only cancels a deploy that is running at the same moment, not one that arrives
# late. Fails OPEN: if the live sha is missing or not in our history (a manual
# image deploy), we deploy as before rather than block a release.
set -u
candidate="${1:-}"
live="${2:-}"

if [ -z "$candidate" ] || [ -z "$live" ] || [ "$candidate" = "$live" ]; then
  echo deploy; exit 1
fi
if ! git cat-file -e "${live}^{commit}" 2>/dev/null; then
  echo deploy; exit 1
fi
if git merge-base --is-ancestor "$candidate" "$live"; then
  echo stale; exit 0
fi
echo deploy; exit 1
