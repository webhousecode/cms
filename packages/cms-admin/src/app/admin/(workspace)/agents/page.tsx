import { listAgents } from "@/lib/agents";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { AgentsList } from "@/components/agents-list";
import { getSiteRole } from "@/lib/require-role";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

export default async function AgentsPage() {
  const [agents, siteRole] = await Promise.all([listAgents(), getSiteRole()]);

  return (
    <>
      <TabTitle value="Agents" />
      <ActionBar helpArticleId="agents-intro"
        actions={siteRole !== "viewer" ? (
          <Link href="/admin/agents/new">
            <ActionButton variant="primary" icon={<Plus style={{ width: 14, height: 14 }} />}>
              New Agent
            </ActionButton>
          </Link>
        ) : undefined}
      >
        <ActionBarBreadcrumb items={["AI", "Agents"]} />
      </ActionBar>
      <div className="p-8 max-w-5xl">
        <AgentsList agents={agents} readOnly={siteRole === "viewer"} />
      </div>
    </>
  );
}
