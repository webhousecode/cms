import { listAgents } from "@/lib/agents";
import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  copywriter: "Indholdsskribent",
  seo: "SEO Optimering",
  translator: "Oversætter",
  refresher: "Indholdsopdatering",
  custom: "Brugerdefineret",
};

export default async function AgentsPage() {
  const agents = await listAgents();

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
            AI
          </p>
          <h1 className="text-3xl font-bold text-foreground">AI Agenter</h1>
        </div>
        <Link
          href="/admin/agents/new"
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
        >
          <Plus className="w-4 h-4" />
          Ny Agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium mb-2">Ingen agenter endnu</p>
          <p className="text-sm mb-6">
            Opret din første AI-agent til at generere indhold automatisk.
          </p>
          <Link
            href="/admin/agents/new"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
          >
            <Plus className="w-4 h-4" />
            Opret Agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const approvalRate =
              agent.stats.totalGenerated > 0
                ? Math.round(
                    (agent.stats.approved / agent.stats.totalGenerated) * 100
                  )
                : 0;
            return (
              <Link
                key={agent.id}
                href={`/admin/agents/${agent.id}`}
                className="group block p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        agent.active ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {agent.name}
                    </span>
                  </div>
                  <Badge variant="secondary">
                    {ROLE_LABELS[agent.role] ?? agent.role}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p>
                    {agent.stats.totalGenerated} genereret
                    {agent.stats.totalGenerated > 0 && (
                      <> &middot; {approvalRate}% godkendelse</>
                    )}
                  </p>
                  {agent.schedule.enabled && (
                    <p>
                      {agent.schedule.frequency === "daily"
                        ? "Daglig"
                        : agent.schedule.frequency === "weekly"
                        ? "Ugentlig"
                        : "Manuel"}{" "}
                      kl. {agent.schedule.time}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
