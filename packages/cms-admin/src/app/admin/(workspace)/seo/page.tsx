"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle2, Plus, X, Download, Tag } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { toast } from "sonner";
import type { SeoDocSummary } from "@/app/api/admin/seo/route";
import type { KeywordAnalysis } from "@/lib/seo/keywords";

interface SeoOverview {
  total: number;
  optimized: number;
  avgScore: number;
  issues: { missingTitle: number; missingDesc: number; missingOg: number };
  documents: SeoDocSummary[];
}

function scoreColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 50) return "#F7BB2E";
  return "#f87171";
}

function densityColor(density: number): string {
  if (density >= 1 && density <= 3) return "#4ade80";
  if (density > 3) return "#f87171";
  return "#F7BB2E";
}

export default function SeoPage() {
  const [data, setData] = useState<SeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState({ done: 0, total: 0 });

  // Sub-tab state
  const [activeTab, setActiveTab] = useState<"documents" | "keywords">("documents");

  // Keyword tracker state
  const [keywordData, setKeywordData] = useState<{ analyses: KeywordAnalysis[] } | null>(null);
  const [keywordLoading, setKeywordLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState("");
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadKeywords();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seo");
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadKeywords() {
    setKeywordLoading(true);
    try {
      const res = await fetch("/api/admin/seo/keywords");
      setKeywordData(await res.json());
    } catch { /* ignore */ }
    setKeywordLoading(false);
  }

  async function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    setAddingKeyword(true);
    try {
      const res = await fetch("/api/admin/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", keyword: newKeyword.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Failed to add keyword");
      } else {
        setNewKeyword("");
        loadKeywords();
      }
    } catch {
      toast.error("Failed to add keyword");
    }
    setAddingKeyword(false);
  }

  async function handleRemoveKeyword(keyword: string) {
    try {
      await fetch("/api/admin/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", keyword }),
      });
      setConfirmRemove(null);
      loadKeywords();
    } catch {
      toast.error("Failed to remove keyword");
    }
  }

  async function handleExport(format: "csv" | "json") {
    try {
      const res = await fetch(`/api/admin/seo/export?format=${format}`);
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded seo-report.${format}`);
    } catch {
      toast.error("Export failed");
    }
  }

  async function optimizeAll() {
    setOptimizing(true);
    setOptimizeProgress({ done: 0, total: 0 });
    try {
      const res = await fetch("/api/admin/seo/optimize-bulk", { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "start") setOptimizeProgress({ done: 0, total: event.total });
            else if (event.type === "result") {
              setOptimizeProgress((p) => ({ ...p, done: event.done }));
            } else if (event.type === "error") {
              setOptimizeProgress((p) => ({ ...p, done: event.done }));
            } else if (event.type === "done") {
              toast.success(`Optimized ${event.done} documents`);
            }
          } catch { /* skip bad lines */ }
        }
      }
    } catch {
      toast.error("Bulk optimize failed");
    }
    setOptimizing(false);
    loadData();
    loadKeywords();
  }

  async function optimizeSingle(collection: string, slug: string) {
    const toastId = toast.loading(`Optimizing ${slug}...`);
    try {
      const res = await fetch("/api/admin/seo/optimize-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: [`${collection}/${slug}`] }),
      });
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      }
      toast.success(`Optimized ${slug}`, { id: toastId });
      loadData();
    } catch {
      toast.error("Failed", { id: toastId });
    }
  }

  const lbl: React.CSSProperties = {
    fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem",
  };

  return (
    <>
      <TabTitle value="SEO" />
      <ActionBar actions={
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <ActionButton
            variant="ghost"
            onClick={() => handleExport("csv")}
            icon={<Download style={{ width: 14, height: 14 }} />}
          >
            Export CSV
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={optimizeAll}
            disabled={optimizing || !data || data.optimized === data.total}
            icon={optimizing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
          >
            {optimizing ? `Optimizing ${optimizeProgress.done}/${optimizeProgress.total}...` : `Optimize All (${data ? data.total - data.optimized : 0})`}
          </ActionButton>
        </div>
      }>
        <ActionBarBreadcrumb items={["Tools", "SEO"]} />
      </ActionBar>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Loading SEO data...</div>
      ) : !data ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Failed to load SEO data</div>
      ) : (
        <div style={{ padding: "1.25rem" }}>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <p style={lbl}>Average Score</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", color: scoreColor(data.avgScore), margin: 0 }}>
                {data.avgScore}
              </p>
              <div style={{ height: 4, borderRadius: 2, background: "var(--border)", marginTop: "0.5rem" }}>
                <div style={{ height: "100%", width: `${data.avgScore}%`, background: scoreColor(data.avgScore), borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <p style={lbl}>Documents</p>
              <p style={{ fontSize: "2rem", fontWeight: 800, fontFamily: "monospace", margin: 0 }}>{data.total}</p>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.25rem 0 0" }}>
                {data.optimized} optimized
              </p>
            </div>
            <div style={{ padding: "1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <p style={lbl}>Issues</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.25rem" }}>
                {data.issues.missingTitle > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#f87171", margin: 0 }}>
                    {data.issues.missingTitle} missing meta title
                  </p>
                )}
                {data.issues.missingDesc > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#f87171", margin: 0 }}>
                    {data.issues.missingDesc} missing meta description
                  </p>
                )}
                {data.issues.missingOg > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#F7BB2E", margin: 0 }}>
                    {data.issues.missingOg} missing OG image
                  </p>
                )}
                {data.issues.missingTitle === 0 && data.issues.missingDesc === 0 && data.issues.missingOg === 0 && (
                  <p style={{ fontSize: "0.75rem", color: "#4ade80", margin: 0, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <CheckCircle2 style={{ width: 12, height: 12 }} /> All good
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sub-tabs: Documents | Keywords */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
            {(["documents", "keywords"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.5rem 1rem", border: "none", background: "none", cursor: "pointer",
                  fontSize: "0.8rem", fontWeight: activeTab === tab ? 600 : 400,
                  color: activeTab === tab ? "var(--foreground)" : "var(--muted-foreground)",
                  borderBottom: activeTab === tab ? "2px solid #F7BB2E" : "2px solid transparent",
                  marginBottom: "-1px",
                }}
              >
                {tab === "documents" ? `Documents (${data.total})` : `Keywords (${keywordData?.analyses?.length ?? 0})`}
              </button>
            ))}
          </div>

          {/* Keywords tab */}
          {activeTab === "keywords" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <form
                  onSubmit={(e) => { e.preventDefault(); handleAddKeyword(); }}
                  style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}
                >
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="Add keyword..."
                    style={{
                      padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: "4px",
                      border: "1px solid var(--border)", background: "var(--background)",
                      color: "var(--foreground)", width: 200, outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={addingKeyword || !newKeyword.trim()}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.2rem",
                      padding: "0.25rem 0.5rem", borderRadius: "4px", border: "none",
                      background: newKeyword.trim() ? "#F7BB2E" : "var(--border)",
                      color: newKeyword.trim() ? "#0D0D0D" : "var(--muted-foreground)",
                      cursor: newKeyword.trim() ? "pointer" : "default",
                      fontSize: "0.7rem", fontWeight: 600,
                    }}
                  >
                    <Plus style={{ width: 12, height: 12 }} /> Add
                  </button>
                </form>
              </div>

              {keywordLoading ? (
                <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>Loading keywords...</p>
              ) : !keywordData?.analyses?.length ? (
                <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", padding: "0.5rem 0" }}>
                  No tracked keywords yet. Add keywords above to track coverage across your content.
                </p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Keyword</th>
                      <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 80 }}>Type</th>
                      <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 60 }}>Docs</th>
                      <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 120 }}>Coverage</th>
                      <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywordData.analyses.map((kw) => (
                      <>
                        <tr
                          key={kw.keyword}
                          style={{ borderBottom: "1px solid var(--border)", cursor: kw.documents.length > 0 ? "pointer" : "default" }}
                          onClick={() => kw.documents.length > 0 && setExpandedKeyword(expandedKeyword === kw.keyword ? null : kw.keyword)}
                        >
                          <td style={{ padding: "0.625rem 0.75rem", fontWeight: 500 }}>
                            {kw.keyword}
                          </td>
                          <td style={{ textAlign: "center", padding: "0.5rem" }}>
                            <span style={{
                              fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "3px",
                              background: kw.target === "primary" ? "rgba(247,187,46,0.2)" : kw.target === "secondary" ? "rgba(74,222,128,0.15)" : "rgba(168,139,250,0.15)",
                              color: kw.target === "primary" ? "#F7BB2E" : kw.target === "secondary" ? "#4ade80" : "#a78bfa",
                              fontWeight: 600, textTransform: "uppercase",
                            }}>
                              {kw.target}
                            </span>
                          </td>
                          <td style={{ textAlign: "center", padding: "0.5rem", fontFamily: "monospace" }}>
                            {kw.documents.length}
                          </td>
                          <td style={{ textAlign: "center", padding: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", justifyContent: "center" }}>
                              <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                                <div style={{
                                  height: "100%", width: `${kw.coverage}%`, borderRadius: 3,
                                  background: kw.coverage >= 50 ? "#4ade80" : kw.coverage >= 20 ? "#F7BB2E" : "#f87171",
                                }} />
                              </div>
                              <span style={{ fontSize: "0.72rem", fontFamily: "monospace", fontWeight: 600, color: "var(--foreground)" }}>
                                {kw.coverage}%
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                            {confirmRemove === kw.keyword ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveKeyword(kw.keyword); }}
                                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                                >Yes</button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmRemove(null); }}
                                  style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                                >No</button>
                              </span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmRemove(kw.keyword); }}
                                style={{
                                  display: "inline-flex", alignItems: "center", padding: "0.2rem",
                                  borderRadius: "3px", border: "none", background: "transparent",
                                  color: "var(--muted-foreground)", cursor: "pointer",
                                }}
                              >
                                <X style={{ width: 12, height: 12 }} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedKeyword === kw.keyword && kw.documents.length > 0 && (
                          <tr key={`${kw.keyword}-detail`}>
                            <td colSpan={5} style={{ padding: "0 0.75rem 0.75rem", background: "var(--card)" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: "left", padding: "0.375rem 0.5rem", color: "var(--muted-foreground)", fontWeight: 500 }}>Document</th>
                                    <th style={{ textAlign: "center", padding: "0.375rem 0.25rem", color: "var(--muted-foreground)", fontWeight: 500, width: 50 }}>Title</th>
                                    <th style={{ textAlign: "center", padding: "0.375rem 0.25rem", color: "var(--muted-foreground)", fontWeight: 500, width: 50 }}>Desc</th>
                                    <th style={{ textAlign: "center", padding: "0.375rem 0.25rem", color: "var(--muted-foreground)", fontWeight: 500, width: 50 }}>Content</th>
                                    <th style={{ textAlign: "center", padding: "0.375rem 0.25rem", color: "var(--muted-foreground)", fontWeight: 500, width: 70 }}>Density</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {kw.documents.map((d) => (
                                    <tr key={`${d.collection}/${d.slug}`} style={{ borderTop: "1px solid var(--border)" }}>
                                      <td style={{ padding: "0.375rem 0.5rem" }}>
                                        <a href={`/admin/${d.collection}/${d.slug}`} style={{ color: "var(--foreground)", textDecoration: "none" }}>
                                          {d.title}
                                        </a>
                                      </td>
                                      <td style={{ textAlign: "center", padding: "0.375rem 0.25rem" }}>{d.inTitle ? "✅" : "❌"}</td>
                                      <td style={{ textAlign: "center", padding: "0.375rem 0.25rem" }}>{d.inDescription ? "✅" : "❌"}</td>
                                      <td style={{ textAlign: "center", padding: "0.375rem 0.25rem" }}>{d.inContent ? "✅" : "❌"}</td>
                                      <td style={{ textAlign: "center", padding: "0.375rem 0.25rem" }}>
                                        <span style={{ fontFamily: "monospace", fontWeight: 600, color: densityColor(d.density) }}>
                                          {d.density}%
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Documents tab */}
          {activeTab === "documents" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem" }}>Document</th>
                <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 60 }}>Score</th>
                <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 50 }}>Title</th>
                <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 50 }}>Desc</th>
                <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 50 }}>OG</th>
                <th style={{ textAlign: "center", padding: "0.5rem", color: "var(--muted-foreground)", fontWeight: 500, fontSize: "0.72rem", width: 80 }}>Keywords</th>
                <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.documents.map((doc) => (
                <tr key={`${doc.collection}/${doc.slug}`} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.625rem 0.75rem" }}>
                    <a
                      href={`/admin/${doc.collection}/${doc.slug}`}
                      style={{ color: "var(--foreground)", textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: (doc.publishAt && new Date(doc.publishAt) > new Date()) ? "#a78bfa"
                          : doc.status === "published" ? "#4ade80"
                          : doc.status === "draft" ? "#F7BB2E"
                          : "#a78bfa",
                      }} />
                      {doc.title}
                    </a>
                    <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace", paddingLeft: "1.25rem" }}>
                      {doc.collectionLabel} / {doc.slug}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", padding: "0.5rem" }}>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", color: scoreColor(doc.score) }}>
                      {doc.score}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", padding: "0.5rem" }}>{doc.hasTitle ? "✅" : "❌"}</td>
                  <td style={{ textAlign: "center", padding: "0.5rem" }}>{doc.hasDesc ? "✅" : "❌"}</td>
                  <td style={{ textAlign: "center", padding: "0.5rem" }}>{doc.hasOgImage ? "✅" : "❌"}</td>
                  <td style={{ textAlign: "center", padding: "0.5rem" }}>{doc.hasKeywords ? "✅" : "❌"}</td>
                  <td style={{ textAlign: "right", padding: "0.5rem 0.75rem" }}>
                    {!doc.optimized && (
                      <button
                        onClick={() => optimizeSingle(doc.collection, doc.slug)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "0.25rem",
                          padding: "0.25rem 0.5rem", borderRadius: "4px", border: "none",
                          background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer",
                          fontSize: "0.65rem", fontWeight: 600,
                        }}
                      >
                        <Sparkles style={{ width: 10, height: 10 }} /> Optimize
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}
    </>
  );
}
