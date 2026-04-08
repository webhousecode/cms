/**
 * Agent workflows (Phase 6, Chunk 2).
 *
 * A workflow is an ordered chain of agents that run as a single
 * pipeline. The first step takes the user prompt; subsequent steps
 * receive the previous step's contentData (rendered as a synthetic
 * input prompt) and apply their own role on top.
 *
 * Example: Writer → SEO Optimizer → Translator
 *   Step 1 takes "write an article about X" → produces a draft
 *   Step 2 takes that draft → returns an SEO-optimised version
 *   Step 3 takes the optimised version → returns a translation
 *
 * Only the FINAL step's output lands in the curation queue. Curators
 * see one queue item per workflow run, not one per step.
 *
 * Storage: per-site `_data/agent-workflows/{id}.json` (mirrors agents).
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface WorkflowStep {
  /** Stable id within the workflow (for drag-and-drop reordering later) */
  id: string;
  /** Reference to an existing agent in the same site */
  agentId: string;
  /** Optional override of the agent's targetCollection for this step */
  overrideCollection?: string;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description?: string;
  /** Ordered list of steps. Empty workflow is allowed (no-op for now). */
  steps: WorkflowStep[];
  /** Same shape as AgentConfig.schedule — the scheduler iterates workflows
   *  the same way it iterates agents. Each scheduled run uses the workflow's
   *  defaultPrompt as the input to step 1. */
  schedule: {
    enabled: boolean;
    frequency: "daily" | "weekly" | "manual" | "cron";
    time: string;
    maxPerRun: number;
    /** Cron expression. Only consulted when frequency === "cron".
     *  See lib/cron.ts for the supported subset. */
    cron?: string;
  };
  /** Default prompt sent to step 1 when the scheduler triggers the
   *  workflow. Manual runs always use the prompt the curator types. */
  defaultPrompt?: string;
  /** Aggregate stats — bumped on each runWorkflow call */
  stats: {
    totalRuns: number;
    totalCostUsd: number;
    lastRunAt: string | null;
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

async function getWorkflowsDir(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "agent-workflows");
}

export async function listWorkflows(): Promise<AgentWorkflow[]> {
  const dir = await getWorkflowsDir();
  await fs.mkdir(dir, { recursive: true });
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: AgentWorkflow[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      out.push(migrate(JSON.parse(raw)));
    } catch {
      // Skip corrupt files
    }
  }
  return out.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getWorkflow(id: string): Promise<AgentWorkflow | null> {
  const dir = await getWorkflowsDir();
  try {
    const raw = await fs.readFile(path.join(dir, `${id}.json`), "utf-8");
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Backfill fields added after the first AgentWorkflow shape so older
 *  files on disk don't crash newer code paths. Pure read-time fixup —
 *  not persisted unless the caller subsequently writes the workflow. */
function migrate(raw: unknown): AgentWorkflow {
  const wf = raw as Partial<AgentWorkflow> & Record<string, unknown>;
  return {
    id: String(wf.id ?? ""),
    name: String(wf.name ?? "Untitled"),
    description: typeof wf.description === "string" ? wf.description : "",
    steps: Array.isArray(wf.steps) ? (wf.steps as WorkflowStep[]) : [],
    schedule: wf.schedule ?? { enabled: false, frequency: "manual", time: "06:00", maxPerRun: 1 },
    defaultPrompt: typeof wf.defaultPrompt === "string" ? wf.defaultPrompt : undefined,
    stats: wf.stats ?? { totalRuns: 0, totalCostUsd: 0, lastRunAt: null },
    active: wf.active !== false,
    createdAt: String(wf.createdAt ?? new Date().toISOString()),
    updatedAt: String(wf.updatedAt ?? new Date().toISOString()),
  };
}

export async function createWorkflow(
  data: Omit<AgentWorkflow, "id" | "createdAt" | "updatedAt" | "stats">,
): Promise<AgentWorkflow> {
  const dir = await getWorkflowsDir();
  await fs.mkdir(dir, { recursive: true });
  const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const workflow: AgentWorkflow = {
    ...data,
    id,
    stats: { totalRuns: 0, totalCostUsd: 0, lastRunAt: null },
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify(workflow, null, 2),
  );
  return workflow;
}

export async function updateWorkflow(
  id: string,
  data: Partial<AgentWorkflow>,
): Promise<AgentWorkflow> {
  const existing = await getWorkflow(id);
  if (!existing) throw new Error(`Workflow ${id} not found`);
  const updated: AgentWorkflow = {
    ...existing,
    ...data,
    id, // never allow id change
    updatedAt: new Date().toISOString(),
  };
  const dir = await getWorkflowsDir();
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(updated, null, 2));
  return updated;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const dir = await getWorkflowsDir();
  await fs.unlink(path.join(dir, `${id}.json`));
}
