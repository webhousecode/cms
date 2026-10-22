"use client";

import { Fragment, useState } from "react";
import { Globe, ArrowRight, Check, AlertTriangle, Loader2, FolderOpen, FileText, Image } from "lucide-react";
import { useT } from "@/lib/i18n-context";

interface WpProbeResult {
  url: string;
  restApiAvailable: boolean;
  restApiUrl: string;
  wordpressVersion?: string;
  theme: { name: string; slug: string };
  pageBuilder: string;
  contentCounts: {
    posts: number;
    pages: number;
    media: number;
    categories: number;
    tags: number;
    customPostTypes: Array<{ slug: string; name: string; count: number }>;
  };
  siteTitle?: string;
  siteDescription?: string;
  language?: string;
}

interface MigrationResult {
  siteId: string;
  siteName: string;
  collections: Array<{ name: string; label: string; count: number }>;
  documentsImported: number;
  mediaDownloaded: number;
  redirectMap: Array<{ from: string; to: string }>;
}

type Step = "url" | "review" | "migrating" | "done";

/** Renders a translated sentence whose {placeholders} are React nodes (e.g. <strong>). */
function fillNodes(template: string, nodes: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
}

export function WpMigrationPanel({ orgId, onComplete }: { orgId: string; onComplete?: (siteId: string) => void }) {
  const t = useT();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<WpProbeResult | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleProbe() {
    if (!url.trim()) return;
    setProbing(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/wp-migrate/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setProbe(data);
      setSiteName(data.siteTitle || new URL(data.url).hostname);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("integrations.wpMigration.probeFailed"));
    } finally {
      setProbing(false);
    }
  }

  async function handleMigrate() {
    if (!probe) return;
    setMigrating(true);
    setError(null);
    setStep("migrating");

    try {
      const res = await fetch("/api/admin/wp-migrate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probeResult: probe, orgId, siteName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setResult(data);
      setStep("done");
      window.dispatchEvent(new Event("cms:content-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("integrations.wpMigration.migrationFailed"));
      setStep("review");
    } finally {
      setMigrating(false);
    }
  }

  const totalContent = probe
    ? probe.contentCounts.posts + probe.contentCounts.pages +
      probe.contentCounts.customPostTypes.reduce((s, c) => s + c.count, 0)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {error && (
        <div style={{
          padding: "0.5rem 0.75rem", borderRadius: 6,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
          fontSize: "0.78rem", color: "#ef4444",
        }}>
          {error}
        </div>
      )}

      {/* ── Step 1: URL ── */}
      {step === "url" && (
        <div style={{
          padding: "1.25rem", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Globe style={{ width: 18, height: 18, color: "var(--brand)" }} />
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{t("integrations.wpMigration.urlHeading")}</h3>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
            {t("integrations.wpMigration.urlIntro")}
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="url"
              data-testid="wp-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => e.key === "Enter" && handleProbe()}
              style={{
                flex: 1, padding: "0.45rem 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--background)",
                fontSize: "0.82rem", color: "var(--foreground)",
                outline: "none",
              }}
            />
            <button
              type="button"
              data-testid="wp-probe-button"
              onClick={handleProbe}
              disabled={probing || !url.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0.45rem 1rem", borderRadius: 6, border: "none",
                background: "var(--brand)", color: "var(--brand-foreground)",
                fontSize: "0.8rem", fontWeight: 600,
                cursor: probing ? "wait" : "pointer",
                opacity: probing ? 0.7 : 1,
              }}
            >
              {probing ? (
                <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> {t("integrations.wpMigration.probing")}</>
              ) : (
                <>{t("integrations.wpMigration.probe")} <ArrowRight style={{ width: 14, height: 14 }} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Review ── */}
      {step === "review" && probe && (
        <div style={{
          padding: "1.25rem", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <Check style={{ width: 18, height: 18, color: "#22c55e" }} />
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>
              {probe.siteTitle || probe.url}
            </h3>
          </div>

          {/* Site info */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem",
            fontSize: "0.78rem", marginBottom: "1rem",
            padding: "0.75rem", borderRadius: 6, background: "var(--muted)",
          }}>
            <div>{t("integrations.wpMigration.theme")} <strong>{probe.theme.name}</strong></div>
            <div>{t("integrations.wpMigration.builder")} <strong>{probe.pageBuilder}</strong></div>
            <div>{t("integrations.wpMigration.wordpress")} <strong>{probe.wordpressVersion ?? t("integrations.wpMigration.unknown")}</strong></div>
            <div>{t("integrations.wpMigration.restApi")} <strong style={{ color: probe.restApiAvailable ? "#22c55e" : "#ef4444" }}>
              {probe.restApiAvailable ? t("integrations.wpMigration.available") : t("integrations.wpMigration.notAvailable")}
            </strong></div>
            {probe.language && <div>{t("integrations.wpMigration.language")} <strong>{probe.language}</strong></div>}
          </div>

          {/* Content inventory */}
          <div style={{ fontSize: "0.78rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>{t("integrations.wpMigration.contentItems", { total: totalContent })}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {probe.contentCounts.posts > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FileText style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {t("integrations.wpMigration.postsTo", { n: probe.contentCounts.posts })} <code style={codeStyle}>posts</code>
                </div>
              )}
              {probe.contentCounts.pages > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FolderOpen style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {t("integrations.wpMigration.pagesTo", { n: probe.contentCounts.pages })} <code style={codeStyle}>pages</code>
                </div>
              )}
              {probe.contentCounts.customPostTypes.map((cpt) => (
                <div key={cpt.slug} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FileText style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {cpt.count} {cpt.name} → <code style={codeStyle}>{cpt.slug}</code>
                </div>
              ))}
              {probe.contentCounts.media > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Image style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {t("integrations.wpMigration.mediaFiles", { n: probe.contentCounts.media })}
                </div>
              )}
            </div>
          </div>

          {/* Site name */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
              {t("integrations.wpMigration.siteName")}
            </label>
            <input
              type="text"
              data-testid="wp-sitename-input"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              style={{
                width: "100%", padding: "0.4rem 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--background)",
                fontSize: "0.82rem", color: "var(--foreground)", outline: "none",
              }}
            />
          </div>

          {!probe.restApiAvailable && (
            <div style={{
              padding: "0.5rem 0.75rem", borderRadius: 6, marginBottom: "1rem",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              fontSize: "0.78rem", color: "#ef4444",
            }}>
              <AlertTriangle style={{ width: 14, height: 14, display: "inline", verticalAlign: "text-bottom", marginRight: 4 }} />
              {t("integrations.wpMigration.restApiMissing")}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button type="button" data-testid="wp-back-button" onClick={() => setStep("url")} style={btnSecondary}>
              ← {t("integrations.wpMigration.back")}
            </button>
            <button
              type="button"
              data-testid="wp-migrate-button"
              onClick={handleMigrate}
              disabled={!probe.restApiAvailable || !siteName.trim()}
              style={{
                ...btnPrimary,
                opacity: !probe.restApiAvailable || !siteName.trim() ? 0.5 : 1,
                cursor: !probe.restApiAvailable || !siteName.trim() ? "not-allowed" : "pointer",
              }}
            >
              {t("integrations.wpMigration.migrateItems", { total: totalContent })} <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Migrating ── */}
      {step === "migrating" && (
        <div style={{
          padding: "2rem", borderRadius: 8, textAlign: "center",
          border: "1px solid var(--border)", background: "var(--card)",
        }}>
          <Loader2 style={{ width: 32, height: 32, margin: "0 auto 1rem", color: "var(--brand)", animation: "spin 1s linear infinite" }} />
          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{t("integrations.wpMigration.migratingSite", { name: probe?.siteTitle ?? t("integrations.wpMigration.siteFallback") })}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
            {t("integrations.wpMigration.migratingInfo")}
          </div>
        </div>
      )}

      {/* ── Step 4: Done ── */}
      {step === "done" && result && (
        <div style={{
          padding: "1.25rem", borderRadius: 8,
          border: "1px solid rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Check style={{ width: 20, height: 20, color: "#22c55e" }} />
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
              {t("integrations.wpMigration.complete")}
            </h3>
          </div>

          <div style={{ fontSize: "0.82rem", marginBottom: "1rem", lineHeight: 1.6 }}>
            {fillNodes(t("integrations.wpMigration.summary"), {
              name: <strong>"{result.siteName}"</strong>,
              docs: <strong>{result.documentsImported}</strong>,
              media: <strong>{result.mediaDownloaded}</strong>,
              collections: <strong>{result.collections.length}</strong>,
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.78rem", marginBottom: "1rem" }}>
            {result.collections.map((col) => (
              <div key={col.name}>
                <code style={codeStyle}>{col.name}</code> — {t("integrations.wpMigration.collectionDocs", { n: col.count, label: col.label })}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              data-testid="wp-open-site-button"
              onClick={() => {
                if (onComplete) {
                  onComplete(result.siteId);
                } else {
                  document.cookie = `cms-active-site=${result.siteId};path=/;max-age=31536000`;
                  window.location.href = "/admin";
                }
              }}
              style={btnPrimary}
            >
              {t("integrations.wpMigration.openSite")}
            </button>
            <button type="button" data-testid="wp-another-button" onClick={() => { setStep("url"); setProbe(null); setResult(null); setUrl(""); }} style={btnSecondary}>
              {t("integrations.wpMigration.migrateAnother")}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  fontSize: "0.72rem", padding: "1px 5px", borderRadius: 3,
  background: "var(--muted)", fontFamily: "monospace",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  padding: "0.45rem 1rem", borderRadius: 6, border: "none",
  background: "var(--brand)", color: "var(--brand-foreground)", fontSize: "0.8rem",
  fontWeight: 600, cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  padding: "0.45rem 1rem", borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
};
