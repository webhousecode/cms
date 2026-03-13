# ── Stage 1: deps ───────────────────────────────────────────────
FROM node:22-alpine AS deps

# Native addon build tools (for better-sqlite3)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# Copy workspace manifests first (layer cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs tsconfig.base.json ./
COPY packages/cms/package.json           ./packages/cms/package.json
COPY packages/cms-cli/package.json       ./packages/cms-cli/package.json
COPY packages/cms-ai/package.json        ./packages/cms-ai/package.json
COPY packages/cms-admin/package.json     ./packages/cms-admin/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: build ──────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app

COPY packages/cms       ./packages/cms
COPY packages/cms-admin ./packages/cms-admin

# Build @webhouse/cms (cms-admin depends on it as a workspace package)
RUN pnpm --filter @webhouse/cms build

# Build cms-admin Next.js app
RUN pnpm --filter @webhouse/cms-admin build

# ── Stage 3: runtime ────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

# Copy built output + workspace dependencies needed at runtime
COPY --from=builder /app/node_modules              ./node_modules
COPY --from=builder /app/packages/cms              ./packages/cms
COPY --from=builder /app/packages/cms-admin        ./packages/cms-admin

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app

USER nextjs

WORKDIR /app/packages/cms-admin

EXPOSE 3010

CMD ["pnpm", "start"]
