/**
 * F153 — capability gate for the SEO dashboard.
 *
 * Server-side boundary: the SEO page is a client component, so this layout is
 * where the `seo` capability is enforced — a tenant with SEO turned off that
 * hand-types /admin/seo gets redirected to /admin. Defaults ON, so untouched
 * sites are unchanged. (Per-document meta fields stay available; this only
 * gates the dedicated SEO tools.)
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function SeoLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "seo")) redirect("/admin");
  return <>{children}</>;
}
