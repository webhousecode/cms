/**
 * F153 — capability gate for the Link Checker (a `quality` tool).
 * Server-side redirect when `quality` is off. Defaults ON.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function LinkCheckerLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "quality")) redirect("/admin");
  return <>{children}</>;
}
