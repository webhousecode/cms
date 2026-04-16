#!/usr/bin/env bash
# Run the same quality gate + build as the weekly release workflow, locally.
# Useful to verify a release would pass before pushing a tag, or to rebuild
# the tarball for local testing.
#
# Usage:   pnpm weekly
# Output:  /tmp/cms-admin-local-<YYYY.MM.DD>.tar.gz  +  standalone smoke test
#
# Exits non-zero on the first failure — matches CI gate behavior.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
VERSION="$(date -u +"%Y.%m.%d")"
STAGE="/tmp/cms-admin-$VERSION"

step() { printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$*"; }

step "1/6 Typecheck (cms-admin + cms core)"
pnpm exec tsc --noEmit --project packages/cms-admin/tsconfig.json
pnpm --filter @webhouse/cms exec tsc --noEmit

step "2/6 Tests (cms core, 186 tests)"
pnpm --filter @webhouse/cms exec vitest run --reporter=dot

step "3/6 Tests (cms-admin, 569 tests)"
pnpm --filter @webhouse/cms-admin exec vitest run --reporter=dot

step "4/6 Build workspace (except cms-admin + blog)"
pnpm build --filter='!@webhouse/cms-admin' --filter='!@webhouse/cms-example-blog'

step "5/6 Build cms-admin (Next.js standalone)"
pnpm --filter @webhouse/cms-admin build

step "6/6 Assemble tarball + smoke test"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R packages/cms-admin/.next/standalone/. "$STAGE/"
rm -rf "$STAGE/packages/cms-mobile" "$STAGE/examples" 2>/dev/null || true
mkdir -p "$STAGE/packages/cms-admin/.next"
cp -R packages/cms-admin/.next/static "$STAGE/packages/cms-admin/.next/static"
[ -d packages/cms-admin/public ] && cp -R packages/cms-admin/public "$STAGE/packages/cms-admin/public"

cat > "$STAGE/run.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/packages/cms-admin"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3010}"
exec node server.js
SH
chmod +x "$STAGE/run.sh"

TARBALL="/tmp/cms-admin-$VERSION.tar.gz"
tar -czf "$TARBALL" -C /tmp "cms-admin-$VERSION"
SIZE="$(du -sh "$TARBALL" | cut -f1)"

# Smoke test: start the server on a random port, curl /admin/login, kill it.
PORT=4917 HOSTNAME=127.0.0.1 node "$STAGE/packages/cms-admin/server.js" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 3
HTTP="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4917/admin/login || echo 000)"
kill "$SERVER_PID" 2>/dev/null || true
wait 2>/dev/null || true

printf "\n\033[1;32m✓ Release gate PASSED\033[0m\n"
printf "  Version:   %s\n" "$VERSION"
printf "  Tarball:   %s (%s)\n" "$TARBALL" "$SIZE"
printf "  Stage:     %s\n" "$STAGE"
printf "  Smoke:     HTTP %s on /admin/login\n" "$HTTP"

if [ "$HTTP" != "200" ] && [ "$HTTP" != "302" ] && [ "$HTTP" != "303" ]; then
  printf "\n\033[1;31m⚠ Smoke test did not return 200/302/303 — investigate\033[0m\n"
  exit 1
fi
