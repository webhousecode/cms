import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";
import { listAgents, type AgentConfig } from "@/lib/agents";
import { readCockpit } from "@/lib/cockpit";
import { runAgent } from "@/lib/agent-runner";
import { buildContentContext } from "@/lib/content-context";
import { checkAgentBudget } from "@/lib/agent-budget";
import { listWorkflows, type AgentWorkflow } from "@/lib/agent-workflows";
import { runWorkflow } from "@/lib/workflow-runner";

interface SchedulerState {
  lastRuns: Record<string, string>; // agentId -> ISO timestamp
}

async function getStatePath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  return path.join(dataDir, "scheduler-state.json");
}

async function readState(): Promise<SchedulerState> {
  try {
    const raw = await fs.readFile(await getStatePath(), "utf-8");
    return JSON.parse(raw) as SchedulerState;
  } catch {
    return { lastRuns: {} };
  }
}

async function writeState(state: SchedulerState): Promise<void> {
  const filePath = await getStatePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

/** Generic schedule check used by both agents and workflows. */
function isScheduleDue(
  entry: {
    active: boolean;
    schedule?: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "manual" | "cron";
      time: string;
      cron?: string;
    };
  },
  lastRunIso: string | undefined,
): boolean {
  // Workflows persisted before chunk 2 may have no schedule field at all
  if (!entry.active || !entry.schedule || !entry.schedule.enabled) return false;
  if (entry.schedule.frequency === "manual") return false;

  const now = new Date();
  const lastRunDate = lastRunIso ? new Date(lastRunIso) : null;

  // Cron path — uses lib/cron.ts. Window-aware so a 5-min tick still
  // catches a cron that would have fired at minute 09:03.
  if (entry.schedule.frequency === "cron") {
    if (!entry.schedule.cron) return false;
    const { cronMatchesWithinWindow } = require("./cron") as typeof import("./cron");
    const windowStart = new Date(now.getTime() - 5 * 60_000);
    if (!cronMatchesWithinWindow(entry.schedule.cron, windowStart, 5)) return false;
    // Don't fire twice in the same window — keep a 4 minute dedup
    // cushion so the next tick doesn't re-trigger if the cron resolves
    // to multiple matching minutes within the 5-minute scheduler window.
    if (lastRunDate && now.getTime() - lastRunDate.getTime() < 4 * 60_000) return false;
    return true;
  }

  const [hours, minutes] = entry.schedule.time.split(":").map(Number);
  const scheduledToday = new Date(now);
  scheduledToday.setHours(hours, minutes, 0, 0);
  if (now < scheduledToday) return false;

  if (entry.schedule.frequency === "daily") {
    if (lastRunDate && lastRunDate.toDateString() === now.toDateString()) return false;
    return true;
  }

  if (entry.schedule.frequency === "weekly") {
    if (now.getDay() !== 1) return false;
    if (lastRunDate) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      if (lastRunDate >= weekStart) return false;
    }
    return true;
  }

  return false;
}

function isDue(agent: AgentConfig, state: SchedulerState): boolean {
  return isScheduleDue(agent, state.lastRuns[agent.id]);
}

function isWorkflowDue(workflow: AgentWorkflow, state: SchedulerState): boolean {
  // Workflow keys are namespaced under "wf:" so they don't collide
  // with agent ids in the same lastRuns map.
  return isScheduleDue(workflow, state.lastRuns[`wf:${workflow.id}`]);
}

/**
 * Generate a contextual prompt for scheduled runs.
 * Analyzes existing content to suggest topics not yet covered.
 */
async function generateScheduledPrompt(agent: AgentConfig): Promise<string> {
  const collection = agent.targetCollections[0] ?? "posts";
  const contentContext = await buildContentContext().catch(() => "");

  const prompts = [
    `Generate a new piece of content for the "${collection}" collection.`,
    contentContext
      ? "Review the existing site content listed below and write about a topic that has NOT been covered yet. Offer a fresh perspective."
      : "",
    `The content should match the site's voice and add genuine value for readers.`,
    agent.role === "seo"
      ? "Focus on SEO-optimized content with strong headings and keyword placement."
      : agent.role === "refresher"
        ? "Find an outdated topic and write an updated version with current information."
        : "",
  ].filter(Boolean);

  return prompts.join(" ");
}

