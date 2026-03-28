#!/opt/homebrew/bin/bash
# F67 — Security Gate pre-commit hook
# Scans staged files for secrets and critical SAST findings.
# Install: ln -sf ../../scripts/security-gate-hook.sh .git/hooks/pre-commit

set -e

echo "Security Gate — scanning staged files..."

FAIL=0

# 1. Secrets scan on staged files (gitleaks)
if command -v gitleaks &> /dev/null; then
  if ! gitleaks protect --staged --no-banner 2>/dev/null; then
    echo "BLOCKED: Secrets detected in staged files!"
    echo "Remove the secret, use environment variables instead."
    FAIL=1
  fi
else
  echo "  gitleaks not installed (brew install gitleaks)"
fi

# 2. Check for NEXT_PUBLIC_ env vars that look like secrets
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null)
if [ -n "$STAGED" ]; then
  SUSPECTS=$(echo "$STAGED" | grep -v 'security-scan\|security-gate' | grep -v '\.md$' | xargs grep -l 'NEXT_PUBLIC_.*\(KEY\|SECRET\|TOKEN\|PASSWORD\|PRIVATE\)' 2>/dev/null || true)
  if [ -n "$SUSPECTS" ]; then
    echo "WARNING: Potential secrets exposed via NEXT_PUBLIC_ prefix:"
    echo "$SUSPECTS"
    echo "NEXT_PUBLIC_ variables are sent to the browser — never put secrets there."
    FAIL=1
  fi
fi

# 3. Check for hardcoded API keys (simple entropy check)
if [ -n "$STAGED" ]; then
  JS_FILES=$(echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx|mjs)$' || true)
  if [ -n "$JS_FILES" ]; then
    # Look for common patterns: apiKey = "...", token: "sk-...", etc.
    HARDCODED=$(echo "$JS_FILES" | xargs grep -nE '(api[Kk]ey|apiSecret|token|password|secret)\s*[:=]\s*["\x27][A-Za-z0-9_\-]{20,}' 2>/dev/null | grep -v '.env' | grep -v 'test' | grep -v 'mock' | grep -v '\.d\.ts' || true)
    if [ -n "$HARDCODED" ]; then
      echo "WARNING: Possible hardcoded secrets found:"
      echo "$HARDCODED"
      FAIL=1
    fi
  fi
fi

# 4. Semgrep SAST (if installed, critical findings only)
if command -v semgrep &> /dev/null; then
  JS_FILES=$(echo "$STAGED" | grep -E '\.(ts|tsx|js|jsx|mjs)$' || true)
  if [ -n "$JS_FILES" ]; then
    echo "$JS_FILES" | tr '\n' '\0' | xargs -0 semgrep \
      --config p/secrets --config p/owasp-top-ten \
      --severity ERROR --quiet 2>/dev/null || true
  fi
else
  echo "  semgrep not installed (brew install semgrep)"
fi

if [ $FAIL -ne 0 ]; then
  echo ""
  echo "Security gate FAILED. Fix issues above before committing."
  exit 1
fi

echo "Security gate passed."
