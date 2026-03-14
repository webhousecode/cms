"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LayoutGrid, List, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CloneAgentButton } from "@/components/clone-agent-button";

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
  copywriter: "Content Writer",
  seo: "SEO",
  translator: "Translator",
  refresher: "Content Refresher",
  custom: "Custom",
};

type View = "grid" | "list";
type Filter = "all" | "active" | "inactive";

export function AgentsList({ agents }: { agents: Agent[] }) {
  const [view, setView] = useState<View>("grid");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const saved = localStorage.getItem("agents-view");
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);

  function toggleView(v: View) {
    setView(v);
    localStorage.setItem("agents-view", v);
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
        <p className="text-lg font-medium mb-2">No agents yet</p>
        <p className="text-sm mb-6">Create your first AI agent to generate content automatically.</p>
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
            { value: "all" as Filter, label: `All (${agents.length})` },
            { value: "active" as Filter, label: `Active (${activeCount})` },
            { value: "inactive" as Filter, label: `Inactive (${inactiveCount})` },
          ]).map((f) => (
            <button
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
            type="button"
            onClick={() => toggleView("grid")}
            className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toggleView("list")}
            className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="List view"
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
                  <Badge variant="secondary">{ROLE_LABELS[agent.role] ?? agent.role}</Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    {agent.stats.totalGenerated} generated
                    {agent.stats.totalGenerated > 0 && <> &middot; {approvalRate}% approval</>}
                  </p>
                  {agent.schedule.enabled && (
                    <p>
                      {agent.schedule.frequency === "daily" ? "Daily" : agent.schedule.frequency === "weekly" ? "Weekly" : "Manual"}{" "}
                      at {agent.schedule.time}
                    </p>
                  )}
                </div>
                <div className="flex justify-end mt-2">
                  <CloneAgentButton id={agent.id} />
                </div>
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
                <Badge variant="secondary" className="shrink-0">{ROLE_LABELS[agent.role] ?? agent.role}</Badge>
                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                  {agent.stats.totalGenerated} generated
                  {agent.stats.totalGenerated > 0 && <> &middot; {approvalRate}%</>}
                </span>
                {agent.schedule.enabled && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {agent.schedule.frequency === "daily" ? "Daily" : agent.schedule.frequency === "weekly" ? "Weekly" : "Manual"}{" "}
                    {agent.schedule.time}
                  </span>
                )}
                <CloneAgentButton id={agent.id} />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
