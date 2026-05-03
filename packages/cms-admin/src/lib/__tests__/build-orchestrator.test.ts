/**
 * F144 P3 — End-to-end orchestrator tests.
 *
 * Verifies:
 *   - detectProjectFramework picks the right kind for next/bun/static/custom
 *   - buildSsrSite throws for static (caller must use F143 path)
 *   - buildSsrSite spawns Fly Machine with generated Dockerfile + tar
 *   - Custom framework skips Dockerfile generation (sends empty string)
 *
 * Fly fetch is stubbed so the full pipeline runs without network.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildSsrSite, detectProjectFramework } from "../build-orchestrator/orchestrator";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

let workDir = "";
beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "orch-test-"));
});
afterEach(() => {
  if (workDir && existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
});

function writeFile(rel: string, content = "x"): void {
  const abs = path.join(workDir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

describe("detectProjectFramework", () => {
  it("returns nextjs when next.config.ts exists", () => {
    writeFile("next.config.ts", "export default {}");
    expect(detectProjectFramework(workDir)).toBe("nextjs");
  });

  it("returns nextjs when next.config.mjs exists", () => {
    writeFile("next.config.mjs", "export default {}");
    expect(detectProjectFramework(workDir)).toBe("nextjs");
  });

  it("returns custom when project has its own Dockerfile", () => {
    writeFile("Dockerfile", "FROM node:22");
    writeFile("next.config.ts", "{}"); // custom wins over next config
    expect(detectProjectFramework(workDir)).toBe("custom");
  });

  it("returns bun-hono for bun.lockb projects", () => {
    writeFile("bun.lockb", "");
    expect(detectProjectFramework(workDir)).toBe("bun-hono");
  });

  it("returns static for build.ts only (F143 path)", () => {
    writeFile("build.ts", "");
    expect(detectProjectFramework(workDir)).toBe("static");
  });

  it("defaults to nextjs when no signal present", () => {
    expect(detectProjectFramework(workDir)).toBe("nextjs");
  });
});

describe("buildSsrSite", () => {
  it("throws for static framework — caller must use F143", async () => {
    writeFile("build.ts", "");
    await expect(
      buildSsrSite({
        siteId: "x",
        sha: "abc",
        projectDir: workDir,
        targetApp: "x-app",
        registryToken: "ghs_x",
        callbackUrl: "https://cb",
        callbackToken: "cb_tok",
        flyToken: "fly_tok",
      }),
    ).rejects.toThrow(/F144 buildSsrSite called for a static site/);
  });

  it("packs source + spawns Fly Machine + returns image tag (Next.js)", async () => {
    writeFile("next.config.ts", "export default {}");
    writeFile("package.json", "{}");
    writeFile("public/favicon.ico", "icon");

    let spawnPayload: Record<string, unknown> = {};
    let pollCalls = 0;

    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.endsWith("/machines") && init?.method === "POST") {
        spawnPayload = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({ id: "m-orch", region: "arn", state: "starting" }),
          { status: 200 },
        );
      }
      // GET /machines/<id>  → polled by awaitBuilderCompletion
      if (u.endsWith("/m-orch")) {
        pollCalls++;
        return new Response(JSON.stringify({
          state: "stopped",
          events: [{ type: "exit", request: { exit_event: { exit_code: 0 } } }],
        }), { status: 200 });
      }
      // logs polled by streamBuilderLogs (if onLog passed)
      return new Response(JSON.stringify({ logs: [] }), { status: 200 });
    }) as typeof fetch;

    const result = await buildSsrSite({
      siteId: "trail",
      sha: "abc12345",
      projectDir: workDir,
      targetApp: "trail-landing",
      registryToken: "ghs_test",
      callbackUrl: "https://webhouse.app/api/builder/callback",
      callbackToken: "cb_x",
      flyToken: "fly_x",
    });

    expect(result.success).toBe(true);
    expect(result.framework).toBe("nextjs");
    expect(result.imageTag).toBe("ghcr.io/webhousecode/trail:abc12345");
    expect(result.machineId).toBe("m-orch");
    expect(result.sourceFileCount).toBeGreaterThan(0);
    expect(pollCalls).toBeGreaterThan(0);

    // Verify the Dockerfile shipped to Fly is the generated next.js one
    const config = spawnPayload.config as Record<string, unknown>;
    const files = config.files as Array<{ guest_path: string; raw_value: string }>;
    const dockerfileEntry = files.find((f) => f.guest_path === "/build/Dockerfile");
    expect(dockerfileEntry).toBeDefined();
    const dockerfileContents = Buffer.from(dockerfileEntry!.raw_value, "base64").toString("utf-8");
    expect(dockerfileContents).toContain("FROM node:22-alpine AS deps");
    expect(dockerfileContents).toContain(".next/standalone");
  });

  it("ships empty Dockerfile when framework=custom (VM uses source/Dockerfile)", async () => {
    writeFile("Dockerfile", "FROM scratch");

    let spawnPayload: Record<string, unknown> = {};
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.endsWith("/machines") && init?.method === "POST") {
        spawnPayload = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: "m1", region: "arn", state: "starting" }));
      }
      return new Response(JSON.stringify({
        state: "stopped",
        events: [{ type: "exit", request: { exit_event: { exit_code: 0 } } }],
      }));
    }) as typeof fetch;

    const result = await buildSsrSite({
      siteId: "x",
      sha: "y",
      projectDir: workDir,
      targetApp: "x",
      registryToken: "r",
      callbackUrl: "u",
      callbackToken: "c",
      flyToken: "f",
    });

    expect(result.framework).toBe("custom");
    const files = (spawnPayload.config as { files: Array<{ guest_path: string; raw_value: string }> }).files;
    const dockerfileEntry = files.find((f) => f.guest_path === "/build/Dockerfile");
    expect(dockerfileEntry).toBeDefined();
    expect(Buffer.from(dockerfileEntry!.raw_value, "base64").toString("utf-8")).toBe("");
  });
});
