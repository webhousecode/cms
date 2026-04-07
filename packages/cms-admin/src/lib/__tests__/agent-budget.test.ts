/**
 * Phase 4 — per-agent budget guard tests.
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

import { recordRun, getAgentSpendInPeriod } from "../analytics";
import { checkAgentBudget, budgetExceededMessage } from "../agent-budget";
import type { AgentConfig } from "../agents";

function makeAgent(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    role: "copywriter",
    systemPrompt: "test",
    behavior: { temperature: 50, formality: 50, verbosity: 50 },
    tools: { webSearch: false, internalDatabase: false },
    autonomy: "draft",
    targetCollections: [],
    schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 1 },
    stats: { totalGenerated: 0, approved: 0, rejected: 0, edited: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
    ...over,
  };
}

async function logRun(agentId: string, costUsd: number, daysAgo = 0) {
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  await recordRun({
    agentId,
    agentName: agentId,
    timestamp: ts,
    collection: "posts",
    documentsProcessed: 1,
    tokensUsed: { input: 100, output: 200 },
    costUsd,
    durationMs: 1000,
    model: "claude-sonnet-4-6",
    status: "success",
  });
}

beforeEach(async () => {
  TMP_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "agent-budget-"));
});

describe("getAgentSpendInPeriod", () => {
  it("returns 0 when there are no runs", async () => {
    expect(await getAgentSpendInPeriod("nobody", "day")).toBe(0);
  });

  it("sums today's runs for the day period", async () => {
    await logRun("a", 0.05);
    await logRun("a", 0.10);
    await logRun("a", 0.20, 2); // two days ago — out of "day"
    const day = await getAgentSpendInPeriod("a", "day");
    expect(day).toBeCloseTo(0.15, 5);
  });

  it("sums runs within the rolling 7-day window for week", async () => {
    await logRun("a", 0.10);
    await logRun("a", 0.05, 3);
    await logRun("a", 0.05, 6);
    await logRun("a", 1.00, 10); // out of week
    const week = await getAgentSpendInPeriod("a", "week");
    expect(week).toBeCloseTo(0.20, 5);
  });

  it("isolates by agentId", async () => {
    await logRun("a", 0.50);
    await logRun("b", 0.30);
    expect(await getAgentSpendInPeriod("a", "day")).toBeCloseTo(0.50, 5);
    expect(await getAgentSpendInPeriod("b", "day")).toBeCloseTo(0.30, 5);
  });
});

describe("checkAgentBudget", () => {
  it("returns not-exceeded when no caps are configured", async () => {
    const result = await checkAgentBudget(makeAgent());
    expect(result.exceeded).toBe(false);
  });

  it("returns not-exceeded when caps still have room", async () => {
    await logRun("test-agent", 0.10);
    const result = await checkAgentBudget(makeAgent({ dailyBudgetUsd: 1.0 }));
    expect(result.exceeded).toBe(false);
  });

  it("trips on the daily cap first", async () => {
    await logRun("test-agent", 0.50);
    await logRun("test-agent", 0.60); // total today: 1.10
    const result = await checkAgentBudget(
      makeAgent({ dailyBudgetUsd: 1.0, weeklyBudgetUsd: 10, monthlyBudgetUsd: 100 }),
    );
    expect(result.exceeded).toBe(true);
    expect(result.period).toBe("day");
    expect(result.cap).toBe(1.0);
    expect(result.spent).toBeCloseTo(1.10, 5);
  });

  it("trips weekly when daily has room but week is exhausted", async () => {
    await logRun("test-agent", 0.30, 2);
    await logRun("test-agent", 0.40, 4);
    await logRun("test-agent", 0.40, 5); // week total: 1.10, today: 0
    const result = await checkAgentBudget(
      makeAgent({ dailyBudgetUsd: 1.0, weeklyBudgetUsd: 1.0 }),
    );
    expect(result.exceeded).toBe(true);
    expect(result.period).toBe("week");
  });

  it("ignores zero or negative caps", async () => {
    await logRun("test-agent", 5.0);
    const result = await checkAgentBudget(
      makeAgent({ dailyBudgetUsd: 0, weeklyBudgetUsd: -1 }),
    );
    expect(result.exceeded).toBe(false);
  });

  it("budgetExceededMessage produces a helpful string", async () => {
    await logRun("test-agent", 1.50);
    const agent = makeAgent({ dailyBudgetUsd: 1.0 });
    const result = await checkAgentBudget(agent);
    const msg = budgetExceededMessage(agent, result);
    expect(msg).toContain("Test Agent");
    expect(msg).toContain("daily");
    expect(msg).toContain("$1.50");
    expect(msg).toContain("$1.00");
  });

  it("returns empty string when not exceeded", () => {
    const agent = makeAgent();
    expect(budgetExceededMessage(agent, { exceeded: false })).toBe("");
  });
});
