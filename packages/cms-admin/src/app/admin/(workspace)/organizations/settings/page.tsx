"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { ExternalLink } from "lucide-react";

interface OrgEntry {
  id: string;
  name: string;
  type?: string;
  plan?: string;
  sites: { id: string; name: string }[];
}

interface Registry {
  orgs: OrgEntry[];
  defaultOrgId: string;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type OrgTab = "general" | "credentials";

interface OrgCreds {
  deployApiToken: string;
  deployFlyOrg: string;
  deployHookUrl: string;
  resendApiKey: string;
  emailFrom: string;
  emailFromName: string;
  aiContentModel: string;
  aiContentMaxTokens: number;
  aiInteractivesModel: string;
  aiInteractivesMaxTokens: number;
}

const CREDS_DEFAULTS: OrgCreds = {
  deployApiToken: "",
  deployFlyOrg: "",
  deployHookUrl: "",
  resendApiKey: "",
  emailFrom: "",
  emailFromName: "",
  aiContentModel: "",
  aiContentMaxTokens: 0,
  aiInteractivesModel: "",
  aiInteractivesMaxTokens: 0,
};

export default function OrgSettingsPage() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("personal");
  const [orgPlan, setOrgPlan] = useState("free");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<OrgTab>("general");
  // Org credentials (F87)
  const [creds, setCreds] = useState<OrgCreds>(CREDS_DEFAULTS);
  const [credsSaving, setCredsSaving] = useState(false);
  const [credsSaved, setCredsSaved] = useState(false);
  // Delete org
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteCode] = useState(() => Math.random().toString(36).slice(2, 14));

  useEffect(() => {
    fetch("/api/cms/registry")
      .then((r) => r.json())
      .then((d: { registry: Registry | null }) => {
        if (d.registry) {
          setRegistry(d.registry);
          const orgId = getCookie("cms-active-org") ?? d.registry.defaultOrgId;
          setActiveOrgId(orgId);
          const org = d.registry.orgs.find((o) => o.id === orgId);
          if (org) {
            setOrgName(org.name);
            setOrgType(org.type ?? "personal");
            setOrgPlan(org.plan ?? "free");
          }
        }
      })
      .finally(() => setLoaded(true));

    // Load org credentials
    fetch("/api/admin/org-settings")
      .then((r) => r.ok ? r.json() : {})
      .then((data: Record<string, unknown>) => {
        setCreds({
          deployApiToken: (data.deployApiToken as string) ?? "",
          deployFlyOrg: (data.deployFlyOrg as string) ?? "",
          deployHookUrl: (data.deployHookUrl as string) ?? "",
          resendApiKey: (data.resendApiKey as string) ?? "",
          emailFrom: (data.emailFrom as string) ?? "",
          emailFromName: (data.emailFromName as string) ?? "",
          aiContentModel: (data.aiContentModel as string) ?? "",
          aiContentMaxTokens: (data.aiContentMaxTokens as number) ?? 0,
          aiInteractivesModel: (data.aiInteractivesModel as string) ?? "",
          aiInteractivesMaxTokens: (data.aiInteractivesMaxTokens as number) ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  const handleSaveCreds = useCallback(async () => {
    setCredsSaving(true);
    // Only send non-empty values
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(creds)) {
      if (v !== "" && v !== 0) patch[k] = v;
    }
    await fetch("/api/admin/org-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setCredsSaving(false);
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 2000);
  }, [creds]);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId);

  async function handleSave() {
    if (!registry || !activeOrg) return;
    setSaving(true);
    await fetch("/api/cms/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-org",
        orgId: activeOrgId,
        orgName: orgName.trim() || activeOrg.name,
        orgType,
        orgPlan,
      }),
    });
    // Update local state
    setRegistry({
      ...registry,
      orgs: registry.orgs.map((o) =>
        o.id === activeOrgId ? { ...o, name: orgName.trim() || o.name, type: orgType, plan: orgPlan } : o
      ),
    });
    window.dispatchEvent(new CustomEvent("cms-registry-change"));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!loaded) {
    return (
      <div style={{ padding: "4rem 2rem" }}>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading...</p>
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div style={{ padding: "4rem 2rem" }}>
        <p style={{ color: "var(--muted-foreground)" }}>Organization not found.</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "6px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
  };

  const tabStyle = (t: OrgTab): React.CSSProperties => ({
    padding: "0.5rem 1rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
    border: "none", borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
    background: "transparent", color: tab === t ? "var(--foreground)" : "var(--muted-foreground)",
    transition: "all 0.15s",
  });

  const credInputStyle: React.CSSProperties = {
    width: "100%", padding: "0.45rem 0.75rem", borderRadius: "7px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace",
    boxSizing: "border-box",
  };

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-2">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Organization Settings</p>
        <h1 className="text-2xl font-bold text-foreground">{activeOrg.name}</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
          Organization configuration and shared credentials
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--border)", marginTop: "1.5rem", marginBottom: "1.5rem" }}>
        <button type="button" style={tabStyle("general")} onClick={() => setTab("general")}>General</button>
        <button type="button" style={tabStyle("credentials")} onClick={() => setTab("credentials")}>Credentials</button>
      </div>

      {/* ── Credentials tab ─────────────────────────────────── */}
      {tab === "credentials" && (
        <>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            Shared credentials inherited by all sites in this organization. Sites can override any value in their own Site Settings.
          </p>

          {/* Deploy tokens */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Deploy</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Fly.io API Token</label>
                <a href="https://fly.io/dashboard" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  fly.io/dashboard <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} />
                </a>
              </div>
              <input type="password" value={creds.deployApiToken} onChange={(e) => setCreds((c) => ({ ...c, deployApiToken: e.target.value }))}
                placeholder="FlyV1 ..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Fly.io Organization</label>
              <input type="text" value={creds.deployFlyOrg} onChange={(e) => setCreds((c) => ({ ...c, deployFlyOrg: e.target.value }))}
                placeholder="Auto-detect from token" style={credInputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Deploy Hook URL (Vercel/Netlify/Custom)</label>
              <input type="url" value={creds.deployHookUrl} onChange={(e) => setCreds((c) => ({ ...c, deployHookUrl: e.target.value }))}
                placeholder="https://..." style={credInputStyle} />
            </div>
          </div>

          {/* Email */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Email</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Resend API Key</label>
                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                  resend.com <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} />
                </a>
              </div>
              <input type="password" value={creds.resendApiKey} onChange={(e) => setCreds((c) => ({ ...c, resendApiKey: e.target.value }))}
                placeholder="re_..." style={{ ...credInputStyle, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>From address</label>
                <input type="email" value={creds.emailFrom} onChange={(e) => setCreds((c) => ({ ...c, emailFrom: e.target.value }))}
                  placeholder="noreply@example.com" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>From name</label>
                <input type="text" value={creds.emailFromName} onChange={(e) => setCreds((c) => ({ ...c, emailFromName: e.target.value }))}
                  placeholder="webhouse.app" style={{ ...credInputStyle, fontFamily: "inherit" }} />
              </div>
            </div>
          </div>

          {/* AI */}
          <h2 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>AI</h2>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Content model</label>
                <input type="text" value={creds.aiContentModel} onChange={(e) => setCreds((c) => ({ ...c, aiContentModel: e.target.value }))}
                  placeholder="claude-haiku-4-5-20251001" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Max tokens</label>
                <input type="number" value={creds.aiContentMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiContentMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="4096" style={credInputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Interactives model</label>
                <input type="text" value={creds.aiInteractivesModel} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesModel: e.target.value }))}
                  placeholder="claude-sonnet-4-6" style={credInputStyle} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Max tokens</label>
                <input type="number" value={creds.aiInteractivesMaxTokens || ""} onChange={(e) => setCreds((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(e.target.value) || 0 }))}
                  placeholder="16384" style={credInputStyle} />
              </div>
            </div>
          </div>

          {/* Save button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={handleSaveCreds}
              disabled={credsSaving}
              style={{
                padding: "0.45rem 1rem", borderRadius: "6px", border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontSize: "0.8rem", fontWeight: 600, cursor: credsSaving ? "wait" : "pointer",
              }}
            >
              {credsSaving ? "Saving..." : credsSaved ? "Saved" : "Save credentials"}
            </button>
          </div>
        </>
      )}

      {/* ── General tab ─────────────────────────────────────── */}
      {tab === "general" && <>

      {/* Organization details */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Organization details</h2>
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", overflow: "hidden",
        }}>
          {/* Name */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Organization name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ ...inputStyle, maxWidth: "320px" }}
            />
          </div>
          {/* Slug */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Organization slug</label>
            <div style={{ ...inputStyle, maxWidth: "320px", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "default" }}>
              {activeOrgId}
            </div>
          </div>
          {/* Type */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Type</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect
                options={[
                  { value: "agency", label: "Agency" },
                  { value: "company", label: "Company" },
                  { value: "personal", label: "Personal" },
                  { value: "freelancer", label: "Freelancer" },
                  { value: "nonprofit", label: "Non-profit" },
                ]}
                value={orgType}
                onChange={(v) => setOrgType(v)}
              />
            </div>
          </div>
          {/* Plan */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500, minWidth: "160px" }}>Plan</label>
            <div style={{ maxWidth: "320px", width: "100%" }}>
              <CustomSelect
                options={[
                  { value: "free", label: "Free — $0/month" },
                  { value: "pro", label: "Pro — $25/month" },
                  { value: "team", label: "Team — $599/month" },
                ]}
                value={orgPlan}
                onChange={(v) => setOrgPlan(v)}
              />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={() => router.push("/admin/organizations")}
            style={{
              padding: "0.45rem 0.75rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.45rem 1rem", borderRadius: "6px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Sites in this org */}
      <div style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Sites</h2>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {activeOrg.sites.length} site{activeOrg.sites.length !== 1 ? "s" : ""} in this organization
        </p>
        {activeOrg.sites.length > 0 && (
          <div style={{
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "10px", overflow: "hidden",
          }}>
            {activeOrg.sites.map((site, i) => (
              <div
                key={site.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.75rem 1.25rem",
                  borderBottom: i < activeOrg.sites.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{site.name}</span>
                <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{site.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--destructive)" }}>Danger zone</h2>
        <div style={{
          background: "var(--card)", border: "1px solid color-mix(in srgb, var(--destructive) 30%, var(--border))",
          borderRadius: "10px", padding: "1.25rem",
        }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
            Deleting this organization will also remove its sites
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
            Make sure you have made a backup of your projects if you want to keep your data.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            style={{
              padding: "0.4rem 0.75rem", borderRadius: "6px", border: "none",
              background: "var(--destructive)", color: "#fff",
              fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            Delete organization
          </button>
        </div>
      </div>

      </>}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteDialog(false); setDeleteConfirm(""); } }}
        >
          <div style={{
            background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)", width: "min(440px, 90vw)", padding: "1.5rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Delete organization</h3>
              <button type="button" onClick={() => { setShowDeleteDialog(false); setDeleteConfirm(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.25rem" }}>×</button>
            </div>

            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
              This action <strong style={{ color: "var(--foreground)" }}>cannot</strong> be undone. This will permanently delete the <strong style={{ color: "var(--foreground)" }}>{activeOrg.name}</strong> organization and remove all of its sites.
            </p>

            <p style={{ fontSize: "0.8rem", marginBottom: "0.5rem", marginTop: "1rem" }}>
              Type <code style={{ background: "var(--muted)", padding: "0.15rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", fontFamily: "monospace" }}>{deleteCode}</code> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="Enter the string above"
              autoFocus
              style={{
                width: "100%", padding: "0.5rem 0.6rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                marginBottom: "1rem",
              }}
            />
            <button
              type="button"
              disabled={deleteConfirm !== deleteCode || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  const res = await fetch(`/api/cms/registry?orgId=${activeOrgId}`, { method: "DELETE" });
                  if (res.ok) {
                    // Switch to default org
                    document.cookie = "cms-active-org=;path=/;max-age=0";
                    document.cookie = "cms-active-site=;path=/;max-age=0";
                    window.dispatchEvent(new CustomEvent("cms-registry-change"));
                    router.push("/admin/organizations");
                    router.refresh();
                  }
                } finally {
                  setDeleting(false);
                }
              }}
              style={{
                width: "100%", padding: "0.6rem", borderRadius: "6px", border: "none",
                background: deleteConfirm === deleteCode ? "var(--destructive)" : "var(--muted)",
                color: deleteConfirm === deleteCode ? "#fff" : "var(--muted-foreground)",
                fontSize: "0.8rem", fontWeight: 600,
                cursor: deleteConfirm === deleteCode && !deleting ? "pointer" : "not-allowed",
              }}
            >
              {deleting ? "Deleting..." : "I understand, delete this organization"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
