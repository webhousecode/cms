/**
 * Phase 4 — per-agent budget guards.
 *
 * Checks an agent's optional daily/weekly/monthly cost caps against
 * analytics spend. Used pre-flight by the agent runner and the
 * scheduler so a runaway agent can't blow past its own ceiling, even
 * if the global cockpit budget still has room.
 */
import type { AgentConfig } from "./agents";
import { getAgentSpendInPeriod } from "./analytics";
import { getT } from "@/i18n/locale";

export interface BudgetCheckResult {
  exceeded: boolean;
  /** First period that tripped: "day" | "week" | "month" */
  period?: "day" | "week" | "month";
  /** Configured cap that was hit */
  cap?: number;
  /** Current period spend */
  spent?: number;
}

/**
 * Returns `{ exceeded: false }` when no caps are set or all caps still
 * have room. Returns the first period that exceeded its cap otherwise.
 *
 * Order of evaluation: day → week → month. The first failing period
 * is the one reported, since it's also the most actionable signal.
 */
export async function checkAgentBudget(agent: AgentConfig): Promise<BudgetCheckResult> {
  const checks: { period: "day" | "week" | "month"; cap: number | undefined }[] = [
    { period: "day", cap: agent.dailyBudgetUsd },
    { period: "week", cap: agent.weeklyBudgetUsd },
    { period: "month", cap: agent.monthlyBudgetUsd },
  ];

  for (const { period, cap } of checks) {
    if (cap == null || cap <= 0) continue;
    const spent = await getAgentSpendInPeriod(agent.id, period);
    if (spent >= cap) {
      return { exceeded: true, period, cap, spent };
    }
  }

  return { exceeded: false };
}

/** Format a budget result as a human-readable error message. */
export function budgetExceededMessage(
  agent: AgentConfig,
  result: BudgetCheckResult,
  t: (key: string, vars?: Record<string, string | number>) => string = getT("en"),
): string {
  if (!result.exceeded || !result.period) return "";
  const key = result.period === "day" ? "budgetDay" : result.period === "week" ? "budgetWeek" : "budgetMonth";
  return t(`system.agents.${key}`, { name: agent.name, spent: (result.spent ?? 0).toFixed(4), cap: (result.cap ?? 0).toFixed(2) });
}
