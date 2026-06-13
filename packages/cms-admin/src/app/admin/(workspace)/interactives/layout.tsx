/**
 * F153 — capability gate for the Interactives section.
 *
 * Server-side boundary: the interactives pages are client components, so this
 * layout enforces the `interactives` capability for the whole section
 * (/admin/interactives + /admin/interactives/[id]) — a tenant with it off that
 * hand-types the URL is redirected to /admin. Defaults ON, so untouched sites
 * are unchanged.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function InteractivesLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "interactives")) redirect("/admin");
  return <>{children}</>;
}
