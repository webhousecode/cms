import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { GeneralSettingsPanel, PasswordChangePanel } from "@/components/settings/general-settings-panel";
import { PasskeysPanel } from "@/components/settings/passkeys-panel";
import { SectionHeading } from "@/components/ui/section-heading";

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

            {/* 2FA placeholder */}
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>Authenticator app</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Generate one-time passwords via authenticator apps like 1Password, Authy, etc. as a second factor to verify your identity on sign-in.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">0 APPS CONFIGURED</span>
              </div>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Add new app
              </button>
            </div>
          </div>
        )}

        {/* Access Tokens tab */}
        {tab === "tokens" && (
          <div className="max-w-2xl space-y-6">
            <div>
              <SectionHeading>Access Tokens</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
                Create and manage access tokens for API authentication.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <input
                  type="text"
                  placeholder="Filter tokens"
                  className="text-sm bg-transparent border border-border rounded-md px-3 py-1.5 outline-none focus:border-primary w-48"
                />
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  Generate new token
                </button>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                <span>Token</span>
                <span>Last used</span>
                <span>Expires</span>
              </div>

              {/* Empty state */}
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No access tokens yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Generate a token to authenticate API requests.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
