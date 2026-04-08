#!/bin/bash
# webhouse.app — iOS simulator deep link login.
#
# Opens a `webhouseapp://login?...` deep link inside the booted iOS simulator,
# bypassing the QR camera scan (which doesn't work on simulators since they
# have no camera).
#
# Usage:
#   # 1. Generate a pairing code on the desktop CMS:
#   #    https://localhost:3010/admin/account/mobile-pairing
#   # 2. Click "Developer: deep link URL" → copy the webhouseapp:// URL
#   # 3. Paste it as the first arg to this script:
#   ./scripts/ios-deeplink-login.sh "webhouseapp://login?server=...&token=..."
#
# Or pass --auto to fetch a pairing token from the local CMS automatically
# (requires the CMS to be running on https://localhost:3010 and the
# CMS_DEV_TOKEN env var to be set).
set -e

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <webhouseapp://login?...>" >&2
  echo "" >&2
  echo "Get a deep link URL from /admin/account/mobile-pairing → Developer details" >&2
  exit 1
fi

URL="$1"
echo "📱 Opening deep link in booted iOS simulator..."
echo "   $URL"
xcrun simctl openurl booted "$URL"
echo "✅ Sent."
