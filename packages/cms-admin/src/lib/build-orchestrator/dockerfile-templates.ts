/**
 * F144 P3 — Per-framework Dockerfile generator.
 *
 * cms-admin generates the Dockerfile that ships in the ephemeral build
 * VM's /build/Dockerfile. The site's own framework drives the choice:
 *
 *   - Next.js (next.config.* present)  → multi-stage standalone build
 *   - Bun + Hono (bun.lockb present)   → bun build
 *   - Custom (Dockerfile in source/)   → respect site's own Dockerfile
 *   - Static (build.ts only)           → defer to F143 path (this
 *                                        module is only invoked for
 *                                        SSR sites)
 *
 * Each generator returns a string that becomes /build/Dockerfile inside
 * the builder VM. The VM's entrypoint.sh then runs `buildah bud -f
 * Dockerfile` against the extracted source.
 */

export type FrameworkKind = "nextjs" | "bun-hono" | "custom" | "static";

export interface DockerfileGenContext {
  /** Detected framework kind. */
  framework: FrameworkKind;
  /** Optional override for the runtime Node version. Default: 22-alpine. */
  nodeImage?: string;
  /** Port the runtime listens on. Default: 3000. */
  runtimePort?: number;
  /** Custom build command. If set, overrides the framework default. */
  customBuildCommand?: string;
  /** Custom start command. If set, overrides the framework default. */
  customStartCommand?: string;
  /** Path to existing Dockerfile in the source (if framework === 'custom'). */
  customDockerfilePath?: string;
}

/**
 * Generate the Dockerfile contents for a given framework. Caller writes
 * the result to /build/Dockerfile inside the build VM.
 *
 * Throws if framework === 'custom' and customDockerfilePath is unset.
 * Throws if framework === 'static' (use F143 build path instead).
 */
export function generateDockerfile(ctx: DockerfileGenContext): string {
  const nodeImage = ctx.nodeImage ?? "node:22-alpine";
  const port = ctx.runtimePort ?? 3000;

  switch (ctx.framework) {
    case "nextjs":
      return nextjsDockerfile(nodeImage, port, ctx.customBuildCommand, ctx.customStartCommand);
    case "bun-hono":
      return bunHonoDockerfile(port, ctx.customBuildCommand, ctx.customStartCommand);
    case "custom":
      // Caller passes the path; we just reference it. The actual file
      // is in the source tree and buildah finds it normally.
      throw new Error(
        "Custom framework — caller should use the existing Dockerfile in source/, not generate one.",
      );
    case "static":
      throw new Error(
        "Static sites use F143 build path (cms-admin runs build.ts in-process). " +
          "F144 builders are only for SSR / dynamic sites.",
      );
  }
}

// ── Next.js ────────────────────────────────────────────────────────

function nextjsDockerfile(nodeImage: string, port: number, buildCmd?: string, startCmd?: string): string {
  const build = buildCmd ?? "pnpm build";
  const start = startCmd ?? "node server.js";
  return `# F144-generated Next.js Dockerfile
# Multi-stage build: deps → builder → runner
# Uses Next.js standalone output for minimal runtime image.

FROM ${nodeImage} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --prod=false; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \\
    else npm install; fi

FROM ${nodeImage} AS builder
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN ${build}

FROM ${nodeImage} AS runner
WORKDIR /app
RUN apk add --no-cache curl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=${port}
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 nextjs
# Next.js standalone copies what's needed; static + public follow.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE ${port}
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \\
  CMD curl -fsS http://localhost:${port}/api/health || exit 1
CMD ["${start}"]
`;
}

// ── Bun + Hono ─────────────────────────────────────────────────────

function bunHonoDockerfile(port: number, buildCmd?: string, startCmd?: string): string {
  const build = buildCmd ?? "bun build src/server.ts --target=bun --outfile=dist/server.js";
  const start = startCmd ?? "bun dist/server.js";
  return `# F144-generated Bun + Hono Dockerfile
# Single-stage — Bun is the runtime, no separate runner stage.

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
RUN ${build}

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${port}
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE ${port}
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \\
  CMD wget -q --spider http://localhost:${port}/api/health || exit 1
CMD ["sh", "-c", "${start}"]
`;
}

/**
 * Auto-detect framework from filesystem signals in a project directory.
 * Returns the framework kind. Pure function — caller checks file
 * existence + passes the result.
 */
export function detectFrameworkFromFiles(files: {
  hasNextConfig: boolean;
  hasBunLockb: boolean;
  hasViteConfig: boolean;
  hasDockerfile: boolean;
  hasBuildTs: boolean;
}): FrameworkKind {
  // Order matters — most specific signal first
  if (files.hasDockerfile) return "custom";
  if (files.hasNextConfig) return "nextjs";
  if (files.hasBunLockb) return "bun-hono";
  if (files.hasViteConfig) return "static"; // SPA = static for our purposes
  if (files.hasBuildTs) return "static";
  // Default to nextjs as the most common case if nothing else matches
  return "nextjs";
}
