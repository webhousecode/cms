/**
 * F144 P6 — Rollback lookup tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { recordBuildEvent } from "../build-orchestrator/build-log";
import { findPreviousGoodImage } from "../build-orchestrator/rollback";

let tmpData = "";

vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({
    dataDir: tmpData,
    projectDir: tmpData,
    contentDir: path.join(tmpData, "content"),
    configPath: path.join(tmpData, "cms.config.ts"),
    uploadDir: path.join(tmpData, "uploads"),
  }),
}));

beforeEach(() => {
  tmpData = mkdtempSync(path.join(tmpdir(), "rollback-test-"));
});

afterEach(() => {
  if (tmpData && existsSync(tmpData)) rmSync(tmpData, { recursive: true, force: true });
});

describe("findPreviousGoodImage", () => {
  it("returns null when no builds exist", async () => {
    expect(await findPreviousGoodImage({ siteId: "trail" })).toBeNull();
  });

  it("returns null when only failed builds exist", async () => {
    await recordBuildEvent({
      siteId: "trail",
      sha: "bad",
      phase: "failed",
      final: { success: false },
    });
    expect(await findPreviousGoodImage({ siteId: "trail" })).toBeNull();
  });

  it("returns the most-recent successful image", async () => {
    await recordBuildEvent({
      siteId: "trail",
      sha: "old",
      phase: "done",
      final: { success: true, imageTag: "ghcr.io/x:old", durationMs: 100 },
    });
    // Ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));
    await recordBuildEvent({
      siteId: "trail",
      sha: "new",
      phase: "done",
      final: { success: true, imageTag: "ghcr.io/x:new", durationMs: 200 },
    });

    const prev = await findPreviousGoodImage({ siteId: "trail" });
    expect(prev?.sha).toBe("new");
    expect(prev?.imageTag).toBe("ghcr.io/x:new");
    expect(prev?.durationMs).toBe(200);
  });

  it("excludes the specified sha when set (e.g. the failing build)", async () => {
    await recordBuildEvent({
      siteId: "trail",
      sha: "previous",
      phase: "done",
      final: { success: true, imageTag: "ghcr.io/x:previous" },
    });
    await new Promise((r) => setTimeout(r, 10));
    await recordBuildEvent({
      siteId: "trail",
      sha: "broken",
      phase: "done",
      final: { success: true, imageTag: "ghcr.io/x:broken" },
    });

    // 'broken' is most recent successful, but caller wants to exclude it
    const prev = await findPreviousGoodImage({ siteId: "trail", excludeSha: "broken" });
    expect(prev?.sha).toBe("previous");
    expect(prev?.imageTag).toBe("ghcr.io/x:previous");
  });

  it("ignores builds that succeeded but have no imageTag (incomplete)", async () => {
    await recordBuildEvent({
      siteId: "trail",
      sha: "weird",
      phase: "done",
      final: { success: true }, // no imageTag
    });
    expect(await findPreviousGoodImage({ siteId: "trail" })).toBeNull();
  });

  it("isolates by siteId — other site's builds are not returned", async () => {
    await recordBuildEvent({
      siteId: "other",
      sha: "x",
      phase: "done",
      final: { success: true, imageTag: "ghcr.io/other:x" },
    });
    expect(await findPreviousGoodImage({ siteId: "trail" })).toBeNull();
  });
});
