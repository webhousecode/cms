# F144 P1 — Ephemeral Builder VM image.
#
# Used by cms-admin to build SSR sites (Next.js, Bun/Hono, etc.) on
# spawn-and-destroy Fly Machines. Lifecycle:
#
#   1. cms-admin → POST Fly Machines API: spawn machine with this image,
#      mount source tar + Dockerfile via `files:` parameter
#   2. machine entrypoint runs: tar xzf source.tar.gz && build → produces
#      image → push to GHCR → POST callback → exit (auto_destroy=true)
#   3. cms-admin: flyctl deploy --image ghcr.io/.../<sha> --app <target>
#
# Stays small (~200 MB) because we don't pre-install framework deps —
# each build's `pnpm install` happens inside the build phase against
# the source's own package.json. The base image only has the tools.
#
# Build + push:
#   docker build -t ghcr.io/webhousecode/cms-builder:latest \
#     packages/cms-admin/builder/
#   docker push ghcr.io/webhousecode/cms-builder:latest

FROM node:22-alpine

# Tools the entrypoint needs:
#   - bash      — for the entrypoint script + curl/jq usage
#   - curl      — POST callbacks to cms-admin + image pulls
#   - jq        — parse JSON bits out of the source manifest
#   - git       — fall-back source pull (if cms-admin opts to pass a
#                 git ref instead of an inline tar)
#   - tar       — already in alpine but explicit for clarity
#   - skopeo    — push container images to GHCR WITHOUT a Docker daemon
#                 (Docker-in-Docker isn't trivial on Fly Machines; skopeo
#                 + buildah is the rootless alternative we use)
#   - buildah   — build OCI images from a Dockerfile, no daemon needed
#   - openssh-client — to scp/rsync alternatives if the orchestrator
#                       chooses non-image deploy targets
RUN apk add --no-cache \
    bash \
    curl \
    jq \
    git \
    tar \
    skopeo \
    buildah \
    openssh-client \
    ca-certificates

# Install pnpm + bun globally so build phases for either runtime work
# without the source repo's package-manager bootstrap.
RUN npm install -g pnpm@10.30.3 \
 && curl -fsSL https://bun.sh/install | bash \
 && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Workspace where source lands + builds happen.
# cms-admin writes /build/source.tar.gz + /build/Dockerfile via Fly's
# `files:` parameter at machine-spawn time.
WORKDIR /build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production

# Default: run the F144 build pipeline. Can be overridden by passing
# `cmd: ["sh", "-c", "..."]` in the Fly Machines spawn payload for
# debug runs.
ENTRYPOINT ["/entrypoint.sh"]
