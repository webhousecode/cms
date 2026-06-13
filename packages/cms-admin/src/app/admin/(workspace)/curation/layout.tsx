/**
 * F153 — capability gate for the Curation Queue (AI-generated content review).
 *
 * Server-side boundary: the curation page is a client component, so this layout
 * is where the `ai` capability is actually enforced — a no-AI tenant that
 * hand-types /admin/curation gets redirected to /admin. Defaults ON, so
 * untouched sites are unchanged.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function CurationLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "ai")) redirect("/admin");
  return <>{children}</>;
}
