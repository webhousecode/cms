"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomSelect } from "@/components/ui/custom-select";
import { switchToNewOrg } from "@/lib/switch-context";
import { useT } from "@/lib/i18n-context";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export default function NewOrganizationPage() {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("personal");
  const [plan, setPlan] = useState("free");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function orgId(): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "new-org";
  }

  async function handleCreate() {
    setError("");
    if (!name.trim()) { setError(t("pages.orgNew.errNameRequired")); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/cms/registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-org", orgName: name.trim(), orgType: type, orgPlan: plan }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? t("pages.orgNew.errFailedStatus", { status: res.status }));
      }
      const { org } = await res.json() as { org: { id: string } };
      switchToNewOrg(org.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pages.orgNew.errCreate"));
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
    <div className="p-8" style={{ paddingTop: "1rem" }}>
      <div style={{
        width: "100%", maxWidth: "560px",
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "12px", padding: "2rem 2.5rem",
      }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.35rem" }}>
          {t("pages.orgNew.title")}
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginBottom: "2rem", lineHeight: 1.5 }}>
          {t("pages.orgNew.intro")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>{t("pages.orgNew.nameLabel")}</label>
            <input
              data-testid="org-new-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder={t("pages.orgNew.namePlaceholder")}
              autoFocus
              style={inputStyle}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              {t("pages.orgNew.nameHint")}
            </p>
            {name && (
              <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.15rem", fontFamily: "monospace" }}>
                {t("pages.orgNew.idLine", { id: orgId() })}
              </p>
            )}
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>{t("pages.orgNew.typeLabel")}</label>
            <CustomSelect
              options={[
                { value: "agency", label: t("pages.orgNew.typeAgency") },
                { value: "company", label: t("pages.orgNew.typeCompany") },
                { value: "personal", label: t("pages.orgNew.typePersonal") },
                { value: "freelancer", label: t("pages.orgNew.typeFreelancer") },
                { value: "nonprofit", label: t("pages.orgNew.typeNonprofit") },
              ]}
              value={type}
              onChange={(v) => setType(v)}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              {t("pages.orgNew.typeHint")}
            </p>
          </div>

          {/* Plan */}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>{t("pages.orgNew.planLabel")}</label>
            <CustomSelect
              options={[
                { value: "free", label: t("pages.orgNew.planFree") },
                { value: "pro", label: t("pages.orgNew.planPro") },
                { value: "team", label: t("pages.orgNew.planTeam") },
              ]}
              value={plan}
              onChange={(v) => setPlan(v)}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.35rem" }}>
              {t("pages.orgNew.planHint")}
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
              data-testid="org-new-cancel-button"
              type="button"
              onClick={() => router.push("/admin/organizations")}
              style={{
                padding: "0.5rem 1rem", borderRadius: "8px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer",
              }}
            >
              {t("pages.orgNew.cancel")}
            </button>
            <button
              data-testid="org-new-submit-button"
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
              {creating ? t("pages.orgNew.creating") : t("pages.orgNew.create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
