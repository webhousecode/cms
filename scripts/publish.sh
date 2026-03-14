#!/bin/bash
set -e

# Publish all @webhouse/cms packages in dependency order
# pnpm publish automatically replaces workspace:* with real versions

cd "$(dirname "$0")/.."

echo "Publishing @webhouse/cms packages in dependency order..."
echo ""

PACKAGES=(
  "packages/cms"
  "packages/cms-ai"
  "packages/cms-mcp-client"
  "packages/cms-mcp-server"
  "packages/cms-cli"
)

for pkg in "${PACKAGES[@]}"; do
  name=$(node -p "require('./$pkg/package.json').name")
  version=$(node -p "require('./$pkg/package.json').version")
  echo "📦 Publishing $name@$version..."
  cd "$pkg"
  pnpm publish --access public --no-git-checks
  cd "$(dirname "$0")/.."
  echo "✅ $name@$version published"
  echo ""
done

echo "🎉 All packages published!"
