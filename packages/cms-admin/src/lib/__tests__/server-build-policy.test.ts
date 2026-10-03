/**
 * F206.3 — webhouse.app never runs a site's own build code.
 *
 * Four doors on the CMS server execute site code: runSiteBuild (every deploy
 * provider that builds), executeBuild (custom build commands), /api/preview-build
 * (fired from the document editor on every save) and the chat build_site tool.
 * Each must refuse when CMS_SERVER_BUILDS=off, and must keep working when it
 * is unset (self-hosted cms-admin).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileSync = vi.fn();
const exec = vi.fn((_cmd: string, _opts: unknown, cb: (e: null, r: { stdout: string; stderr: string }) => void) =>
  cb(null, { stdout: "built", stderr: "" }));
vi.mock("node:child_process", async (orig) => ({
  ...(await orig<typeof import("node:child_process")>()),
  execFileSync: (...a: unknown[]) => execFileSync(...a),
  exec: (...a: Parameters<typeof exec>) => exec(...a),
}));

let projectDir = "";
vi.mock("@/lib/site-paths", () => ({ getActiveSitePaths: async () => ({ projectDir }) }));
vi.mock("@/lib/require-role", () => ({ denyViewers: async () => null }));
vi.mock("@/lib/cms", () => ({ getAdminCms: vi.fn(), getAdminConfig: vi.fn() }));

import {
  assertServerBuildAllowed,
  serverBuildsAllowed,
  ServerBuildDisabledError,
  SERVER_BUILD_DISABLED_MESSAGE,
} from "../build/server-build-policy";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf-8");

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), "f2063-"));
  writeFileSync(path.join(projectDir, "build.ts"), "console.log('site code')");
  execFileSync.mockReset();
  exec.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(projectDir, { recursive: true, force: true });
});

describe("policy", () => {
  it("allows server builds when unset (self-hosted default)", () => {
    expect(serverBuildsAllowed({})).toBe(true);
    expect(() => assertServerBuildAllowed({})).not.toThrow();
  });

  it("refuses when CMS_SERVER_BUILDS=off, pointing at building in the site's own repo", () => {
    expect(serverBuildsAllowed({ CMS_SERVER_BUILDS: "off" })).toBe(false);
    expect(() => assertServerBuildAllowed({ CMS_SERVER_BUILDS: "off" })).toThrow(ServerBuildDisabledError);
    expect(SERVER_BUILD_DISABLED_MESSAGE).toMatch(/own repo/);
    expect(SERVER_BUILD_DISABLED_MESSAGE).toMatch(/Webhook/);
  });
});

describe("runSiteBuild (every deploy provider that builds on the server)", () => {
  it("refuses before running anything when off", async () => {
    vi.stubEnv("CMS_SERVER_BUILDS", "off");
    const { runSiteBuild } = await import("../build/run-site-build");
    await expect(
      runSiteBuild({ projectDir, cmsConfig: {} as never, deployOutDir: "deploy" }),
    ).rejects.toBeInstanceOf(ServerBuildDisabledError);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe("/api/preview-build (fires on every document save)", () => {
  it("refuses with 409 and runs nothing when off", async () => {
    vi.stubEnv("CMS_SERVER_BUILDS", "off");
    const { POST } = await import("../../app/api/preview-build/route");
    const res = await POST();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(SERVER_BUILD_DISABLED_MESSAGE);
    expect(exec).not.toHaveBeenCalled();
  });

  it("still runs build.ts when unset — the gate is not 'always off'", async () => {
    const { POST } = await import("../../app/api/preview-build/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(exec).toHaveBeenCalledOnce();
    expect(String(exec.mock.calls[0]?.[0])).toContain("build.ts");
  });
});

describe("remaining doors guard before they execute", () => {
  // These two spawn processes deep inside long handlers; assert the guard sits
  // in front of the exec call in the source, so a refactor that drops it goes red.
  const guardBefore = (src: string, execMarker: string) => {
    const g = src.indexOf("assertServerBuildAllowed(");
    const e = src.indexOf(execMarker);
    expect(g, "guard missing").toBeGreaterThan(-1);
    expect(e, "exec marker missing").toBeGreaterThan(-1);
    expect(g).toBeLessThan(e);
  };

  it("executeBuild (custom build commands)", () => {
    guardBefore(read("lib/build/executor.ts"), "spawn(");
  });

  it("chat build_site tool", () => {
    const src = read("lib/chat/tools.ts");
    const start = src.indexOf('name: "build_site"');
    guardBefore(src.slice(start, start + 4000), 'execSync("npx tsx build.ts"');
  });
});

describe("webhouse.app has the gate switched on", () => {
  it("fly.toml [env] sets CMS_SERVER_BUILDS=off", () => {
    const toml = readFileSync(path.resolve(SRC, "../../../fly.toml"), "utf-8");
    const env = toml.split(/^\[env\]/m)[1]?.split(/^\[/m)[0] ?? "";
    expect(env).toMatch(/^\s*CMS_SERVER_BUILDS\s*=\s*"off"/m);
  });
});

describe("local / self-hosted `cms build` is untouched", () => {
  it("the CLI build command does not depend on the cms-admin gate", () => {
    const cli = readFileSync(path.resolve(SRC, "../../cms-cli/src/commands/build.ts"), "utf-8");
    expect(cli).not.toMatch(/server-build-policy|CMS_SERVER_BUILDS/);
  });
});
