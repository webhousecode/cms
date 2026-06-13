/**
 * F153 — capability gate for the scheduled-publishing Calendar.
 * Server-side redirect when `scheduling` is off. The background publisher
 * (/api/publish-scheduled) is NOT gated. Defaults ON.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function ScheduledLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "scheduling")) redirect("/admin");
  return <>{children}</>;
}
