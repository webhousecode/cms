import { listAgents } from "@/lib/agents";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { AgentsTabs } from "@/components/agents-tabs";
import { getSiteRole } from "@/lib/require-role";
import { resolvePermissions } from "@/lib/permissions-shared";
import type { UserRole } from "@/lib/auth";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { getServerT } from "@/i18n/server";

export default async function AgentsPage() {
  const [agents, siteRole] = await Promise.all([listAgents(), getSiteRole()]);
  const perms = resolvePermissions((siteRole ?? "viewer") as UserRole);
  const canManageAgents = perms.includes("agents.manage");
  const t = await getServerT();

  return (
    <div data-testid="agents-root">
      <TabTitle value={t("pages.agentsList.title")} />
      <ActionBar helpArticleId="agents-intro"
        actions={canManageAgents ? (
          <Link href="/admin/agents/new">
            <ActionButton variant="primary" icon={<Plus style={{ width: 14, height: 14 }} />}>
              {t("pages.agentsList.newAgent")}
            </ActionButton>
          </Link>
        ) : undefined}
      >
        <ActionBarBreadcrumb items={["AI", t("pages.agentsList.title")]} />
      </ActionBar>
      <div className="p-8 max-w-5xl">
        <AgentsTabs agents={agents} readOnly={siteRole === "viewer"} />
      </div>
    </div>
  );
}
