/**
 * AI Analytics — file-based run logging and query functions.
 *
 * Stores run logs as JSON in _data/analytics/runs.json.
 * Provides query functions for run history, agent stats, and cost summaries.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunEntry {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string; // ISO 8601
  collection: string;
  documentsProcessed: number;
  tokensUsed: { input: number; output: number };
  costUsd: number;
  durationMs: number;
  model: string;
  status: "success" | "error";
  error?: string;
}

export interface ContentEdit {
  id: string;
  collection: string;
  slug: string;
  field: string;
  source: "ai" | "human";
  agentId?: string;
  timestamp: string;
  wasModified?: boolean; // true if a human edited AI output
}

export interface AgentStats {
  agentId: string;
  agentName: string;
  totalRuns: number;
  totalDocuments: number;
  totalCostUsd: number;
  avgDurationMs: number;
  successRate: number;
  lastRunAt: string | null;
}

export interface CostSummary {
  totalCostUsd: number;
  runCount: number;
  avgCostPerRun: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, { name: string; cost: number }>;
  /** Phase 6 — total spend per target collection so curators can see
   *  which collections their agents are pouring money into. */
  costByCollection: Record<string, number>;
}

export interface ContentRatio {
  totalEdits: number;
  aiEdits: number;
  humanEdits: number;
  aiModifiedByHuman: number;
  aiAcceptanceRate: number; // percent of AI edits NOT modified
}

// ── File paths ───────────────────────────────────────────────────────────────

async function getAnalyticsDir(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "analytics");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function getRunsPath(): Promise<string> {
  return path.join(await getAnalyticsDir(), "runs.json");
}

async function getEditsPath(): Promise<string> {
  return path.join(await getAnalyticsDir(), "edits.json");
}

// ── Read / write helpers ─────────────────────────────────────────────────────

async function readRuns(): Promise<RunEntry[]> {
  try {
    const raw = await fs.readFile(await getRunsPath(), "utf-8");
    return JSON.parse(raw) as RunEntry[];
  } catch {
    return [];
  }
}

async function writeRuns(runs: RunEntry[]): Promise<void> {
  const filePath = await getRunsPath();
  await fs.writeFile(filePath, JSON.stringify(runs, null, 2));
}

async function readEdits(): Promise<ContentEdit[]> {
  try {
    const raw = await fs.readFile(await getEditsPath(), "utf-8");
    return JSON.parse(raw) as ContentEdit[];
  } catch {
    return [];
  }
}

async function writeEdits(edits: ContentEdit[]): Promise<void> {
  const filePath = await getEditsPath();
  await fs.writeFile(filePath, JSON.stringify(edits, null, 2));
}

// ── Recording functions ──────────────────────────────────────────────────────

/** Record a completed agent run. */
export async function recordRun(entry: Omit<RunEntry, "id">): Promise<RunEntry> {
  const runs = await readRuns();
  const run: RunEntry = { id: generateId(), ...entry };
  runs.push(run);

  // Keep max 500 runs to avoid unbounded growth
  const trimmed = runs.length > 500 ? runs.slice(-500) : runs;
  await writeRuns(trimmed);
  return run;
}

/** Record a content edit (AI or human). */
export async function recordContentEdit(entry: Omit<ContentEdit, "id">): Promise<ContentEdit> {
  const edits = await readEdits();
  const edit: ContentEdit = { id: generateId(), ...entry };
  edits.push(edit);

  // Keep max 2000 edits
  const trimmed = edits.length > 2000 ? edits.slice(-2000) : edits;
  await writeEdits(trimmed);
  return edit;
}

// ── Query functions ──────────────────────────────────────────────────────────

export interface RunHistoryFilter {
  agentId?: string;
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
  limit?: number;
}

/** Get run history, newest first. */
export async function getRunHistory(filter?: RunHistoryFilter): Promise<RunEntry[]> {
  let runs = await readRuns();

  if (filter?.agentId) {
    runs = runs.filter((r) => r.agentId === filter.agentId);
  }
  if (filter?.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    runs = runs.filter((r) => new Date(r.timestamp).getTime() >= from);
  }
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo).getTime();
    runs = runs.filter((r) => new Date(r.timestamp).getTime() <= to);
  }

  // Newest first
  runs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const limit = filter?.limit ?? 50;
  return runs.slice(0, limit);
}

