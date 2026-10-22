"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LayoutGrid, List, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CloneAgentButton } from "@/components/clone-agent-button";
import { useT } from "@/lib/i18n-context";

interface Agent {
  id: string;
  name: string;
  role: string;
  active: boolean;
  stats: { totalGenerated: number; approved: number; rejected: number; edited: number };
  schedule: { enabled: boolean; frequency: string; time: string };
  targetCollections?: string[];
}

const ROLE_LABELS: Record<string, string> = {
  copywriter: "agents.agentsList.roleCopywriter",
  seo: "agents.agentsList.roleSeo",
  translator: "agents.agentsList.roleTranslator",
  refresher: "agents.agentsList.roleRefresher",
  custom: "agents.agentsList.roleCustom",
};

type View = "grid" | "list";
type Filter = "all" | "active" | "inactive";

export function AgentsList({ agents, readOnly }: { agents: Agent[]; readOnly?: boolean }) {
  const t = useT();
  const [view, setView] = useState<View>("grid");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    // Try server state first, then localStorage
    fetch("/api/admin/user-state").then((r) => r.ok ? r.json() : null).then((state) => {
      if (state?.agentsView === "list" || state?.agentsView === "grid") { setView(state.agentsView); return; }
      const saved = localStorage.getItem("agents-view");
      if (saved === "list" || saved === "grid") setView(saved);
    }).catch(() => {
      const saved = localStorage.getItem("agents-view");
      if (saved === "list" || saved === "grid") setView(saved);
    });
  }, []);

  function toggleView(v: View) {
    setView(v);
    localStorage.setItem("agents-view", v);
    fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentsView: v }) }).catch(() => {});
  }

  const filtered = filter === "all" ? agents
    : filter === "active" ? agents.filter((a) => a.active)
    : agents.filter((a) => !a.active);

  const activeCount = agents.filter((a) => a.active).length;
  const inactiveCount = agents.length - activeCount;

  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
        <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-2">{t("agents.agentsList.emptyTitle")}</p>
        <p className="text-sm mb-6">{t("agents.agentsList.emptyBody")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar: filter + view toggle */}
      <div className="flex items-center justify-between mb-4">
        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {([
            { value: "all" as Filter, label: t("agents.agentsList.filterAll", { count: agents.length }) },
            { value: "active" as Filter, label: t("agents.agentsList.filterActive", { count: activeCount }) },
            { value: "inactive" as Filter, label: t("agents.agentsList.filterInactive", { count: inactiveCount }) },
          ]).map((f) => (
            <button
              data-testid={`agent-filter-${f.value}`}
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${filter === f.value ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            data-testid="view-grid"
            type="button"
            onClick={() => toggleView("grid")}
            className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title={t("agents.agentsList.gridView")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="view-list"
            type="button"
            onClick={() => toggleView("list")}
            className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title={t("agents.agentsList.listView")}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const approvalRate = agent.stats.totalGenerated > 0
              ? Math.round((agent.stats.approved / agent.stats.totalGenerated) * 100)
              : 0;
            return (
              <Link
                key={agent.id}
                href={`/admin/agents/${agent.id}`}
                className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${agent.active ? "bg-green-500" : "bg-gray-400"}`} />
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{agent.name}</span>
                  </div>
                  <Badge variant="secondary">{ROLE_LABELS[agent.role] ? t(ROLE_LABELS[agent.role]) : agent.role}</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    {t("agents.agentsList.generated", { count: agent.stats.totalGenerated })}
                    {agent.stats.totalGenerated > 0 && <>{t("agents.agentsList.approvalSuffix", { rate: approvalRate })}</>}
                  </p>
                  {agent.schedule.enabled && (
                    <p>
                      {t("agents.agentsList.scheduleAt", { frequency: agent.schedule.frequency === "daily" ? t("agents.agentsList.daily") : agent.schedule.frequency === "weekly" ? t("agents.agentsList.weekly") : t("agents.agentsList.manual"), time: agent.schedule.time })}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex justify-end mt-2">
                    <CloneAgentButton id={agent.id} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="space-y-1">
          {filtered.map((agent) => {
            const approvalRate = agent.stats.totalGenerated > 0
              ? Math.round((agent.stats.approved / agent.stats.totalGenerated) * 100)
              : 0;
            return (
              <Link
                key={agent.id}
                href={`/admin/agents/${agent.id}`}
                className="group flex items-center gap-4 px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${agent.active ? "bg-green-500" : "bg-gray-400"}`} />
                <span className="font-medium text-foreground group-hover:text-primary transition-colors min-w-[160px]">{agent.name}</span>
                <Badge variant="secondary" className="shrink-0">{ROLE_LABELS[agent.role] ? t(ROLE_LABELS[agent.role]) : agent.role}</Badge>
                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                  {t("agents.agentsList.generated", { count: agent.stats.totalGenerated })}
                  {agent.stats.totalGenerated > 0 && <>{" \u00b7 "}{approvalRate}%</>}
                </span>
                {agent.schedule.enabled && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {agent.schedule.frequency === "daily" ? t("agents.agentsList.daily") : agent.schedule.frequency === "weekly" ? t("agents.agentsList.weekly") : t("agents.agentsList.manual")}{" "}
                    {agent.schedule.time}
                  </span>
                )}
                {!readOnly && <CloneAgentButton id={agent.id} />}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
