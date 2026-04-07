/**
 * Phase 6 — analytics aggregations.
 *
 * Focused tests for the costByCollection breakdown added to
 * getCostSummary, plus the existing getAgentSpendInPeriod helper
 * (covered separately in agent-budget.test.ts).
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

import { recordRun, getCostSummary } from "../analytics";

async function logRun(opts: { agentId: string; collection: string; costUsd: number; model?: string }) {
  await recordRun({
    agentId: opts.agentId,
    agentName: opts.agentId,
    timestamp: new Date().toISOString(),
    collection: opts.collection,
    documentsProcessed: 1,
    tokensUsed: { input: 100, output: 200 },
    costUsd: opts.costUsd,
    durationMs: 1000,
    model: opts.model ?? "claude-sonnet-4-6",
    status: "success",
  });
}

beforeEach(async () => {
  TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "analytics-"));
});

describe("getCostSummary — costByCollection (Phase 6)", () => {
  it("returns an empty object when there are no runs", async () => {
    const summary = await getCostSummary();
    expect(summary.costByCollection).toEqual({});
  });

  it("aggregates spend per collection across multiple runs", async () => {
    await logRun({ agentId: "writer", collection: "posts", costUsd: 0.10 });
    await logRun({ agentId: "writer", collection: "posts", costUsd: 0.20 });
    await logRun({ agentId: "seo", collection: "pages", costUsd: 0.05 });
    await logRun({ agentId: "translator", collection: "posts", costUsd: 0.15 });

    const summary = await getCostSummary();
    expect(summary.costByCollection.posts).toBeCloseTo(0.45, 5);
    expect(summary.costByCollection.pages).toBeCloseTo(0.05, 5);
    expect(Object.keys(summary.costByCollection)).toHaveLength(2);
  });

  it("does not double-count when an agent runs against multiple collections", async () => {
    await logRun({ agentId: "writer", collection: "posts", costUsd: 0.10 });
    await logRun({ agentId: "writer", collection: "guides", costUsd: 0.20 });

    const summary = await getCostSummary();
    expect(summary.totalCostUsd).toBeCloseTo(0.30, 5);
    expect(summary.costByCollection.posts).toBeCloseTo(0.10, 5);
    expect(summary.costByCollection.guides).toBeCloseTo(0.20, 5);
    // Sum of buckets should equal the total
    const bucketSum = Object.values(summary.costByCollection).reduce((s, v) => s + v, 0);
    expect(bucketSum).toBeCloseTo(summary.totalCostUsd, 5);
  });

  it("ignores blank collection values defensively", async () => {
    await logRun({ agentId: "writer", collection: "", costUsd: 0.10 });
    await logRun({ agentId: "writer", collection: "posts", costUsd: 0.20 });

    const summary = await getCostSummary();
    // Total still counts everything
    expect(summary.totalCostUsd).toBeCloseTo(0.30, 5);
    // But the buckets only include the named collection
    expect(summary.costByCollection.posts).toBeCloseTo(0.20, 5);
    expect(summary.costByCollection[""]).toBeUndefined();
  });
});
