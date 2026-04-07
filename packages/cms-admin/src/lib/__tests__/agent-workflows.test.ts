/**
 * Phase 6, Chunk 2 — agent workflows storage tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

let TMP_DIR = "";

vi.mock("../site-paths", () => ({
  getActiveSitePaths: async () => ({
    dataDir: TMP_DIR,
    contentDir: TMP_DIR,
    uploadDir: TMP_DIR,
  }),
}));

import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "../agent-workflows";

beforeEach(async () => {
  TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "agent-workflows-"));
});

describe("agent workflows storage", () => {
  it("returns empty list when none exist", async () => {
    expect(await listWorkflows()).toEqual([]);
  });

  it("creates a workflow with stable id and zero stats", async () => {
    const wf = await createWorkflow({
      name: "Pipeline 1",
      description: "Writer → SEO",
      steps: [
        { id: "s-1", agentId: "writer-1" },
        { id: "s-2", agentId: "seo-1" },
      ],
      active: true,
      schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 },
    });
    expect(wf.id).toMatch(/^wf-/);
    expect(wf.stats.totalRuns).toBe(0);
    expect(wf.stats.totalCostUsd).toBe(0);
    expect(wf.stats.lastRunAt).toBeNull();
    expect(wf.steps).toHaveLength(2);
    expect(wf.createdAt).toBeTruthy();
    expect(wf.updatedAt).toBeTruthy();
  });

  it("lists workflows newest-first", async () => {
    const a = await createWorkflow({ name: "A", steps: [], active: true, schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 } });
    // Force a measurable timestamp gap
    await new Promise((r) => setTimeout(r, 5));
    const b = await createWorkflow({ name: "B", steps: [], active: true, schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 } });
    const list = await listWorkflows();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it("getWorkflow round-trips a created workflow", async () => {
    const wf = await createWorkflow({
      name: "Round Trip",
      steps: [{ id: "s-1", agentId: "a-1", overrideCollection: "guides" }],
      active: true,
      schedule: { enabled: true, frequency: "daily", time: "07:30", maxPerRun: 2 },
    });
    const fetched = await getWorkflow(wf.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe("Round Trip");
    expect(fetched!.steps[0].overrideCollection).toBe("guides");
    // Schedule survives the round-trip
    expect(fetched!.schedule.enabled).toBe(true);
    expect(fetched!.schedule.frequency).toBe("daily");
    expect(fetched!.schedule.time).toBe("07:30");
    expect(fetched!.schedule.maxPerRun).toBe(2);
  });

  it("defaults schedule to disabled/manual when not specified by the route", async () => {
    // The API route fills in defaults; here we just verify storage round-trips
    // whatever shape it's given.
    const wf = await createWorkflow({
      name: "Defaults",
      steps: [],
      active: true,
      schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 },
    });
    expect(wf.schedule.enabled).toBe(false);
    expect(wf.schedule.frequency).toBe("manual");
  });

  it("returns null for missing workflows", async () => {
    expect(await getWorkflow("wf-does-not-exist")).toBeNull();
  });

  it("updates fields without allowing id changes", async () => {
    const wf = await createWorkflow({ name: "Original", steps: [], active: true, schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 } });
    const updated = await updateWorkflow(wf.id, {
      name: "Renamed",
      id: "wf-hacker", // should be ignored
      stats: { totalRuns: 5, totalCostUsd: 1.23, lastRunAt: "2026-04-08T00:00:00Z" },
    } as never);
    expect(updated.id).toBe(wf.id); // unchanged
    expect(updated.name).toBe("Renamed");
    expect(updated.stats.totalRuns).toBe(5);
    expect(updated.stats.totalCostUsd).toBeCloseTo(1.23, 5);
  });

  it("delete removes the workflow", async () => {
    const wf = await createWorkflow({ name: "Doomed", steps: [], active: true, schedule: { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 } });
    await deleteWorkflow(wf.id);
    expect(await getWorkflow(wf.id)).toBeNull();
    expect(await listWorkflows()).toEqual([]);
  });
});
