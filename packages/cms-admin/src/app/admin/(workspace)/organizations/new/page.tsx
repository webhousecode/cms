"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("agency");
  const [plan, setPlan] = useState("free");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function orgId(): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-org";
  }

  async function handleCreate() {
    setError("");
    if (!name.trim()) { setError("Organization name is required"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/cms/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-org", orgName: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed (${res.status})`);
      }
      const { org } = await res.json() as { org: { id: string } };
      setCookie("cms-active-org", org.id);
      document.cookie = "cms-active-site=;path=/;max-age=0";
      window.dispatchEvent(new CustomEvent("cms-registry-change"));
      router.push("/admin/sites/new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.6rem 0.75rem", borderRadius: "6px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
  };

  return (
    <div className="p-8" style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
      <div style={{
        width: "100%", maxWidth: "560px",
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "12px", padding: "2rem 2.5rem",
      }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.35rem" }}>
          Create a new organization
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "2rem", lineHeight: 1.5 }}>
          Organizations are a way to group your sites. Each organization can be configured with different team members and settings.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="Organization name"
              autoFocus
              style={inputStyle}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              What&rsquo;s the name of your company or team? You can change this later.
            </p>
            {name && (
              <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.15rem", fontFamily: "monospace" }}>
                ID: {orgId()}
              </p>
            )}
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Type</label>
            <CustomSelect
              options={[
                { value: "agency", label: "Agency" },
                { value: "company", label: "Company" },
                { value: "personal", label: "Personal" },
                { value: "freelancer", label: "Freelancer" },
                { value: "nonprofit", label: "Non-profit" },
              ]}
              value={type}
              onChange={(v) => setType(v)}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              What best describes your organization?
            </p>
          </div>

          {/* Plan */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Plan</label>
            <CustomSelect
              options={[
                { value: "free", label: "Free — $0/month" },
                { value: "pro", label: "Pro — $25/month" },
                { value: "team", label: "Team — $599/month" },
              ]}
              value={plan}
              onChange={(v) => setPlan(v)}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              Which plan fits your organization&rsquo;s needs best?
            </p>
          </div>

          {/* Error */}
          {error && (
            <p style={{
              margin: 0, fontSize: "0.8rem", color: "var(--destructive)",
              padding: "0.5rem 0.75rem", borderRadius: "6px",
              background: "color-mix(in srgb, var(--destructive) 10%, transparent)",
            }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => router.push("/admin/organizations")}
              style={{
                padding: "0.5rem 1rem", borderRadius: "8px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              style={{
                padding: "0.5rem 1.5rem", borderRadius: "8px", border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontSize: "0.85rem", fontWeight: 600,
                cursor: creating ? "wait" : "pointer",
                opacity: creating || !name.trim() ? 0.5 : 1,
              }}
            >
              {creating ? "Creating..." : "Create organization"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
