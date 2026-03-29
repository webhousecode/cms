"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart2,
  Activity,
  DollarSign,
  Clock,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

// ── Types ────────────────────────────────────────────────────────────────────

interface RunEntry {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  collection: string;
  documentsProcessed: number;
  tokensUsed: { input: number; output: number };
  costUsd: number;
  durationMs: number;
  model: string;
  status: "success" | "error";
  error?: string;
}

interface AgentStats {
  agentId: string;
  agentName: string;
  totalRuns: number;
  totalDocuments: number;
  totalCostUsd: number;
  avgDurationMs: number;
  successRate: number;
  lastRunAt: string | null;
}

interface CostSummary {
  totalCostUsd: number;
  runCount: number;
  avgCostPerRun: number;
  costByModel: Record<string, number>;
  costByAgent: Record<string, { name: string; cost: number }>;
}

interface ContentRatio {
  totalEdits: number;
  aiEdits: number;
  humanEdits: number;
  aiModifiedByHuman: number;
  aiAcceptanceRate: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCurrentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dateTo = now.toISOString();
  return { dateFrom, dateTo };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [ratio, setRatio] = useState<ContentRatio | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { dateFrom, dateTo } = getCurrentMonthRange();
    try {
      const [runsRes, agentsRes, costsRes, ratioRes] = await Promise.all([
        fetch("/api/admin/analytics?view=runs&limit=50").then((r) => r.json()),
        fetch("/api/admin/analytics?view=agents").then((r) => r.json()),
        fetch(
          `/api/admin/analytics?view=costs&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
        ).then((r) => r.json()),
        fetch(
          `/api/admin/analytics?view=content-ratio&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
        ).then((r) => r.json()),
      ]);
      setRuns(runsRes.runs ?? []);
      setAgents(agentsRes.agents ?? []);
      setCosts(costsRes);
      setRatio(ratioRes);
    } catch {
      // Silently handle — page will show empty state
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasData = runs.length > 0 || agents.length > 0;

  return (
    <>
    <ActionBar
      actions={
        <ActionButton variant="primary" onClick={fetchAll} disabled={loading} icon={<RefreshCw style={{ width: 14, height: 14 }} className={loading ? "animate-spin" : ""} />}>
          Refresh
        </ActionButton>
      }
    >
      <ActionBarBreadcrumb items={["Tools", "AI Analytics"]} />
    </ActionBar>
    <div className="p-8 max-w-6xl">

      {!hasData && !loading ? (
        <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
          <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No analytics data yet.</p>
          <p className="text-sm mt-2">
            Run an agent to start collecting performance metrics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Summary cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Activity className="w-4 h-4" />}
              label="Runs this month"
              value={String(costs?.runCount ?? 0)}
            />
            <StatCard
              icon={<DollarSign className="w-4 h-4" />}
              label="Cost this month"
              value={formatCost(costs?.totalCostUsd ?? 0)}
            />
            <StatCard
              icon={<Zap className="w-4 h-4" />}
              label="Avg cost / run"
              value={formatCost(costs?.avgCostPerRun ?? 0)}
            />
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label="AI acceptance"
              value={`${(ratio?.aiAcceptanceRate ?? 100).toFixed(0)}%`}
              subtitle={
                ratio && ratio.totalEdits > 0
                  ? `${ratio.aiEdits} AI / ${ratio.humanEdits} human edits`
                  : undefined
              }
            />
          </div>

          {/* ── AI vs Human content ratio ─────────────────────────── */}
          {ratio && ratio.totalEdits > 0 && (
            <div className="rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-4">
                AI vs Human Content
              </h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      AI generated ({ratio.aiEdits})
                    </span>
                    <span className="text-muted-foreground">
                      Human ({ratio.humanEdits})
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
                    {ratio.totalEdits > 0 && (
                      <>
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${(ratio.aiEdits / ratio.totalEdits) * 100}%`,
                          }}
                        />
                        <div
                          className="h-full bg-muted-foreground/30 transition-all"
                          style={{
                            width: `${(ratio.humanEdits / ratio.totalEdits) * 100}%`,
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>
                {ratio.aiModifiedByHuman > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {ratio.aiModifiedByHuman} AI-generated fields were modified
                    by editors ({((ratio.aiModifiedByHuman / ratio.aiEdits) * 100).toFixed(0)}%)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Agent leaderboard ─────────────────────────────────── */}
          {agents.length > 0 && (
            <div className="rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-4">
                Agent Leaderboard
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Agent
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Runs
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Documents
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Cost
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Avg time
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Success
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Last run
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr
                        key={a.agentId}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2.5 font-medium">{a.agentName}</td>
                        <td className="py-2.5 text-right font-mono text-muted-foreground">
                          {a.totalRuns}
                        </td>
                        <td className="py-2.5 text-right font-mono text-muted-foreground">
                          {a.totalDocuments}
                        </td>
                        <td className="py-2.5 text-right font-mono text-muted-foreground">
                          {formatCost(a.totalCostUsd)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-muted-foreground">
                          {formatDuration(a.avgDurationMs)}
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          <span
                            className={
                              a.successRate >= 0.9
                                ? "text-green-500"
                                : a.successRate >= 0.7
                                  ? "text-yellow-500"
                                  : "text-red-500"
                            }
                          >
                            {(a.successRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">
                          {a.lastRunAt ? timeAgo(a.lastRunAt) : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Cost by model ─────────────────────────────────────── */}
          {costs && Object.keys(costs.costByModel).length > 0 && (
            <div className="rounded-xl border border-border p-5">
              <h2 className="font-semibold text-foreground mb-4">
                Cost by Model (this month)
              </h2>
              <div className="space-y-2">
                {Object.entries(costs.costByModel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([model, cost]) => {
                    const pct =
                      costs.totalCostUsd > 0
                        ? (cost / costs.totalCostUsd) * 100
                        : 0;
                    return (
                      <div key={model}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-mono">{model}</span>
                          <span className="text-muted-foreground">
                            {formatCost(cost)} ({pct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Run history ───────────────────────────────────────── */}
          <div className="rounded-xl border border-border p-5">
            <h2 className="font-semibold text-foreground mb-4">
              Recent Runs (last 50)
            </h2>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No runs recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Agent
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Collection
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Model
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Tokens
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Cost
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        Duration
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">
                        When
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr
                        key={run.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2">
                          {run.status === "success" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </td>
                        <td className="py-2 font-medium">{run.agentName}</td>
                        <td className="py-2 text-muted-foreground">
                          {run.collection}
                        </td>
                        <td className="py-2 font-mono text-xs text-muted-foreground">
                          {run.model}
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {(
                            run.tokensUsed.input + run.tokensUsed.output
                          ).toLocaleString()}
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {formatCost(run.costUsd)}
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {formatDuration(run.durationMs)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {timeAgo(run.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold font-mono text-foreground">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
