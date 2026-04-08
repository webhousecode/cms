#!/bin/bash
# webhouse.app — Android boot script.
#
# 1. Builds the Vite React app to dist/
# 2. cap sync (copies dist/ into the Android project + updates plugins)
# 3. Runs the app on a connected device or running emulator
#
# Usage:
#   ./scripts/android-boot.sh           # build + sync + run
#   ./scripts/android-boot.sh --studio  # opens in Android Studio instead
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PKG_DIR"

echo "📦 Building Vite app..."
pnpm build

echo ""
echo "🔄 Syncing Capacitor..."
npx cap sync android

if [ "${1:-}" = "--studio" ]; then
  echo ""
  echo "🛠  Opening Android Studio..."
  npx cap open android
  exit 0
fi

echo ""
echo "📱 Running on Android device/emulator..."
npx cap run android
