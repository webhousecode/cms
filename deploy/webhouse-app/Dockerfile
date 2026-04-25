# syntax=docker/dockerfile:1.7
# webhouse.app — CMS Admin + Landing Page
# Deployed to Fly.io as app "webhouse-app"

# ── Stage 1: deps ─────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc* ./
COPY pnpm-approve-builds.json ./
COPY .pnpmfile.cjs ./
COPY tsconfig.base.json ./

COPY packages/cms/package.json            ./packages/cms/
COPY packages/cms-ai/package.json         ./packages/cms-ai/
COPY packages/cms-cli/package.json        ./packages/cms-cli/
COPY packages/cms-admin/package.json      ./packages/cms-admin/
COPY packages/cms-admin-cli/package.json  ./packages/cms-admin-cli/
COPY packages/cms-mcp-client/package.json ./packages/cms-mcp-client/
COPY packages/cms-mcp-server/package.json ./packages/cms-mcp-server/
COPY packages/create-cms/package.json     ./packages/create-cms/

COPY examples/blog/package.json           ./examples/blog/
COPY examples/landing/package.json        ./examples/landing/

# BuildKit cache mount: pnpm store survives between builds.
# Drops `pnpm install` from ~3 min cold to ~10 sek warm.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ── Stage 2: builder ──────────────────────────────────────────
FROM deps AS builder

COPY . .

# BuildKit cache mounts for tsup + Next.js incremental caches.
# When only cms-admin source changed, the unchanged workspace packages
# (cms, cms-ai, cms-mcp-*) reuse their tsup output instead of rebuilding.
RUN --mount=type=cache,id=cms-tsup-cms,target=/app/packages/cms/.tsup-cache \
    --mount=type=cache,id=cms-tsup-ai,target=/app/packages/cms-ai/.tsup-cache \
    --mount=type=cache,id=cms-tsup-mcp-client,target=/app/packages/cms-mcp-client/.tsup-cache \
    --mount=type=cache,id=cms-tsup-mcp-server,target=/app/packages/cms-mcp-server/.tsup-cache \
    --mount=type=cache,id=cms-next-cache,target=/app/packages/cms-admin/.next/cache \
    pnpm --filter @webhouse/cms build \
 && pnpm --filter @webhouse/cms-ai build \
 && pnpm --filter @webhouse/cms-mcp-client build \
 && pnpm --filter @webhouse/cms-mcp-server build \
 && pnpm --filter @webhouse/cms-admin build

# ── Stage 3: runner ───────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3010

# Copy workspace root manifests (needed for pnpm workspace resolution)
COPY --from=builder /app/package.json            ./package.json
COPY --from=builder /app/pnpm-workspace.yaml     ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml          ./pnpm-lock.yaml

# Copy built admin + runtime dependencies
COPY --from=builder /app/node_modules            ./node_modules
COPY --from=builder /app/packages/cms            ./packages/cms
COPY --from=builder /app/packages/cms-admin      ./packages/cms-admin
COPY --from=builder /app/packages/cms-ai         ./packages/cms-ai
COPY --from=builder /app/packages/cms-mcp-client ./packages/cms-mcp-client
COPY --from=builder /app/packages/cms-mcp-server ./packages/cms-mcp-server

# Bake in cms.config.ts seed for webhouse.app
COPY deploy/webhouse-app/cms.config.ts  /seed/cms.config.ts

# Start script
COPY deploy/webhouse-app/start.sh /start.sh

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app \
 && chown -R nextjs:nodejs /seed \
 && chown nextjs:nodejs /start.sh \
 && chmod +x /start.sh \
 && mkdir -p /data && chown nextjs:nodejs /data

USER nextjs

WORKDIR /app/packages/cms-admin

EXPOSE 3010

CMD ["/start.sh"]
