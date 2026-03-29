"use client";

import { useState, useEffect, useCallback } from "react";
import { Eye, RefreshCw, FileText, Globe, Bot, Rss, Shield, ExternalLink } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

// ── Types ────────────────────────────────────────────────────

interface SeoDocSummary {
  collection: string;
  collectionLabel: string;
  slug: string;
  title: string;
  status: string;
  locale?: string;
  score: number;
  geoScore: number;
  hasTitle: boolean;
  hasDesc: boolean;
  hasOgImage: boolean;
  hasKeywords: boolean;
  optimized: boolean;
}

interface OverviewData {
  total: number;
  optimized: number;
  avgScore: number;
  avgGeoScore: number;
  issues: { missingTitle: number; missingDesc: number; missingOg: number };
  documents: SeoDocSummary[];
}

interface BuildHealth {
  robotsTxt: boolean;
  sitemapXml: boolean;
  llmsTxt: boolean;
  llmsFullTxt: boolean;
  feedXml: boolean;
  aiPlugin: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#F7BB2E";
  return "#f87171";
}

const lbl: React.CSSProperties = {
  fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem",
};

// ── Component ────────────────────────────────────────────────

export default function VisibilityPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [health, setHealth] = useState<BuildHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "build">("overview");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seo");
      if (res.ok) {
        const d = await res.json() as OverviewData;
        setData(d);
      }
      // Check build health via site config
      const configRes = await fetch("/api/admin/site-config");
      if (configRes.ok) {
        const cfg = await configRes.json();
        const deployUrl = cfg.deployProductionUrl || cfg.previewSiteUrl;
        if (deployUrl) {
          // Try to check build outputs
          const checks = await Promise.allSettled([
            fetch(`${deployUrl}/robots.txt`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
            fetch(`${deployUrl}/sitemap.xml`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
            fetch(`${deployUrl}/llms.txt`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
            fetch(`${deployUrl}/llms-full.txt`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
            fetch(`${deployUrl}/feed.xml`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
            fetch(`${deployUrl}/.well-known/ai-plugin.json`, { mode: "no-cors" }).then((r) => r.ok || r.type === "opaque"),
          ]);
          setHealth({
            robotsTxt: checks[0].status === "fulfilled" && checks[0].value === true,
            sitemapXml: checks[1].status === "fulfilled" && checks[1].value === true,
            llmsTxt: checks[2].status === "fulfilled" && checks[2].value === true,
            llmsFullTxt: checks[3].status === "fulfilled" && checks[3].value === true,
            feedXml: checks[4].status === "fulfilled" && checks[4].value === true,
            aiPlugin: checks[5].status === "fulfilled" && checks[5].value === true,
          });
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const combinedScore = data ? Math.round((data.avgScore * 0.5) + (data.avgGeoScore * 0.5)) : 0;

  return (
    <>
      <ActionBar
        actions={
          <ActionButton onClick={fetchData} disabled={loading}>
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? "spin 1s linear infinite" : undefined }} />
            Refresh
          </ActionButton>
        }
      >
        <ActionBarBreadcrumb items={["Tools", "Visibility"]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "72rem" }}>
        {loading && !data ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Loading…</div>
        ) : !data ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Failed to load data</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
              {/* Visibility Score */}
              <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <p style={lbl}>Visibility Score</p>
                <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: scoreColor(combinedScore), margin: 0 }}>
                  {combinedScore}
                </p>
                <div style={{ height: 4, borderRadius: 2, background: "var(--border)", marginTop: "0.5rem" }}>
                  <div style={{ height: "100%", width: `${combinedScore}%`, background: scoreColor(combinedScore), borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                  Combined SEO + GEO
                </p>
              </div>

              {/* SEO Score */}
              <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <p style={lbl}>SEO Score</p>
                <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: scoreColor(data.avgScore), margin: 0 }}>
                  {data.avgScore}
                </p>
                <div style={{ height: 4, borderRadius: 2, background: "var(--border)", marginTop: "0.5rem" }}>
                  <div style={{ height: "100%", width: `${data.avgScore}%`, background: scoreColor(data.avgScore), borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                  Search engines
                </p>
              </div>

              {/* GEO Score */}
              <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <p style={lbl}>GEO Score</p>
                <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: scoreColor(data.avgGeoScore), margin: 0 }}>
                  {data.avgGeoScore}
                </p>
                <div style={{ height: 4, borderRadius: 2, background: "var(--border)", marginTop: "0.5rem" }}>
                  <div style={{ height: "100%", width: `${data.avgGeoScore}%`, background: scoreColor(data.avgGeoScore), borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                  AI platforms
                </p>
              </div>

              {/* Documents */}
              <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <p style={lbl}>Documents</p>
                <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: "var(--foreground)", margin: 0 }}>
                  {data.total}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                  {data.optimized} optimized ({data.total > 0 ? Math.round((data.optimized / data.total) * 100) : 0}%)
                </p>
              </div>

              {/* Issues */}
              <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <p style={lbl}>Issues</p>
                <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: (data.issues.missingTitle + data.issues.missingDesc + data.issues.missingOg) > 0 ? "#f87171" : "#4ade80", margin: 0 }}>
                  {data.issues.missingTitle + data.issues.missingDesc + data.issues.missingOg}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                  Missing meta fields
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
              {(["overview", "documents", "build"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "0.5rem 1rem", border: "none", background: "none", cursor: "pointer",
                    fontSize: "0.8rem", fontWeight: activeTab === tab ? 600 : 400,
                    color: activeTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
                    borderBottom: activeTab === tab ? "2px solid #F7BB2E" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}
                >
                  {tab === "overview" ? "Overview" : tab === "documents" ? "Documents" : "Build Output"}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Issue Breakdown */}
                <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <p style={{ ...lbl, marginBottom: "0.75rem" }}>Issue Breakdown</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <IssueRow icon="🔴" label="Missing meta title" count={data.issues.missingTitle} total={data.total} />
                    <IssueRow icon="🔴" label="Missing meta description" count={data.issues.missingDesc} total={data.total} />
                    <IssueRow icon="🟡" label="Missing social image (OG)" count={data.issues.missingOg} total={data.total} />
                    <IssueRow icon="🟢" label="Fully optimized" count={data.optimized} total={data.total} />
                  </div>
                </div>

                {/* Score Distribution */}
                <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <p style={{ ...lbl, marginBottom: "0.75rem" }}>Score Distribution</p>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", height: 80 }}>
                    {[
                      { label: "0-29", docs: data.documents.filter((d) => d.score < 30) },
                      { label: "30-49", docs: data.documents.filter((d) => d.score >= 30 && d.score < 50) },
                      { label: "50-69", docs: data.documents.filter((d) => d.score >= 50 && d.score < 70) },
                      { label: "70-89", docs: data.documents.filter((d) => d.score >= 70 && d.score < 90) },
                      { label: "90-100", docs: data.documents.filter((d) => d.score >= 90) },
                    ].map((bucket) => {
                      const pct = data.total > 0 ? (bucket.docs.length / data.total) * 100 : 0;
                      return (
                        <div key={bucket.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                          <div style={{
                            width: "100%", height: Math.max(4, pct * 0.8), borderRadius: 3,
                            background: bucket.label === "0-29" ? "#f87171" : bucket.label === "30-49" ? "#F7BB2E" : bucket.label === "50-69" ? "#F7BB2E" : "#4ade80",
                            transition: "height 0.3s",
                          }} />
                          <span style={{ fontSize: "0.55rem", color: "var(--muted-foreground)" }}>{bucket.label}</span>
                          <span style={{ fontSize: "0.6rem", fontWeight: 600, fontFamily: "monospace", color: "var(--foreground)" }}>{bucket.docs.length}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === "documents" && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Document</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>SEO</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>GEO</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Title</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Desc</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>OG</th>
                      <th style={{ textAlign: "center", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Keywords</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((doc) => {
                      const combined = Math.round((doc.score * 0.5) + (doc.geoScore * 0.5));
                      return (
                        <tr key={`${doc.collection}/${doc.slug}`} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.625rem 0.75rem" }}>
                            <a href={`/admin/${doc.collection}/${doc.slug}`} style={{ color: "var(--foreground)", textDecoration: "none" }}>
                              <span style={{ fontWeight: 500 }}>{doc.title}</span>
                              <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginLeft: "0.5rem", fontFamily: "monospace" }}>
                                {doc.collectionLabel}
                              </span>
                              {doc.locale && (
                                <span style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "rgba(168,139,250,0.15)", color: "#a78bfa", marginLeft: "0.375rem", fontWeight: 600, textTransform: "uppercase" }}>
                                  {doc.locale}
                                </span>
                              )}
                            </a>
                          </td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 600, color: scoreColor(doc.score) }}>{doc.score}</span>
                          </td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 600, color: scoreColor(doc.geoScore) }}>{doc.geoScore}</span>
                          </td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>{doc.hasTitle ? "✅" : "❌"}</td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>{doc.hasDesc ? "✅" : "❌"}</td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>{doc.hasOgImage ? "✅" : "❌"}</td>
                          <td style={{ textAlign: "center", padding: "0.625rem 0.75rem" }}>{doc.hasKeywords ? "✅" : "❌"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Build Output Tab */}
            {activeTab === "build" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
                  Files generated by the build pipeline for search engines and AI platforms.
                </p>
                <BuildItem icon={<Shield style={{ width: 16, height: 16 }} />} name="robots.txt" desc="AI crawler access rules" status={health?.robotsTxt} />
                <BuildItem icon={<Globe style={{ width: 16, height: 16 }} />} name="sitemap.xml" desc="Search engine page index" status={health?.sitemapXml} />
                <BuildItem icon={<FileText style={{ width: 16, height: 16 }} />} name="llms.txt" desc="AI agent discovery index" status={health?.llmsTxt} />
                <BuildItem icon={<FileText style={{ width: 16, height: 16 }} />} name="llms-full.txt" desc="Full content for AI consumption" status={health?.llmsFullTxt} />
                <BuildItem icon={<Rss style={{ width: 16, height: 16 }} />} name="feed.xml" desc="RSS feed for syndication" status={health?.feedXml} />
                <BuildItem icon={<Bot style={{ width: 16, height: 16 }} />} name=".well-known/ai-plugin.json" desc="MCP plugin manifest" status={health?.aiPlugin} />

                <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                  <p style={{ ...lbl, marginBottom: "0.5rem" }}>Per-Page Markdown Endpoints</p>
                  <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                    Every page has a <code style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--secondary)" }}>.md</code> version at the same URL path.
                    AI platforms can fetch clean markdown instead of parsing HTML.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────

function IssueRow({ icon, label, count, total }: { icon: string; label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ fontSize: "0.75rem" }}>{icon}</span>
      <span style={{ fontSize: "0.75rem", flex: 1 }}>{label}</span>
      <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)" }}>{count}</span>
      <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: icon === "🟢" ? "#4ade80" : icon === "🟡" ? "#F7BB2E" : "#f87171" }} />
      </div>
      <span style={{ fontSize: "0.6rem", fontFamily: "monospace", color: "var(--muted-foreground)", width: "2rem", textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function BuildItem({ icon, name, desc, status }: { icon: React.ReactNode; name: string; desc: string; status?: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      padding: "0.75rem 1rem", background: "var(--card)",
      border: "1px solid var(--border)", borderRadius: "8px",
    }}>
      <span style={{ color: "var(--muted-foreground)" }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 500, fontFamily: "monospace" }}>{name}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginLeft: "0.75rem" }}>{desc}</span>
      </div>
      {status === undefined ? (
        <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>—</span>
      ) : status ? (
        <span style={{ fontSize: "0.65rem", color: "#4ade80", fontWeight: 600 }}>✓ Live</span>
      ) : (
        <span style={{ fontSize: "0.65rem", color: "#f87171", fontWeight: 600 }}>✗ Not found</span>
      )}
    </div>
  );
}
