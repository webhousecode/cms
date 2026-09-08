/**
 * F191.8 — den gamle rute. Ordbogen er blevet til fanen «Udtale».
 * Mappen bliver stående af samme grund som sponsorer/ — se den fil.
 */
import { redirect } from "next/navigation";

export default function UdtaleRedirect() {
  redirect("/admin/podcast?fane=udtale");
}
