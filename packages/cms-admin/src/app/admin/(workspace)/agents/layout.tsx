/**
 * F153 — capability gate for the whole Agents section.
 *
 * Server-side boundary (defense-in-depth): if this tenant has the `agents`
 * capability turned off, every /admin/agents* route redirects to /admin —
 * even a hand-typed URL. The sidebar/command-palette already hide the nav, but
 * hiding UI is never the security control. Defaults ON, so untouched sites are
 * unchanged. `agents` requires `ai`, so turning AI off cascades here too.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function AgentsLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "agents")) redirect("/admin");
  return <>{children}</>;
}
