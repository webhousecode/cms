import Link from "next/link";
import { Suspense } from "react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { GeneralSettingsPanel, PasswordChangePanel } from "@/components/settings/general-settings-panel";
import { PasskeysPanel } from "@/components/settings/passkeys-panel";
import { TotpPanel } from "@/components/settings/totp-panel";
import { BidPanel } from "@/components/settings/bid-panel";
import { isBidConfigured } from "@/lib/bid";
import { SectionHeading } from "@/components/ui/section-heading";
import { MobilePairingClient } from "./mobile-pairing/client";
import { getSiteRole } from "@/lib/require-role";
import { AccessTokensPanel } from "@/components/settings/access-tokens-panel";
import { BeamTokensPanel } from "@/components/account/beam-tokens-panel";
import { getServerT } from "@/i18n/server";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "general" } = await searchParams;
  const role = await getSiteRole();
  const t = await getServerT();
  const isAdmin = role === "admin";
  // F199.4 — with Broberg ID on, password/passkey/TOTP are not ways in any more,
  // so they are not offered as settings either. BID owns those credentials.
  const bid = isBidConfigured();

  const tabs = [
    { id: "general", label: t("tools.account.tabGeneral") },
    { id: "security", label: t("tools.account.tabSecurity") },
    { id: "tokens", label: t("tools.account.tabTokens") },
    ...(isAdmin ? [{ id: "beam", label: t("tools.account.tabBeam") }] : []),
    ...(isAdmin ? [{ id: "mobile", label: t("tools.account.tabMobile") }] : []),
  ];

  return (
    <div data-testid="account-root">
      <ActionBar>
        <ActionBarBreadcrumb items={[t("tools.account.title")]} />
      </ActionBar>
      <div className="p-8 max-w-4xl">

        {/* Tab strip */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((tb) => (
            <Link
              key={tb.id}
              href={`/admin/account?tab=${tb.id}`}
              className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
                tab === tb.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb.label}
            </Link>
          ))}
        </div>

        {/* General tab — reuse existing user settings */}
        {tab === "general" && (
          <div className="max-w-lg">
            <GeneralSettingsPanel />
          </div>
        )}

        {/* Security tab */}
        {tab === "security" && (
          <div className="max-w-lg space-y-6">
            <div>
              <SectionHeading>{t("tools.account.tabSecurity")}</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                {t("tools.account.securityIntro")}
              </p>
            </div>

            {/* Change password — real form */}
            {!bid && <PasswordChangePanel />}

            {/* Broberg ID (F199) — hidden unless the server has BID configured */}
            <Suspense fallback={null}><BidPanel /></Suspense>

            {/* Passkeys (F59) */}
            {!bid && <PasskeysPanel />}

            {/* TOTP — Authenticator app (F59 phase 4) */}
            {!bid && <TotpPanel />}
          </div>
        )}

        {/* Access Tokens tab */}
        {tab === "tokens" && <AccessTokensPanel />}

        {/* F138-C: Beam tab (admin only) — generate receive-tokens for transfers from another CMS. */}
        {tab === "beam" && isAdmin && (
          <div className="max-w-2xl">
            <BeamTokensPanel />
          </div>
        )}

        {/* Mobile tab — F07 webhouse.app pairing QR (admin only) */}
        {tab === "mobile" && isAdmin && (
          <div className="max-w-2xl space-y-6">
            <div>
              <SectionHeading>{t("tools.mobilePairing.title")}</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                {t("tools.account.mobileIntro")}
              </p>
            </div>
            <MobilePairingClient />
          </div>
        )}
      </div>
    </div>
  );
}

