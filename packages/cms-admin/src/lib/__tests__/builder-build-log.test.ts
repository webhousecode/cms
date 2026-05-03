/**
 * F144 P4 — Build log persistence tests.
 *
 * Verifies:
 *   - first event creates the file with startedAt
 *   - subsequent events append, advance phase, update updatedAt
 *   - final block lands on done/failed phases
 *   - readBuildRecord returns null for missing builds
 *   - concurrent recordBuildEvent calls don't lose events (lock)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { recordBuildEvent, readBuildRecord } from "../build-orchestrator/build-log";

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
  tmpData = mkdtempSync(path.join(tmpdir(), "build-log-test-"));
});

afterEach(() => {
  if (tmpData && existsSync(tmpData)) rmSync(tmpData, { recursive: true, force: true });
});

describe("build-log", () => {
  it("creates a record on first event", async () => {
    const rec = await recordBuildEvent({ siteId: "trail", sha: "abc", phase: "init", message: "starting" });
    expect(rec.siteId).toBe("trail");
    expect(rec.sha).toBe("abc");
    expect(rec.phase).toBe("init");
    expect(rec.events).toHaveLength(1);
    expect(rec.events[0]!.phase).toBe("init");
    expect(rec.events[0]!.message).toBe("starting");
    expect(rec.startedAt).toBeTruthy();
    expect(rec.updatedAt).toBeTruthy();
  });

  it("appends events + advances phase on subsequent calls", async () => {
    await recordBuildEvent({ siteId: "trail", sha: "abc", phase: "init" });
    await new Promise((r) => setTimeout(r, 10));
    await recordBuildEvent({ siteId: "trail", sha: "abc", phase: "source-extract", message: "tar OK" });
    await new Promise((r) => setTimeout(r, 10));
    const rec = await recordBuildEvent({ siteId: "trail", sha: "abc", phase: "image-build" });

    expect(rec.phase).toBe("image-build");
    expect(rec.events.map((e) => e.phase)).toEqual([
      "init",
      "source-extract",
      "image-build",
    ]);
    expect(rec.updatedAt > rec.startedAt).toBe(true);
  });

  it("records final block on done", async () => {
    await recordBuildEvent({ siteId: "trail", sha: "x", phase: "init" });
    const rec = await recordBuildEvent({
      siteId: "trail",
      sha: "x",
      phase: "done",
      message: "success",
      final: { success: true, exitCode: 0, durationMs: 1234, imageTag: "ghcr.io/x:y" },
    });
    expect(rec.final).toEqual({
      success: true,
      exitCode: 0,
      durationMs: 1234,
      imageTag: "ghcr.io/x:y",
    });
  });

  it("readBuildRecord returns null for missing build", async () => {
    expect(await readBuildRecord("nope", "nope")).toBeNull();
  });

  it("readBuildRecord returns the persisted record", async () => {
    await recordBuildEvent({ siteId: "trail", sha: "z", phase: "init", message: "hi" });
    const rec = await readBuildRecord("trail", "z");
    expect(rec).not.toBeNull();
    expect(rec!.siteId).toBe("trail");
    expect(rec!.events[0]!.message).toBe("hi");
  });

  it("preserves all events under concurrent recordBuildEvent calls", async () => {
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      writes.push(recordBuildEvent({
        siteId: "trail",
        sha: "burst",
        phase: "image-build",
        message: `chunk ${i}`,
      }));
    }
    await Promise.all(writes);
    const rec = await readBuildRecord("trail", "burst");
    expect(rec).not.toBeNull();
    expect(rec!.events).toHaveLength(10);
  });

  it("isolates builds by (siteId, sha) — different sha = different file", async () => {
    await recordBuildEvent({ siteId: "trail", sha: "a", phase: "init" });
    await recordBuildEvent({ siteId: "trail", sha: "b", phase: "init" });
    const recA = await readBuildRecord("trail", "a");
    const recB = await readBuildRecord("trail", "b");
    expect(recA?.events).toHaveLength(1);
    expect(recB?.events).toHaveLength(1);
  });
});
