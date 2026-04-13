import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { redirect } from "next/navigation";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { DeployWizard } from "@/components/deploy-wizard/deploy-wizard";

export default async function DockerDeployPage() {
  // Admin only
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) redirect("/admin/login");
  const members = await getTeamMembers();
  const membership = session.sub === "dev-token" ? { role: "admin" } : members.find((m) => m.userId === session.sub);
  if (!membership || membership.role !== "admin") {
    redirect("/admin");
  }

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Deploy", "Docker"]} />
      </ActionBar>
      <div className="p-8">
        <DeployWizard />
      </div>
    </>
  );
}
