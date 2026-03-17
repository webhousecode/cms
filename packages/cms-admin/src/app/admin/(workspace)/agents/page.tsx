import { listAgents } from "@/lib/agents";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { AgentsList } from "@/components/agents-list";
import { getSiteRole } from "@/lib/require-role";

export default async function AgentsPage() {
  const [agents, siteRole] = await Promise.all([listAgents(), getSiteRole()]);

  return (
    <>
      <TabTitle value="Agents" />
      <div className="p-8 max-w-5xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">AI</p>
            <h1 className="text-2xl font-bold text-foreground">Agents</h1>
          </div>
          {siteRole !== "viewer" && (
            <Link
              href="/admin/agents/new"
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </Link>
          )}
        </div>

        <AgentsList agents={agents} />
      </div>
    </>
  );
}
