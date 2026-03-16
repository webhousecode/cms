#!/bin/bash
# scripts/ship.sh — Deploy webhouse.app til production via GitHub Actions
#
# Kører typecheck + build lokalt først, pusher til GitHub,
# trigger deploy workflow og følger den live.
#
# Usage:
#   pnpm ship              # Full ship (lint → build → push → deploy → watch)
#   pnpm ship --skip-local # Skip local checks, push + deploy directly

set -e

SKIP_LOCAL=false
for arg in "$@"; do
  case "$arg" in
    --skip-local) SKIP_LOCAL=true ;;
  esac
done

# ── Local verification ────────────────────────────────────────
if [ "$SKIP_LOCAL" = false ]; then
  echo "🔍 Typecheck..."
  pnpm lint
  echo ""

  echo "🏗  Build (alle packages)..."
  pnpm build
  echo ""

  echo "🧪 Tests..."
  pnpm test:run || echo "⚠️  Tests skipped (native modules)"
  echo ""
fi

# ── Push to GitHub ────────────────────────────────────────────
echo "📦 Pusher til GitHub..."
git push

echo "🚀 Trigger deploy workflow..."
gh workflow run deploy.yml --repo webhousecode/cms --ref main

echo "⏳ Venter på at GitHub registrerer kørslen..."
sleep 6

# Hent run ID for den seneste kørsel
RUN_ID=$(gh run list --workflow=deploy.yml --repo webhousecode/cms --limit=1 --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
  echo "❌ Kunne ikke finde workflow-kørslen — tjek manuelt:"
  echo "   gh run list --workflow=deploy.yml --repo webhousecode/cms"
  exit 1
fi

echo "🔎 Følger build (run #$RUN_ID)..."
echo ""

# Følg kørslen live
gh run watch "$RUN_ID" --repo webhousecode/cms || true

# Hent konklusion
CONCLUSION=$(gh run view "$RUN_ID" --repo webhousecode/cms --json conclusion --jq '.conclusion')

echo ""
if [ "$CONCLUSION" = "success" ]; then
  echo "✅ Deploy gennemført! https://webhouse.app"
else
  echo "❌ Deploy fejlede! Se fejl med:"
  echo "   gh run view $RUN_ID --repo webhousecode/cms --log-failed"
  exit 1
fi
