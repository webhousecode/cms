"use client";

import { useState } from "react";
import { Globe, ArrowRight, Check, AlertTriangle, Loader2, FolderOpen, FileText, Image } from "lucide-react";

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

export function WpMigrationPanel({ orgId }: { orgId: string }) {
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
      setError(err instanceof Error ? err.message : "Probe failed");
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
      setError(err instanceof Error ? err.message : "Migration failed");
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
            <Globe style={{ width: 18, height: 18, color: "#F7BB2E" }} />
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>WordPress URL</h3>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1rem", lineHeight: 1.5 }}>
            Enter the URL of any WordPress site. We'll detect the REST API, theme, page builder, and inventory all content.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="url"
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
              onClick={handleProbe}
              disabled={probing || !url.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0.45rem 1rem", borderRadius: 6, border: "none",
                background: "#F7BB2E", color: "#0D0D0D",
                fontSize: "0.8rem", fontWeight: 600,
                cursor: probing ? "wait" : "pointer",
                opacity: probing ? 0.7 : 1,
              }}
            >
              {probing ? (
                <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Probing...</>
              ) : (
                <>Probe <ArrowRight style={{ width: 14, height: 14 }} /></>
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
            <div>Theme: <strong>{probe.theme.name}</strong></div>
            <div>Builder: <strong>{probe.pageBuilder}</strong></div>
            <div>WordPress: <strong>{probe.wordpressVersion ?? "Unknown"}</strong></div>
            <div>REST API: <strong style={{ color: probe.restApiAvailable ? "#22c55e" : "#ef4444" }}>
              {probe.restApiAvailable ? "Available" : "Not available"}
            </strong></div>
            {probe.language && <div>Language: <strong>{probe.language}</strong></div>}
          </div>

          {/* Content inventory */}
          <div style={{ fontSize: "0.78rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Content ({totalContent} items)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {probe.contentCounts.posts > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FileText style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {probe.contentCounts.posts} Posts → <code style={codeStyle}>posts</code>
                </div>
              )}
              {probe.contentCounts.pages > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <FolderOpen style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                  {probe.contentCounts.pages} Pages → <code style={codeStyle}>pages</code>
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
                  {probe.contentCounts.media} Media files
                </div>
              )}
            </div>
          </div>

          {/* Site name */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontSize: "0.72rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
              Site name
            </label>
            <input
              type="text"
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
              REST API is not available. Content cannot be extracted automatically.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => setStep("url")} style={btnSecondary}>
              ← Back
            </button>
            <button
              onClick={handleMigrate}
              disabled={!probe.restApiAvailable || !siteName.trim()}
              style={{
                ...btnPrimary,
                opacity: !probe.restApiAvailable || !siteName.trim() ? 0.5 : 1,
                cursor: !probe.restApiAvailable || !siteName.trim() ? "not-allowed" : "pointer",
              }}
            >
              Migrate {totalContent} items <ArrowRight style={{ width: 14, height: 14 }} />
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
          <Loader2 style={{ width: 32, height: 32, margin: "0 auto 1rem", color: "#F7BB2E", animation: "spin 1s linear infinite" }} />
          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Migrating {probe?.siteTitle ?? "site"}...</div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
            Extracting content, downloading media, creating collections...
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
              Migration complete
            </h3>
          </div>

          <div style={{ fontSize: "0.82rem", marginBottom: "1rem", lineHeight: 1.6 }}>
            Site <strong>"{result.siteName}"</strong> created with{" "}
            <strong>{result.documentsImported}</strong> documents and{" "}
            <strong>{result.mediaDownloaded}</strong> media files across{" "}
            <strong>{result.collections.length}</strong> collections.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.78rem", marginBottom: "1rem" }}>
            {result.collections.map((col) => (
              <div key={col.name}>
                <code style={codeStyle}>{col.name}</code> — {col.count} documents ({col.label})
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => {
                // Switch to the new site — set cookie and reload
                document.cookie = `cms-active-site=${result.siteId};path=/;max-age=31536000`;
                window.location.href = "/admin";
              }}
              style={btnPrimary}
            >
              Open site in CMS →
            </button>
            <button onClick={() => { setStep("url"); setProbe(null); setResult(null); setUrl(""); }} style={btnSecondary}>
              Migrate another
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
  background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.8rem",
  fontWeight: 600, cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
  padding: "0.45rem 1rem", borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
};
