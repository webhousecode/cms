/**
 * F144 P3 — Dockerfile generator tests.
 *
 * Verifies:
 *   - nextjs framework produces multi-stage standalone Dockerfile
 *   - bun-hono framework produces single-stage Bun Dockerfile
 *   - custom + static throw with helpful errors
 *   - port + nodeImage overrides land in output
 *   - custom build/start commands replace defaults
 *   - detectFrameworkFromFiles picks the right kind from signals
 */
import { describe, it, expect } from "vitest";
import {
  generateDockerfile,
  detectFrameworkFromFiles,
} from "../build-orchestrator/dockerfile-templates";

describe("generateDockerfile — Next.js", () => {
  it("emits multi-stage build with deps + builder + runner", () => {
    const out = generateDockerfile({ framework: "nextjs" });
    expect(out).toContain("FROM node:22-alpine AS deps");
    expect(out).toContain("FROM node:22-alpine AS builder");
    expect(out).toContain("FROM node:22-alpine AS runner");
    expect(out).toContain("/app/.next/standalone");
    expect(out).toContain("EXPOSE 3000");
    expect(out).toContain("HEALTHCHECK");
  });

  it("respects nodeImage override", () => {
    const out = generateDockerfile({ framework: "nextjs", nodeImage: "node:20-bullseye" });
    expect(out).toContain("FROM node:20-bullseye AS deps");
    expect(out).not.toContain("node:22-alpine");
  });

  it("respects runtimePort override", () => {
    const out = generateDockerfile({ framework: "nextjs", runtimePort: 8080 });
    expect(out).toContain("EXPOSE 8080");
    expect(out).toContain("ENV PORT=8080");
    expect(out).toContain("http://localhost:8080/api/health");
  });

  it("uses custom build + start commands when provided", () => {
    const out = generateDockerfile({
      framework: "nextjs",
      customBuildCommand: "pnpm exec custom-build --production",
      customStartCommand: "node custom/server.js",
    });
    expect(out).toContain("RUN pnpm exec custom-build --production");
    expect(out).toContain('CMD ["node custom/server.js"]');
    expect(out).not.toContain("RUN pnpm build");
  });

  it("falls back to default pnpm build + node server.js", () => {
    const out = generateDockerfile({ framework: "nextjs" });
    expect(out).toContain("RUN pnpm build");
    expect(out).toContain('CMD ["node server.js"]');
  });
});

describe("generateDockerfile — Bun + Hono", () => {
  it("emits single-stage Bun image with builder + runner", () => {
    const out = generateDockerfile({ framework: "bun-hono" });
    expect(out).toContain("FROM oven/bun:1-alpine AS builder");
    expect(out).toContain("FROM oven/bun:1-alpine AS runner");
    expect(out).toContain("EXPOSE 3000");
    expect(out).toContain("bun install --frozen-lockfile");
  });

  it("uses default bun build + bun start", () => {
    const out = generateDockerfile({ framework: "bun-hono" });
    expect(out).toContain("RUN bun build src/server.ts --target=bun --outfile=dist/server.js");
    expect(out).toContain('CMD ["sh", "-c", "bun dist/server.js"]');
  });

  it("respects port override", () => {
    const out = generateDockerfile({ framework: "bun-hono", runtimePort: 4000 });
    expect(out).toContain("ENV PORT=4000");
    expect(out).toContain("EXPOSE 4000");
    expect(out).toContain("http://localhost:4000/api/health");
  });

  it("uses custom build/start when provided", () => {
    const out = generateDockerfile({
      framework: "bun-hono",
      customBuildCommand: "bun run build",
      customStartCommand: "bun start",
    });
    expect(out).toContain("RUN bun run build");
    expect(out).toContain('CMD ["sh", "-c", "bun start"]');
  });
});

describe("generateDockerfile — error cases", () => {
  it("throws for custom framework (caller uses source/Dockerfile)", () => {
    expect(() => generateDockerfile({ framework: "custom" })).toThrow(
      /Custom framework.*existing Dockerfile/,
    );
  });

  it("throws for static framework (use F143 path)", () => {
    expect(() => generateDockerfile({ framework: "static" })).toThrow(
      /F143 build path.*F144 builders are only for SSR/,
    );
  });
});

describe("detectFrameworkFromFiles", () => {
  it("returns custom when source has Dockerfile (highest priority)", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: true,
        hasNextConfig: true,
        hasBunLockb: true,
        hasViteConfig: true,
        hasBuildTs: true,
      }),
    ).toBe("custom");
  });

  it("returns nextjs when next.config.* present (no Dockerfile)", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: false,
        hasNextConfig: true,
        hasBunLockb: false,
        hasViteConfig: false,
        hasBuildTs: false,
      }),
    ).toBe("nextjs");
  });

  it("returns bun-hono when bun.lockb present without next config", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: false,
        hasNextConfig: false,
        hasBunLockb: true,
        hasViteConfig: false,
        hasBuildTs: false,
      }),
    ).toBe("bun-hono");
  });

  it("returns static for vite SPA", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: false,
        hasNextConfig: false,
        hasBunLockb: false,
        hasViteConfig: true,
        hasBuildTs: false,
      }),
    ).toBe("static");
  });

  it("returns static for build.ts only (F143 path)", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: false,
        hasNextConfig: false,
        hasBunLockb: false,
        hasViteConfig: false,
        hasBuildTs: true,
      }),
    ).toBe("static");
  });

  it("defaults to nextjs when no signal present", () => {
    expect(
      detectFrameworkFromFiles({
        hasDockerfile: false,
        hasNextConfig: false,
        hasBunLockb: false,
        hasViteConfig: false,
        hasBuildTs: false,
      }),
    ).toBe("nextjs");
  });
});
