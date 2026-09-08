/**
 * F189.6 — server-gaten. Den er sikkerhedsgrænsen; det skjulte menupunkt i
 * sidebaren er kun UX.
 *
 * `podcast.read` og ikke en rolle-sammenligning: husets regel siger at et
 * direkte `role === "admin"` er usynligt for permission-systemet. De to andre
 * podcast-tilladelser gates hvor de bruges — `podcast.edit` på skrivningerne
 * og `podcast.record` på den ene knap der bruger penge.
 */
import { redirect } from "next/navigation";
import { getSiteRole } from "@/lib/require-role";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions-shared";

export default async function PodcastLayout({ children }: { children: React.ReactNode }) {
  const role = await getSiteRole();
  if (!hasPermission(ROLE_PERMISSIONS[role!] ?? [], "podcast.read")) redirect("/admin");
  return <>{children}</>;
}
