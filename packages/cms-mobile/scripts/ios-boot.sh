#!/bin/bash
# webhouse.app — iOS boot script.
#
# 1. Builds the Vite React app to dist/
# 2. cap sync (copies dist/ into the Xcode project + updates plugins)
# 3. Boots an iOS simulator
# 4. Opens the app in the simulator (or in Xcode if --xcode passed)
#
# Usage:
#   ./scripts/ios-boot.sh           # boots default simulator + runs app
#   ./scripts/ios-boot.sh --xcode   # opens in Xcode instead
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PKG_DIR"

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")"
if [ -n "$LAN_IP" ]; then
  echo "🌐 LAN IP detected: $LAN_IP"
  echo "   (use this in the onboarding screen if testing against a non-localhost CMS)"
fi

echo ""
echo "📦 Building Vite app..."
pnpm build

echo ""
echo "🔄 Syncing Capacitor..."
npx cap sync ios

if [ "${1:-}" = "--xcode" ]; then
  echo ""
  echo "🛠  Opening Xcode..."
  npx cap open ios
  exit 0
fi

echo ""
echo "📱 Booting iOS simulator + running app..."
echo "   (Cmd+R in Xcode also works if you want HMR)"
npx cap run ios
