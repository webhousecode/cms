import { redirect } from "next/navigation";
import { getSiteRole } from "@/lib/require-role";

export default async function EventLogLayout({ children }: { children: React.ReactNode }) {
  const role = await getSiteRole();
  if (role !== "admin") redirect("/admin");
  return <>{children}</>;
}
