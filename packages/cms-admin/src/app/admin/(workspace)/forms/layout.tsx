/**
 * F153 — capability gate for the Forms section (admin side).
 * Server-side redirect when `forms` is off; public form submission/widget
 * endpoints (/api/forms/*) are NOT gated. Defaults ON.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function FormsLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "forms")) redirect("/admin");
  return <>{children}</>;
}
