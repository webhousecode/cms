import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { GeneralSettingsPanel, PasswordChangePanel } from "@/components/settings/general-settings-panel";
import { PasskeysPanel } from "@/components/settings/passkeys-panel";
import { TotpPanel } from "@/components/settings/totp-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { MobilePairingClient } from "./mobile-pairing/client";
import { AccessTokensPanel } from "@/components/settings/access-tokens-panel";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "general" } = await searchParams;

  const tabs = [
    { id: "general", label: "General" },
    { id: "security", label: "Security" },
    { id: "tokens", label: "Access Tokens" },
    { id: "mobile", label: "Mobile" },
  ];

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Account"]} />
      </ActionBar>
      <div className="p-8 max-w-4xl">

        {/* Tab strip */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/admin/account?tab=${t.id}`}
              className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
                tab === t.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
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
              <SectionHeading>Security</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                Manage your account security settings and authentication methods.
              </p>
            </div>

            {/* Change password — real form */}
            <PasswordChangePanel />

            {/* Passkeys (F59) */}
            <PasskeysPanel />

            {/* TOTP — Authenticator app (F59 phase 4) */}
            <TotpPanel />
          </div>
        )}

        {/* Access Tokens tab */}
        {tab === "tokens" && <AccessTokensPanel />}

        {/* Mobile tab — F07 webhouse.app pairing QR */}
        {tab === "mobile" && (
          <div className="max-w-2xl space-y-6">
            <div>
              <SectionHeading>Pair mobile device</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                Sign in to the webhouse.app mobile app by scanning this QR code with your phone. The QR encodes both the server URL and a one-time pairing token — single-use, 5-minute TTL.
              </p>
            </div>
            <MobilePairingClient />
          </div>
        )}
      </div>
    </>
  );
}