/** Get aggregated stats per agent. */
export async function getAgentStats(): Promise<AgentStats[]> {
  const runs = await readRuns();
  const map = new Map<string, RunEntry[]>();

  for (const run of runs) {
    const existing = map.get(run.agentId) ?? [];
    existing.push(run);
    map.set(run.agentId, existing);
  }

  const stats: AgentStats[] = [];
  for (const [agentId, agentRuns] of map) {
    const successRuns = agentRuns.filter((r) => r.status === "success");
    const totalDuration = agentRuns.reduce((s, r) => s + r.durationMs, 0);
    const sorted = [...agentRuns].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    stats.push({
      agentId,
      agentName: sorted[0]?.agentName ?? agentId,
      totalRuns: agentRuns.length,
      totalDocuments: agentRuns.reduce((s, r) => s + r.documentsProcessed, 0),
      totalCostUsd: agentRuns.reduce((s, r) => s + r.costUsd, 0),
      avgDurationMs: agentRuns.length > 0 ? totalDuration / agentRuns.length : 0,
      successRate: agentRuns.length > 0 ? successRuns.length / agentRuns.length : 0,
      lastRunAt: sorted[0]?.timestamp ?? null,
    });
  }

  // Sort by total documents descending (most productive first)
  stats.sort((a, b) => b.totalDocuments - a.totalDocuments);
  return stats;
}

/** Get cost summary, optionally filtered by date range. */
export async function getCostSummary(dateFrom?: string, dateTo?: string): Promise<CostSummary> {
  let runs = await readRuns();

  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    runs = runs.filter((r) => new Date(r.timestamp).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    runs = runs.filter((r) => new Date(r.timestamp).getTime() <= to);
  }

  const totalCostUsd = runs.reduce((s, r) => s + r.costUsd, 0);
  const costByModel: Record<string, number> = {};
  const costByAgent: Record<string, { name: string; cost: number }> = {};
  const costByCollection: Record<string, number> = {};

  for (const run of runs) {
    costByModel[run.model] = (costByModel[run.model] ?? 0) + run.costUsd;
    if (!costByAgent[run.agentId]) {
      costByAgent[run.agentId] = { name: run.agentName, cost: 0 };
    }
    costByAgent[run.agentId].cost += run.costUsd;
    if (run.collection) {
      costByCollection[run.collection] = (costByCollection[run.collection] ?? 0) + run.costUsd;
    }
  }

  return {
    totalCostUsd,
    runCount: runs.length,
    avgCostPerRun: runs.length > 0 ? totalCostUsd / runs.length : 0,
    costByModel,
    costByAgent,
    costByCollection,
  };
}

/** Get AI vs human content edit ratio. */
export async function getContentRatio(dateFrom?: string, dateTo?: string): Promise<ContentRatio> {
  let edits = await readEdits();

  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    edits = edits.filter((e) => new Date(e.timestamp).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime();
    edits = edits.filter((e) => new Date(e.timestamp).getTime() <= to);
  }

  const aiEdits = edits.filter((e) => e.source === "ai");
  const humanEdits = edits.filter((e) => e.source === "human");
  const aiModifiedByHuman = aiEdits.filter((e) => e.wasModified === true).length;
  const aiAcceptanceRate =
    aiEdits.length > 0
      ? ((aiEdits.length - aiModifiedByHuman) / aiEdits.length) * 100
      : 100;

  return {
    totalEdits: edits.length,
    aiEdits: aiEdits.length,
    humanEdits: humanEdits.length,
    aiModifiedByHuman,
    aiAcceptanceRate,
  };
}

/**
 * Phase 4 — sum the cost of an agent's successful runs within a rolling
 * period. Used by per-agent budget guards in runAgent and the scheduler.
 *
 * - "day"   = since 00:00 today (local time)
 * - "week"  = last 7 days, rolling
 * - "month" = since the 1st of the current month (local time)
 */
export async function getAgentSpendInPeriod(
  agentId: string,
  period: "day" | "week" | "month",
): Promise<number> {
  const runs = await readRuns();
  const now = new Date();
  let cutoff: number;
  if (period === "day") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    cutoff = start.getTime();
  } else if (period === "week") {
    cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    cutoff = start.getTime();
  }

  let total = 0;
  for (const r of runs) {
    if (r.agentId !== agentId) continue;
    if (new Date(r.timestamp).getTime() < cutoff) continue;
    total += r.costUsd;
  }
  return total;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
