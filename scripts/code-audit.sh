#!/usr/bin/env bash
#
# code-audit.sh — Run knip to find unused code in the monorepo.
#
# Generates a report at scripts/audit-report.md with:
#   - Unused files
#   - Unused exports
#   - Unused dependencies
#   - Unused types
#   - Unlisted dependencies
#
# Usage:
#   bash scripts/code-audit.sh          # Full audit
#   bash scripts/code-audit.sh --fix    # Auto-remove unused exports (careful!)
#

set -euo pipefail
cd "$(dirname "$0")/.."

REPORT="scripts/audit-report.md"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M")

echo "Running knip code audit..."
echo ""

# Run knip and capture output
KNIP_OUTPUT=$(npx knip 2>&1 || true)

# Build report
cat > "$REPORT" << EOF
# Code Audit Report

**Generated:** ${TIMESTAMP}
**Tool:** knip v$(npx knip --version 2>/dev/null || echo "?")

---

## Results

\`\`\`
${KNIP_OUTPUT}
\`\`\`

---

## How to use this report

1. **Unused files** — safe to delete if no dynamic imports reference them
2. **Unused exports** — remove the \`export\` keyword or delete the function
3. **Unused dependencies** — \`pnpm remove <pkg>\` from the relevant package
4. **Unlisted dependencies** — add them to package.json or remove the import
5. **Unused types** — remove if not part of the public API

Run \`npx knip --fix\` to auto-remove unused exports (review changes before committing).
Run \`npx knip --fix --allow-remove-files\` to also delete unused files.

EOF

# Summary
LINES=$(echo "$KNIP_OUTPUT" | wc -l | tr -d ' ')
echo "Audit complete — ${LINES} lines of output"
echo "Report saved to: ${REPORT}"
echo ""

# Show summary counts
echo "=== Summary ==="
echo "$KNIP_OUTPUT" | grep -c "Unused files" 2>/dev/null && true
echo "$KNIP_OUTPUT" | grep -c "Unused dependencies" 2>/dev/null && true
echo "$KNIP_OUTPUT" | grep -c "Unused exports" 2>/dev/null && true
echo ""
echo "Full report: ${REPORT}"
