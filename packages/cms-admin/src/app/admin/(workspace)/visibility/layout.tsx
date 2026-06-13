/**
 * F153 — capability gate for the Visibility (SEO + GEO score) dashboard.
 * Same `seo` capability as the SEO tools. Server-side redirect; defaults ON.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function VisibilityLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "seo")) redirect("/admin");
  return <>{children}</>;
}
