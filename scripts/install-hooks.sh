#!/bin/bash
# Install git hooks for this repo
# Run once after clone: bash scripts/install-hooks.sh

HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/bin/bash
# Pre-commit hook: run builtin-blocks contract tests
if git diff --cached --name-only | grep -q "builtin-blocks"; then
  echo "⚡ builtin-blocks.ts changed — running contract tests..."
  cd "$(git rev-parse --show-toplevel)/packages/cms"
  npx vitest run src/schema/__tests__/builtin-blocks.test.ts --reporter=verbose 2>&1
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Builtin blocks contract test FAILED."
    echo "   You changed a field name or type that existing content depends on."
    exit 1
  fi
  echo "✅ Builtin blocks contract tests passed."
fi
HOOK

chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ Git hooks installed"
