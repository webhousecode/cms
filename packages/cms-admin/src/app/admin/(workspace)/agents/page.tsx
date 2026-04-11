import { listAgents } from "@/lib/agents";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { AgentsTabs } from "@/components/agents-tabs";
import { getSiteRole } from "@/lib/require-role";
import { resolvePermissions } from "@/lib/permissions-shared";
import type { UserRole } from "@/lib/auth";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

export default async function AgentsPage() {
  const [agents, siteRole] = await Promise.all([listAgents(), getSiteRole()]);
  const perms = resolvePermissions((siteRole ?? "viewer") as UserRole);
  const canManageAgents = perms.includes("agents.manage");

  return (
    <>
      <TabTitle value="Agents" />
      <ActionBar helpArticleId="agents-intro"
        actions={canManageAgents ? (
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
        <AgentsTabs agents={agents} readOnly={siteRole === "viewer"} />
      </div>
    </>
  );
}
