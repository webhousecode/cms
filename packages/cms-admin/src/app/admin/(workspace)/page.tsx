import { getActiveSiteInfo, getAdminCms, EmptyOrgError } from "@/lib/cms";
import { redirect } from "next/navigation";
import { DashboardStats } from "@/components/dashboard-stats";

export default async function AdminDashboard() {
  // Multi-site with no site selected → go to sites dashboard
  const siteInfo = await getActiveSiteInfo();
  if (siteInfo && !siteInfo.activeSiteId) {
    redirect("/admin/sites");
  }

  // Empty org (no sites) → go to sites dashboard
  try {
    await getAdminCms();
  } catch (err) {
    if (err instanceof EmptyOrgError) redirect("/admin/sites");
    throw err;
  }

  return <DashboardStats />;
}
