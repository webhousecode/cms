import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { SectionHeading } from "@/components/ui/section-heading";
import { getSessionUser } from "@/lib/auth";
import { MobilePairingClient } from "./client";
import { getServerT } from "@/i18n/server";

/**
 * /admin/account/mobile-pairing
 *
 * Shows a QR code that the webhouse.app mobile app can scan to log in
 * without typing a password. Implements F07 Phase 1 — see
 * docs/features/F07-phase-1-plan.md.
 *
 * The QR encodes a `webhouseapp://login?server=...&token=...` deep link
 * that's pre-approved with the current desktop user's identity. Single-use,
 * 5-minute TTL.
 */
export default async function MobilePairingPage() {
  const user = await getSessionUser(await cookies());
  const t = await getServerT();
  if (!user) {
    redirect("/admin/login?next=/admin/account/mobile-pairing");
  }

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={[t("tools.mobilePairing.account"), t("tools.mobilePairing.title")]} />
      </ActionBar>
      <div className="p-8 max-w-2xl">
        <SectionHeading first>{t("tools.mobilePairing.title")}</SectionHeading>
        <p className="text-sm text-muted-foreground mb-6">
          {t("tools.mobilePairing.intro")}
        </p>
        <MobilePairingClient />
      </div>
    </>
  );
}