/**
 * Main scheduler tick — called every 5 minutes from instrumentation.ts.
 * Checks all agents, runs those that are due, respects budget.
 */
export async function runScheduledAgents(): Promise<{ ran: string[]; skipped: string[]; errors: string[] }> {
  const ran: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    const [agents, workflows, cockpit, state] = await Promise.all([
      listAgents(),
      listWorkflows(),
      readCockpit(),
      readState(),
    ]);

    // Budget gate
    if (cockpit.currentMonthSpentUsd >= cockpit.monthlyBudgetUsd) {
      console.log("[scheduler] Monthly budget exhausted — skipping all agents");
      return { ran: [], skipped: agents.filter((a) => a.schedule.enabled).map((a) => a.id), errors: [] };
    }

    for (const agent of agents) {
      if (!isDue(agent, state)) continue;

      // Global cockpit budget guard (legacy — flat 95% headroom)
      if (cockpit.currentMonthSpentUsd >= cockpit.monthlyBudgetUsd * 0.95) {
        skipped.push(agent.id);
        continue;
      }

      // Phase 4 — per-agent budget guard. Skip due agents that have
      // hit their own daily/weekly/monthly cap, even if the global
      // cockpit budget still has room.
      const budget = await checkAgentBudget(agent);
      if (budget.exceeded) {
        console.log(`[scheduler] Agent ${agent.name} skipped — ${budget.period} budget exhausted ($${budget.spent?.toFixed(4)} of $${budget.cap?.toFixed(2)})`);
        skipped.push(agent.id);
        continue;
      }

      try {
        const prompt = await generateScheduledPrompt(agent);
        const maxPerRun = agent.schedule.maxPerRun ?? 1;

        for (let i = 0; i < maxPerRun; i++) {
          console.log(`[scheduler] Running ${agent.name} (${i + 1}/${maxPerRun})`);
          await runAgent(agent.id, prompt);
        }

        // Update last run
        state.lastRuns[agent.id] = new Date().toISOString();
        ran.push(agent.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[scheduler] Agent ${agent.name} failed:`, msg);
        errors.push(`${agent.id}: ${msg}`);
      }
    }

    // ── Phase 6 — workflow pipelines ────────────────────────────
    // Same loop pattern as agents but invokes runWorkflow per due
    // workflow. The runner already enforces per-step agent budgets,
    // so we only need the global cockpit guard here.
    for (const workflow of workflows) {
      if (!isWorkflowDue(workflow, state)) continue;
      if (cockpit.currentMonthSpentUsd >= cockpit.monthlyBudgetUsd * 0.95) {
        skipped.push(`wf:${workflow.id}`);
        continue;
      }
      const prompt = workflow.defaultPrompt?.trim()
        || `Generate new content for the "${workflow.name}" pipeline. Match the site's voice and add genuine value.`;
      try {
        const maxPerRun = workflow.schedule?.maxPerRun ?? 1;
        for (let i = 0; i < maxPerRun; i++) {
          console.log(`[scheduler] Running workflow ${workflow.name} (${i + 1}/${maxPerRun})`);
          await runWorkflow(workflow.id, prompt);
        }
        state.lastRuns[`wf:${workflow.id}`] = new Date().toISOString();
        ran.push(`wf:${workflow.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        console.error(`[scheduler] Workflow ${workflow.name} failed:`, msg);
        errors.push(`wf:${workflow.id}: ${msg}`);
      }
    }

    await writeState(state);
  } catch (err) {
    console.error("[scheduler] Fatal error:", err);
    errors.push(`fatal: ${err instanceof Error ? err.message : "unknown"}`);
  }

  return { ran, skipped, errors };
}
