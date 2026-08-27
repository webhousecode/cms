"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { SectionHeading } from "@/components/ui/section-heading";
import { SettingsCard } from "./settings-card";
import { Loader2, Plus } from "lucide-react";

interface DerivedDomain { origin: string; source: string }
interface DomainsResponse {
  domains: string[];
  derived: DerivedDomain[];
  effective: string[];
  error?: string;
}

/**
 * The site's trusted domains (F157.13).
 *
 * The derived half is shown read-only and labelled with where it comes from,
 * because the question an operator actually has on a migration day is "what is
 * this site trusted on right now?" — and before this panel that could not be
 * read anywhere, only inferred from three unrelated settings.
 */
export function SiteDomainsPanel() {
  const [domains, setDomains] = useState<string[]>([]);
  const [derived, setDerived] = useState<DerivedDomain[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/site-domains");
      if (!res.ok) {
        throw new Error(res.status === 403
          ? "Du har ikke adgang til domæner"
          : `Kunne ikke hente domæner (${res.status})`);
      }
      const data = (await res.json()) as DomainsResponse;
      setDomains(data.domains ?? []);
      setDerived(data.derived ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente domæner");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Always writes the WHOLE list and adopts the server's answer, so what the
  // panel shows is what was stored — never what we hoped we stored.
  const save = useCallback(async (next: string[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/site-domains", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: next }),
      });
      const data = (await res.json()) as DomainsResponse;
      if (!res.ok) throw new Error(data.error || `Kunne ikke gemme (${res.status})`);
      setDomains(data.domains ?? []);
      setDerived(data.derived ?? []);
      setDraft("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setSaving(false);
    }
  }, []);

  const rowStyle: CSSProperties = {
    display: "flex", alignItems: "center", gap: "0.6rem",
    padding: "0.5rem 0.7rem", border: "1px solid var(--border)",
    borderRadius: "8px", background: "var(--background)", fontSize: "0.85rem",
  };
  const mono: CSSProperties = { flex: 1, fontFamily: "ui-monospace, Menlo, monospace" };
  const canAdd = !!draft.trim() && !saving;

  return (
    <div data-testid="site-domains-root">
      <SectionHeading>Domæner</SectionHeading>
      <SettingsCard>
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          Adresser sitet er betroet på. De afgør hvorfra der må redigeres live og sendes formularer.
        </p>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
            <Loader2 size={14} /> Henter domæner…
          </div>
        ) : (
          <>
            {derived.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                  Kommer automatisk fra andre indstillinger
                </span>
                {derived.map((d) => (
                  <div key={d.origin} data-testid={`site-domains-derived-${d.origin}`} style={{ ...rowStyle, opacity: 0.75 }}>
                    <span style={mono}>{d.origin}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>{d.source}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Tilføjet her</span>
              {domains.length === 0 && (
                <span data-testid="site-domains-empty" style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                  Ingen ekstra domæner endnu.
                </span>
              )}
              {domains.map((d) => (
                <div key={d} data-testid={`site-domains-row-${d}`} style={rowStyle}>
                  <span style={mono}>{d}</span>
                  {confirming === d ? (
                    <>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Fjern?</span>
                      <button
                        data-testid={`site-domains-remove-yes-${d}`}
                        onClick={() => { setConfirming(null); void save(domains.filter((x) => x !== d)); }}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                      >Yes</button>
                      <button
                        data-testid={`site-domains-remove-no-${d}`}
                        onClick={() => setConfirming(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                      >No</button>
                    </>
                  ) : (
                    <button
                      data-testid={`site-domains-remove-${d}`}
                      onClick={() => setConfirming(d)}
                      aria-label={`Fjern ${d}`}
                      style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                data-testid="site-domains-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) void save([...domains, draft]); }}
                placeholder="eksempel.dk"
                style={{ flex: 1, padding: "0.5rem 0.7rem", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--background)", color: "var(--foreground)", fontSize: "0.85rem" }}
              />
              <button
                data-testid="site-domains-add"
                disabled={!canAdd}
                onClick={() => void save([...domains, draft])}
                style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.5rem 0.85rem", borderRadius: "8px", border: "none",
                  background: canAdd ? "var(--primary)" : "var(--border)",
                  color: canAdd ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  cursor: canAdd ? "pointer" : "not-allowed",
                  fontSize: "0.8rem", fontWeight: 500,
                }}
              >
                {saving ? <Loader2 size={13} /> : <Plus size={13} />}
                {saving ? "Gemmer…" : "Tilføj"}
              </button>
            </div>

            {error && (
              <span data-testid="site-domains-error" style={{ fontSize: "0.78rem", color: "var(--destructive)" }}>{error}</span>
            )}
            {saved && !error && (
              <span data-testid="site-domains-saved" style={{ fontSize: "0.78rem", color: "var(--primary)" }}>Gemt ✓</span>
            )}
          </>
        )}
      </SettingsCard>
    </div>
  );
}
