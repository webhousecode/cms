/**
 * F153 — capability gate for Backup & Restore.
 * Server-side redirect when `backup` is off (on top of the existing
 * admin-only access). Defaults ON.
 */
import { redirect } from "next/navigation";
import { getCapabilities } from "@/lib/capabilities";
import { hasCapability } from "@/lib/capabilities-shared";

export default async function BackupLayout({ children }: { children: React.ReactNode }) {
  const caps = await getCapabilities();
  if (!hasCapability(caps, "backup")) redirect("/admin");
  return <>{children}</>;
}
