"use client";

import { useState, useEffect } from "react";
import { Search, Sparkles, Loader2, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { toast } from "sonner";
import type { SeoDocSummary } from "@/app/api/admin/seo/route";

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

export default function SeoPage() {
  const [data, setData] = useState<SeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/seo");
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <TabTitle value="SEO" />
      <ActionBar actions={
        <ActionButton
          variant="primary"
          onClick={optimizeAll}
          disabled={optimizing || !data || data.optimized === data.total}
          icon={optimizing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
        >
          {optimizing ? `Optimizing ${optimizeProgress.done}/${optimizeProgress.total}...` : `Optimize All (${data ? data.total - data.optimized : 0})`}
        </ActionButton>
      }>
        <ActionBarBreadcrumb items={["Tools", "SEO"]} />
      </ActionBar>

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Loading SEO data...</div>
      ) : !data ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)" }}>Failed to load SEO data</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
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

          {/* Documents table */}
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
                        background: doc.status === "published" ? "#4ade80" : doc.status === "draft" ? "#F7BB2E" : "#a78bfa",
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
        </div>
      )}
    </div>
  );
}
