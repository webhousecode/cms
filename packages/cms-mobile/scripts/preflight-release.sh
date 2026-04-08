#!/bin/bash
# Pre-flight gate for any release build of webhouse.app.
#
# Aborts if Info.plist still contains the dev ATS bypasses
# (NSAllowsArbitraryLoads). These exist so the simulator can talk to
# https://localhost:3010 with a self-signed mkcert cert during
# Phase 1 development. They MUST be removed before TestFlight or App
# Store submission, otherwise:
#   1. Apple may flag the app as a security risk during review
#   2. Users on hostile networks could be MITM'd by any attacker
#      who can intercept their traffic to their own CMS server
#
# This script is wired into:
#   - The git pre-commit hook (warning, non-blocking)
#   - Future fastlane:beta + fastlane:release (BLOCKING)
#
# When you're ready to ship in Phase 8, the canonical fix is:
#   - Remove NSAllowsArbitraryLoads entirely
#   - Require the user-entered server URL to use a valid TLS chain
#     (Let's Encrypt, real CA, etc)
#   - For local dev, document that developers must install the
#     mkcert root CA in their iOS sim keychain (one-time setup)
set -e

PLIST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ios/App/App/Info.plist"

if [ ! -f "$PLIST" ]; then
  echo "✗ Info.plist not found at $PLIST" >&2
  exit 1
fi

if grep -q "NSAllowsArbitraryLoads" "$PLIST"; then
  echo ""
  echo "🛑 BLOCKED: webhouse.app Info.plist still contains NSAllowsArbitraryLoads."
  echo ""
  echo "   This is a DEV-ONLY setting and MUST NOT ship to TestFlight or"
  echo "   the App Store. See docs/features/F07-phase-1-plan.md and the"
  echo "   tracker task 'Phase 8 BLOCKER: Remove NSAllowsArbitraryLoads'."
  echo ""
  echo "   To fix:"
  echo "   1. Remove the NSAllowsArbitraryLoads* keys from"
  echo "      packages/cms-mobile/ios/App/App/Info.plist"
  echo "   2. Confirm the user-entered server URL uses a real TLS chain"
  echo "   3. Re-run this gate"
  echo ""
  exit 2
fi

echo "✓ Info.plist clean — no arbitrary loads, safe to ship"
