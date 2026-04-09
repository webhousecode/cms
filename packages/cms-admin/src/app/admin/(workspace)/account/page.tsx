import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { GeneralSettingsPanel, PasswordChangePanel } from "@/components/settings/general-settings-panel";
import { PasskeysPanel } from "@/components/settings/passkeys-panel";
import { TotpPanel } from "@/components/settings/totp-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { MobilePairingClient } from "./mobile-pairing/client";

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
        )}

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

// ─── Access Tokens Panel ────────────────────────────────

function AccessTokensPanel() {
  const [tokens, setTokens] = useState<Array<{ id: string; name: string; scopes: string[]; createdAt: string; lastUsed?: string }>>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    const res = await fetch("/api/admin/access-tokens");
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens ?? []);
    }
  }, []);

  useEffect(() => { void loadTokens(); }, [loadTokens]);

  async function handleCreate() {
    if (!tokenName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/admin/access-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tokenName.trim(), scopes: ["admin"] }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken(data.token);
      setTokenName("");
      await loadTokens();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/access-tokens?id=${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    await loadTokens();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <SectionHeading>Access Tokens</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
          Create and manage access tokens for API authentication. Tokens have full admin access.
        </p>
      </div>

      {/* New token reveal — shown once after creation */}
      {newToken && (
        <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-medium text-primary">New token created — copy it now, it won't be shown again:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-background border border-border rounded px-3 py-2 select-all break-all">
              {newToken}
            </code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(newToken); }}
              className="text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 cursor-pointer shrink-0"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create new token */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Token name (e.g. Claude Code, CI/CD)"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="flex-1 text-sm bg-transparent border border-border rounded-md px-3 py-1.5 outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={creating || !tokenName.trim()}
          onClick={handleCreate}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
        >
          Generate
        </button>
      </div>

      {/* Token list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
          <span>Name</span>
          <span>Scopes</span>
          <span>Last used</span>
          <span></span>
        </div>

        {tokens.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No access tokens yet.</p>
          </div>
        ) : (
          tokens.map((t) => (
            <div key={t.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 border-b border-border last:border-0 items-center">
              <div>
                <span className="text-sm">{t.name}</span>
                <span className="text-xs text-muted-foreground ml-2">wh_•••</span>
              </div>
              <span className="text-xs text-muted-foreground">{t.scopes?.join(", ")}</span>
              <span className="text-xs text-muted-foreground">
                {t.lastUsed ? new Date(t.lastUsed).toLocaleDateString() : "Never"}
              </span>
              <div>
                {confirmDelete === t.id ? (
                  <span className="flex items-center gap-1">
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                    <button onClick={() => handleDelete(t.id)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "none", background: "var(--destructive)", color: "#fff",
                        cursor: "pointer", lineHeight: 1 }}>Yes</button>
                    <button onClick={() => setConfirmDelete(null)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(t.id)}
                    className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
