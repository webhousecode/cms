"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

interface OrgEntry {
  id: string;
  name: string;
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

export default function OrgSettingsPage() {
  const router = useRouter();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [activeOrgId, setActiveOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("agency");
  const [orgPlan, setOrgPlan] = useState("free");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const activeOrg = registry?.orgs.find((o) => o.id === activeOrgId);

  async function handleSave() {
    if (!registry || !activeOrg) return;
    setSaving(true);
    // Update org name in registry
    const updated = {
      ...registry,
      orgs: registry.orgs.map((o) =>
        o.id === activeOrgId ? { ...o, name: orgName.trim() || o.name } : o
      ),
    };
    await fetch("/api/cms/registry", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setRegistry(updated);
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

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-2">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Organization Settings</p>
        <h1 className="text-2xl font-bold text-foreground">Organization Settings</h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
          General configuration, privacy, and lifecycle controls
        </p>
      </div>

      {/* Organization details */}
      <div style={{ marginTop: "2rem" }}>
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
    </div>
  );
}
