#!/bin/bash
# webhouse.app — add a QR PNG to the iOS simulator's photo library.
#
# Once the image is in the sim's Photos app, the mobile app's
# "Choose from photos" QR scan path can pick it up.
#
# Usage:
#   ./scripts/sim-add-qr.sh path/to/qr.png
#
# Tip: download a pairing QR from /admin/account/mobile-pairing
# (right-click → Save image), then point this script at it.
set -e

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path-to-qr.png>" >&2
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "✗ File not found: $1" >&2
  exit 1
fi

echo "📷 Adding $1 to booted simulator's photo library..."
xcrun simctl addmedia booted "$1"
echo "✅ Done. Open the app → Login → Choose from photos."
