/**
 * Two gates, answering two different questions.
 *
 * F153 capability — is the Forms FEATURE on for this tenant. Defaults ON.
 * forms.read permission — may THIS PERSON see visitors' submissions. A viewer
 *   may not (Christian, 28 Aug 2026). Without this the page served the same
 *   names and messages the chat had just been taught to refuse.
 *
 * Public form submission/widget endpoints (/api/forms/*) are NOT gated.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";
import { getSiteRole } from "@/lib/require-role";
import { ROLE_PERMISSIONS, hasPermission } from "@/lib/permissions-shared";

export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "forms")) redirect("/admin");
  const role = await getSiteRole();
  if (!hasPermission(ROLE_PERMISSIONS[role!] ?? [], "forms.read")) redirect("/admin");
  return <>{children}</>;
}
