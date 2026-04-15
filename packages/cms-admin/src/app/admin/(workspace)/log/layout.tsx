import { redirect } from "next/navigation";
import { getSiteRole } from "@/lib/require-role";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions-shared";

export default async function EventLogLayout({ children }: { children: React.ReactNode }) {
  const role = await getSiteRole();
  if (!role) redirect("/admin");
  const granted = ROLE_PERMISSIONS[role] ?? [];
  if (!hasPermission(granted, "logs.view")) redirect("/admin");
  return <>{children}</>;
}
