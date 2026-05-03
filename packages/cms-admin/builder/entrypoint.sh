#!/bin/bash
# F144 P1 — Builder VM entrypoint.
#
# Reads inputs from environment + /build/ directory:
#
#   SITE_ID         — for image tagging + callback identification
#   SHA             — git commit SHA or content hash (becomes image tag)
#   TARGET_APP      — Fly app name to deploy the resulting image to
#   REGISTRY_TOKEN  — short-lived GHCR push token (write:packages scope)
#   CALLBACK_URL    — cms-admin endpoint to POST status updates to
#   CALLBACK_TOKEN  — bearer token for the callback POST
#
# Files placed by cms-admin via Fly Machines `files:` parameter:
#
#   /build/source.tar.gz  — site source tree (no node_modules, no
#                            .next, no .git)
#   /build/Dockerfile     — framework-specific Dockerfile generated
#                            by cms-admin (next/bun-hono/custom)
#
# Output: image at ghcr.io/webhousecode/<SITE_ID>:<SHA>
# Side effect: callbacks to cms-admin with phase + log tail.

set -euo pipefail

# ── Helper: post status to cms-admin ────────────────────────────────
post_status() {
  local phase="$1"
  local message="${2:-}"
  if [ -z "${CALLBACK_URL:-}" ]; then
    echo "[builder] (no callback) $phase: $message"
    return 0
  fi
  curl -fsS -X POST "$CALLBACK_URL" \
    -H "Authorization: Bearer ${CALLBACK_TOKEN:-}" \
    -H "Content-Type: application/json" \
    -d "{\"siteId\":\"${SITE_ID}\",\"sha\":\"${SHA}\",\"phase\":\"$phase\",\"message\":$(jq -Rs <<< "$message")}" \
    --max-time 10 \
    --retry 3 \
    --retry-delay 2 \
    >/dev/null 2>&1 || echo "[builder] callback failed for phase $phase"
  echo "[builder] phase=$phase $message"
}

# ── 0. Sanity checks ────────────────────────────────────────────────
post_status "init" "starting builder for $SITE_ID @ $SHA → $TARGET_APP"

for var in SITE_ID SHA TARGET_APP REGISTRY_TOKEN; do
  if [ -z "${!var:-}" ]; then
    post_status "failed" "missing required env var: $var"
    exit 1
  fi
done

if [ ! -f /build/source.tar.gz ]; then
  post_status "failed" "missing /build/source.tar.gz"
  exit 1
fi
if [ ! -f /build/Dockerfile ]; then
  post_status "failed" "missing /build/Dockerfile"
  exit 1
fi

# ── 1. Extract source ───────────────────────────────────────────────
post_status "source-extract" "tar xzf source.tar.gz"
cd /build
mkdir -p source
tar xzf source.tar.gz -C source
SRC_FILE_COUNT=$(find source -type f | wc -l | tr -d ' ')
post_status "source-extract" "extracted $SRC_FILE_COUNT files"

# Move Dockerfile into source dir for buildah's expected layout
cp Dockerfile source/Dockerfile

# ── 2. Build image with buildah (no daemon needed) ──────────────────
IMAGE_TAG="ghcr.io/webhousecode/${SITE_ID}:${SHA}"
LATEST_TAG="ghcr.io/webhousecode/${SITE_ID}:latest"

post_status "image-build" "buildah bud → $IMAGE_TAG"
cd source
build_log_file="/tmp/buildah.log"
if ! buildah --storage-driver=vfs bud \
    --tag "$IMAGE_TAG" \
    --tag "$LATEST_TAG" \
    --file Dockerfile \
    --layers \
    . 2>&1 | tee "$build_log_file"; then
  tail_log=$(tail -c 4000 "$build_log_file")
  post_status "failed" "buildah bud failed:
$tail_log"
  exit 1
fi
post_status "image-build" "image built ($(buildah --storage-driver=vfs images --quiet "$IMAGE_TAG" | head -1))"

# ── 3. Push to GHCR via skopeo ──────────────────────────────────────
post_status "image-push" "skopeo copy → ghcr.io"
GHCR_AUTH_FILE=$(mktemp)
trap 'rm -f "$GHCR_AUTH_FILE"' EXIT

# Buildah saves to local containers-storage by default; push from there.
if ! skopeo copy \
    --src-tls-verify=false \
    --dest-creds "x-access-token:${REGISTRY_TOKEN}" \
    "containers-storage:${IMAGE_TAG}" \
    "docker://${IMAGE_TAG}" 2>&1; then
  post_status "failed" "skopeo push of ${IMAGE_TAG} failed"
  exit 1
fi
if ! skopeo copy \
    --src-tls-verify=false \
    --dest-creds "x-access-token:${REGISTRY_TOKEN}" \
    "containers-storage:${LATEST_TAG}" \
    "docker://${LATEST_TAG}" 2>&1; then
  # Non-fatal: latest tag failed but versioned tag succeeded
  post_status "warn" "latest tag push failed (versioned tag is still good)"
fi

post_status "image-push" "pushed ${IMAGE_TAG} + ${LATEST_TAG}"

# ── 4. Done — auto_destroy=true means Fly kills the VM after exit ──
post_status "done" "builder finished; cms-admin should now flyctl deploy --image ${IMAGE_TAG} --app ${TARGET_APP}"
exit 0
