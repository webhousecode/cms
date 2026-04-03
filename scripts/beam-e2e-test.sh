#!/usr/bin/env bash
# F122 — Beam E2E Test Script
#
# Tests both archive and live beam transfer against a running CMS admin.
# Usage: bash scripts/beam-e2e-test.sh [port] [dev-token]
set -euo pipefail

PORT="${1:-3010}"
DEV_TOKEN="${2:-6b2bd97c4d457e83ec5eb000439e3f083c9dacac39e4ef18b2dd9ab8cdd21610}"
BASE="http://localhost:$PORT"
AUTH="Authorization: Bearer $DEV_TOKEN"
PASSED=0
FAILED=0

pass() { PASSED=$((PASSED+1)); echo "  ✅ $1"; }
fail() { FAILED=$((FAILED+1)); echo "  ❌ $1"; }

echo "═══════════════════════════════════════════"
echo "  F122 Beam E2E Tests — $BASE"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. Archive Export ──
echo "▸ Test 1: Beam Archive Export"
HTTP=$(curl -s -w "%{http_code}" -H "$AUTH" -X POST "$BASE/api/admin/beam/export" -o /tmp/beam-e2e.beam)
if [ "$HTTP" = "200" ]; then
  SIZE=$(wc -c < /tmp/beam-e2e.beam)
  if [ "$SIZE" -gt 1000 ]; then
    pass "Export returned 200 ($SIZE bytes)"
  else
    fail "Export file too small ($SIZE bytes)"
  fi
else
  fail "Export returned HTTP $HTTP"
fi

# Verify it's a valid ZIP with manifest
MANIFEST=$(python3 -c "
import zipfile, json, sys
try:
    with zipfile.ZipFile('/tmp/beam-e2e.beam') as z:
        m = json.loads(z.read('manifest.json'))
        print(f'{m[\"stats\"][\"contentFiles\"]} content, {m[\"stats\"][\"mediaFiles\"]} media, {m[\"stats\"][\"dataFiles\"]} data')
        sys.exit(0)
except Exception as e:
    print(str(e))
    sys.exit(1)
" 2>&1)
if [ $? -eq 0 ]; then
  pass "Archive has valid manifest ($MANIFEST)"
else
  fail "Invalid archive: $MANIFEST"
fi

echo ""

# ── 2. Archive Import ──
echo "▸ Test 2: Beam Archive Import"
# Find first org
FIRST_ORG=$(curl -s -H "$AUTH" "$BASE/api/admin/sites" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    orgs = data if isinstance(data, list) else data.get('orgs', [])
    print(orgs[0]['id'] if orgs else 'webhouse')
except:
    print('webhouse')
" 2>/dev/null || echo "webhouse")

IMPORT_RESULT=$(curl -s -H "$AUTH" -X POST "$BASE/api/admin/beam/import" \
  -F "file=@/tmp/beam-e2e.beam" \
  -F "orgId=$FIRST_ORG" \
  -F "overwrite=true")

IMPORT_OK=$(echo "$IMPORT_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else d.get('error','unknown'))" 2>/dev/null || echo "parse_error")
if [ "$IMPORT_OK" = "ok" ]; then
  IMPORT_STATS=$(echo "$IMPORT_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{d[\"stats\"][\"contentFiles\"]} content, {d[\"checksumErrors\"]} checksum errors')" 2>/dev/null)
  pass "Import succeeded ($IMPORT_STATS)"
else
  fail "Import failed: $IMPORT_OK"
fi

echo ""

# ── 3. Token Generation ──
echo "▸ Test 3: Beam Token Generation"
TOKEN_RESP=$(curl -s -H "$AUTH" -H "Content-Type: application/json" -X POST "$BASE/api/admin/beam/token" -d '{}')
BEAM_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [[ "$BEAM_TOKEN" == beam_* ]]; then
  pass "Token generated: ${BEAM_TOKEN:0:15}..."
else
  fail "Token generation failed: $TOKEN_RESP"
fi

echo ""

# ── 4. Live Beam Push ──
echo "▸ Test 4: Live Beam Push (self-transfer)"
if [ -n "$BEAM_TOKEN" ]; then
  PUSH_RESP=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
    -X POST "$BASE/api/admin/beam/push" \
    -d "{\"targetUrl\": \"$BASE\", \"token\": \"$BEAM_TOKEN\", \"orgId\": \"$FIRST_ORG\"}")

  PUSH_OK=$(echo "$PUSH_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('success') else d.get('error','unknown'))" 2>/dev/null || echo "parse_error")
  if [ "$PUSH_OK" = "ok" ]; then
    BEAM_ID=$(echo "$PUSH_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('beamId',''))" 2>/dev/null)
    pass "Push succeeded (beamId: ${BEAM_ID:0:12}...)"
  else
    fail "Push failed: $PUSH_OK"
  fi
else
  fail "Skipped — no token"
fi

echo ""

# ── 5. Invalid Token Rejection ──
echo "▸ Test 5: Invalid Token Rejection"
REJECT_RESP=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$BASE/api/admin/beam/push" \
  -d '{"targetUrl": "'"$BASE"'", "token": "beam_invalid_fake_token_1234567890", "orgId": "'"$FIRST_ORG"'"}')

REJECT_ERR=$(echo "$REJECT_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
if [[ "$REJECT_ERR" == *"Invalid"* ]] || [[ "$REJECT_ERR" == *"expired"* ]]; then
  pass "Invalid token rejected: $REJECT_ERR"
else
  fail "Expected rejection, got: $REJECT_RESP"
fi

echo ""

# ── 6. Reused Token Rejection ──
echo "▸ Test 6: Reused Token Rejection"
REUSE_RESP=$(curl -s -H "$AUTH" -H "Content-Type: application/json" \
  -X POST "$BASE/api/admin/beam/push" \
  -d "{\"targetUrl\": \"$BASE\", \"token\": \"$BEAM_TOKEN\", \"orgId\": \"$FIRST_ORG\"}")

REUSE_ERR=$(echo "$REUSE_RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('error',''))" 2>/dev/null)
if [[ "$REUSE_ERR" == *"Invalid"* ]] || [[ "$REUSE_ERR" == *"expired"* ]]; then
  pass "Reused token rejected: $REUSE_ERR"
else
  fail "Expected rejection, got: $REUSE_RESP"
fi

echo ""

# ── Summary ──
echo "═══════════════════════════════════════════"
TOTAL=$((PASSED+FAILED))
echo "  Results: $PASSED/$TOTAL passed"
if [ "$FAILED" -gt 0 ]; then
  echo "  ⚠️  $FAILED test(s) failed"
  exit 1
else
  echo "  All tests passed!"
fi
echo "═══════════════════════════════════════════"

# Cleanup
rm -f /tmp/beam-e2e.beam
