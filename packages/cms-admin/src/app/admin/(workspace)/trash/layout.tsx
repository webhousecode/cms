/**
 * The trash page itself was gated by NOTHING on the server.
 *
 * It is a client component reading `usePermissions()`, which decides what to
 * RENDER — a UX concern. A viewer who typed /admin/trash reached the page, and
 * it fetched the listing. Hiding a link is not a gate; the sidebar's own check
 * was `siteRole !== "viewer"`, a bare role comparison this repo's rules forbid
 * for exactly this reason: it is invisible to the permission system and cannot
 * be reasoned about with the others.
 *
 * Christian, 28 Aug 2026: «ja, læser må ikke se slettet indhold og gamle
 * versioner.» This is where that is true regardless of what the client renders.
 */
import { redirect } from "next/navigation";
import { getSiteRole } from "@/lib/require-role";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions-shared";

export default async function TrashLayout({ children }: { children: React.ReactNode }) {
  const role = await getSiteRole();
  // Fail closed: no role ⇒ ROLE_PERMISSIONS[null] is undefined ⇒ [] ⇒ redirect.
  if (!hasPermission(ROLE_PERMISSIONS[role!] ?? [], "content.history")) redirect("/admin");
  return <>{children}</>;
}
