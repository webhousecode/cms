"use client";

import { useState, useEffect, useCallback } from "react";
import { Gauge, RefreshCw, Monitor, Smartphone, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Sparkles, Check, Wrench, Download } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { TabTitle } from "@/lib/tabs-context";
import { scoreColor, SCORE_COLOR_MAP, type LighthouseResult, type ScoreHistoryEntry } from "@/lib/lighthouse/types";

export default function LighthousePage() {
  const [mobile, setMobile] = useState<LighthouseResult | null>(null);
  const [desktop, setDesktop] = useState<LighthouseResult | null>(null);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ fixes: Array<{ id: string; title: string; status: "fixed" | "manual"; description: string }>; fixedCount: number; manualCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Latest now returns BOTH strategies with full payloads (opportunities,
    // diagnostics, CWV) so the Export-report has complete data for both.
    fetch("/api/admin/lighthouse/latest").then((r) => r.json()).then((d) => {
      if (d?.mobile) setMobile(d.mobile);
      if (d?.desktop) setDesktop(d.desktop);
    }).catch(() => {});
    fetch("/api/admin/lighthouse/history").then((r) => r.json()).then((h) => {
      setHistory(h);
      // Score-only fallback if /latest returned nothing for one strategy.
      // History rows don't carry opportunities/diagnostics, so this is
      // only enough to populate the small Score card — Export will note
      // the gap with "—" for the missing fields.
      const sorted = [...h].reverse();
      const lastMobile = sorted.find((e: ScoreHistoryEntry) => e.strategy === "mobile");
      const lastDesktop = sorted.find((e: ScoreHistoryEntry) => e.strategy === "desktop");
      if (lastMobile) setMobile((prev) => prev ?? { scores: lastMobile.scores, strategy: "mobile" } as any);
      if (lastDesktop) setDesktop((prev) => prev ?? { scores: lastDesktop.scores, strategy: "desktop" } as any);
    }).catch(() => {});
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lighthouse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMobile(data.mobile);
      setDesktop(data.desktop);
      const histRes = await fetch("/api/admin/lighthouse/history");
      setHistory(await histRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleOptimize = useCallback(async () => {
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const res = await fetch("/api/admin/lighthouse/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, desktop }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOptimizeResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimize failed");
    } finally {
      setOptimizing(false);
    }
  }, [mobile, desktop]);

  const hasResults = !!(mobile?.scores || desktop?.scores);
  const hasIssues = (mobile?.opportunities?.length ?? 0) + (mobile?.diagnostics?.length ?? 0) + (desktop?.opportunities?.length ?? 0) + (desktop?.diagnostics?.length ?? 0) > 0;

  const handleExport = useCallback(() => {
    const md = buildLighthouseReport(mobile, desktop, history);
    const url = mobile?.url || desktop?.url || "site";
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "site"; } })();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `lighthouse-${host}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }, [mobile, desktop, history]);

  return (
    <>
      <TabTitle value="Lighthouse" />
      <ActionBar
        helpArticleId="lighthouse-intro"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasResults && (
            <button
              onClick={handleExport}
              title="Download a Markdown report ready to paste into Claude/ChatGPT or hand to a developer"
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              Export report
            </button>
          )}
          {hasIssues && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500,
                cursor: optimizing ? "wait" : "pointer",
                opacity: optimizing ? 0.7 : 1,
              }}
            >
              <Sparkles style={{ width: 13, height: 13, color: "#F7BB2E" }} />
              {optimizing ? "Optimizing..." : "Optimize"}
            </button>
          )}
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0 0.75rem", borderRadius: 6, border: "none",
              background: "#F7BB2E", color: "#0D0D0D",
              fontSize: "0.75rem", fontWeight: 600,
              cursor: scanning ? "wait" : "pointer",
              opacity: scanning ? 0.7 : 1,
            }}
          >
            <RefreshCw style={{ width: 13, height: 13, animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? "Scanning both..." : "Run Scan"}
          </button>
          </div>
        }
      >
        <ActionBarBreadcrumb items={["Lighthouse"]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "72rem" }}>
        {error && (
          <div style={{
            padding: "0.75rem 0.85rem", borderRadius: 6, marginBottom: "1.5rem",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            fontSize: "0.8rem", color: "#ef4444",
          }}>
            {error}
            {error.includes("quota") && <PsiKeySetup />}
          </div>
        )}

        {/* ── Side-by-side Score Cards ── */}
        {hasResults ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2rem" }}>
              <StrategyCard label="Mobile" icon={<Smartphone style={{ width: 15, height: 15 }} />} result={mobile} history={history} strategy="mobile" />
              <StrategyCard label="Desktop" icon={<Monitor style={{ width: 15, height: 15 }} />} result={desktop} history={history} strategy="desktop" />
            </div>

            {/* ── Optimize Results ── */}
            {optimizeResult && (
              <div style={{ marginBottom: "2rem", padding: "1rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <Sparkles style={{ width: 15, height: 15, color: "#F7BB2E" }} />
                  Optimization Report — {optimizeResult.fixedCount} fixed, {optimizeResult.manualCount} need manual attention
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {optimizeResult.fixes.map((fix) => (
                    <div key={fix.id} style={{
                      padding: "0.5rem 0.75rem", borderRadius: 6, fontSize: "0.78rem",
                      border: `1px solid ${fix.status === "fixed" ? "rgba(34,197,94,0.2)" : "rgba(250,180,50,0.2)"}`,
                      background: fix.status === "fixed" ? "rgba(34,197,94,0.04)" : "rgba(250,180,50,0.04)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.15rem" }}>
                        {fix.status === "fixed"
                          ? <Check style={{ width: 13, height: 13, color: "#22c55e" }} />
                          : <Wrench style={{ width: 13, height: 13, color: "#ffa400" }} />}
                        <span style={{ fontWeight: 600 }}>{fix.title}</span>
                        <span style={{
                          fontSize: "0.6rem", padding: "1px 5px", borderRadius: 3,
                          background: fix.status === "fixed" ? "rgba(34,197,94,0.15)" : "rgba(250,180,50,0.15)",
                          color: fix.status === "fixed" ? "#22c55e" : "#ffa400",
                          fontWeight: 600,
                        }}>
                          {fix.status === "fixed" ? "AUTO-FIXED" : "MANUAL"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                        {fix.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Combined Opportunities + Diagnostics ── */}
            <OpportunitiesSection mobile={mobile} desktop={desktop} />

            {/* ── Meta ── */}
            {mobile && (
              <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "2rem" }}>
                {mobile.url} · PageSpeed Insights · {mobile.timestamp ? new Date(mobile.timestamp).toLocaleString() : ""}
              </div>
            )}

            {/* ── Score History ── */}
            {history.length > 1 && <HistoryTable history={history} />}
          </>
        ) : !scanning ? (
          <div style={{
            padding: "3rem", textAlign: "center",
            border: "1px solid var(--border)", borderRadius: 10,
            background: "var(--card)",
          }}>
            <Gauge style={{ width: 32, height: 32, color: "var(--muted-foreground)", margin: "0 auto 0.75rem" }} />
            <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.25rem" }}>No scans yet</div>
            <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
              Run your first scan to see performance, accessibility, SEO, and best practices — for both mobile and desktop.
            </div>
            <button onClick={handleScan} disabled={scanning} style={{
              padding: "0.5rem 1.25rem", borderRadius: 6, border: "none",
              background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.82rem",
              fontWeight: 600, cursor: "pointer",
            }}>
              Run first scan
            </button>
          </div>
        ) : null}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  );
}

// ── Report builder (AI- and dev-readable Markdown) ──

function buildLighthouseReport(
  mobile: LighthouseResult | null,
  desktop: LighthouseResult | null,
  history: ScoreHistoryEntry[],
): string {
  const primary = mobile ?? desktop;
  const url = primary?.url ?? "(unknown)";
  const generatedAt = new Date().toISOString();
  const engine = primary?.engine ?? "psi";

  const lines: string[] = [];
  lines.push(`# Lighthouse report — ${url}`);
  lines.push("");
  lines.push(`- Generated: ${generatedAt}`);
  lines.push(`- Engine: ${engine === "psi" ? "PageSpeed Insights" : "Lighthouse (local)"}`);
  if (mobile?.timestamp) lines.push(`- Mobile scan: ${mobile.timestamp}`);
  if (desktop?.timestamp) lines.push(`- Desktop scan: ${desktop.timestamp}`);
  lines.push("");

  // ── How to use this report (prompt for AI) ──
  lines.push("## How to use this report");
  lines.push("");
  lines.push("Paste this file into Claude/ChatGPT/Cursor with a prompt like:");
  lines.push("");
  lines.push("> Below is the Lighthouse audit for my site. For each opportunity and diagnostic, propose a concrete code-level fix — file paths, exact changes, and the expected score impact. Prioritise items with the largest `savingsMs`/`savingsBytes` first. If you need code I haven't shown, ask.");
  lines.push("");

  // ── Scores ──
  lines.push("## Scores");
  lines.push("");
  lines.push("| Category | Mobile | Desktop |");
  lines.push("|---|---|---|");
  const fmt = (n?: number) => (n === undefined || n === null ? "—" : String(n));
  lines.push(`| Performance | ${fmt(mobile?.scores.performance)} | ${fmt(desktop?.scores.performance)} |`);
  lines.push(`| Accessibility | ${fmt(mobile?.scores.accessibility)} | ${fmt(desktop?.scores.accessibility)} |`);
  lines.push(`| Best practices | ${fmt(mobile?.scores.bestPractices)} | ${fmt(desktop?.scores.bestPractices)} |`);
  lines.push(`| SEO | ${fmt(mobile?.scores.seo)} | ${fmt(desktop?.scores.seo)} |`);
  lines.push("");
  lines.push("> Scoring (Google official): 90–100 green · 50–89 orange · 0–49 red.");
  lines.push("");

  // ── Core Web Vitals ──
  const cwvRow = (label: string, mob?: number, desk?: number, unit = "ms") => {
    const m = mob === undefined ? "—" : `${mob.toFixed(label === "CLS" ? 2 : 0)}${unit === "ms" ? " ms" : ""}`;
    const d = desk === undefined ? "—" : `${desk.toFixed(label === "CLS" ? 2 : 0)}${unit === "ms" ? " ms" : ""}`;
    return `| ${label} | ${m} | ${d} |`;
  };
  if (mobile?.coreWebVitals || desktop?.coreWebVitals) {
    lines.push("## Core Web Vitals (lab data)");
    lines.push("");
    lines.push("| Metric | Mobile | Desktop |");
    lines.push("|---|---|---|");
    lines.push(cwvRow("LCP", mobile?.coreWebVitals?.lcp, desktop?.coreWebVitals?.lcp));
    lines.push(cwvRow("CLS", mobile?.coreWebVitals?.cls, desktop?.coreWebVitals?.cls, ""));
    lines.push(cwvRow("INP", mobile?.coreWebVitals?.inp, desktop?.coreWebVitals?.inp));
    lines.push(cwvRow("FCP", mobile?.coreWebVitals?.fcp, desktop?.coreWebVitals?.fcp));
    lines.push(cwvRow("TTFB", mobile?.coreWebVitals?.ttfb, desktop?.coreWebVitals?.ttfb));
    lines.push("");
    lines.push("> Targets — LCP: <2500 ms · CLS: <0.10 · INP: <200 ms · FCP: <1800 ms · TTFB: <800 ms.");
    lines.push("");
  }

  // ── Field data (real-user CrUX) ──
  if (mobile?.fieldData || desktop?.fieldData) {
    lines.push("## Field data (real users, CrUX 28-day p75)");
    lines.push("");
    const fd = (f?: { p75: number; category: string }) => (f ? `${f.p75} (${f.category})` : "—");
    lines.push("| Metric | Mobile | Desktop |");
    lines.push("|---|---|---|");
    lines.push(`| LCP | ${fd(mobile?.fieldData?.lcp)} | ${fd(desktop?.fieldData?.lcp)} |`);
    lines.push(`| CLS | ${fd(mobile?.fieldData?.cls)} | ${fd(desktop?.fieldData?.cls)} |`);
    lines.push(`| INP | ${fd(mobile?.fieldData?.inp)} | ${fd(desktop?.fieldData?.inp)} |`);
    lines.push("");
  }

  // ── Opportunities ──
  const renderOppList = (label: string, result: LighthouseResult | null) => {
    if (!result?.opportunities?.length) return;
    const sorted = [...result.opportunities].sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));
    lines.push(`### ${label} — ${sorted.length} opportunit${sorted.length === 1 ? "y" : "ies"}`);
    lines.push("");
    for (const o of sorted) {
      const savings: string[] = [];
      if (o.savingsMs) savings.push(`${o.savingsMs} ms`);
      if (o.savingsBytes) savings.push(`${(o.savingsBytes / 1024).toFixed(0)} KB`);
      const head = savings.length > 0 ? ` — saves ${savings.join(", ")}` : "";
      lines.push(`- **${o.title}** \`${o.id}\`${head}`);
      if (o.description) lines.push(`  ${o.description.replace(/\n+/g, " ").trim()}`);
    }
    lines.push("");
  };
  if ((mobile?.opportunities?.length ?? 0) + (desktop?.opportunities?.length ?? 0) > 0) {
    lines.push("## Opportunities (impact-ordered)");
    lines.push("");
    renderOppList("Mobile", mobile);
    renderOppList("Desktop", desktop);
  }

  // ── Diagnostics ──
  const renderDiagList = (label: string, result: LighthouseResult | null) => {
    if (!result?.diagnostics?.length) return;
    lines.push(`### ${label} — ${result.diagnostics.length} diagnostic${result.diagnostics.length === 1 ? "" : "s"}`);
    lines.push("");
    for (const d of result.diagnostics) {
      const value = d.displayValue ? ` — \`${d.displayValue}\`` : "";
      lines.push(`- **${d.title}** \`${d.id}\`${value}`);
      if (d.description) lines.push(`  ${d.description.replace(/\n+/g, " ").trim()}`);
    }
    lines.push("");
  };
  if ((mobile?.diagnostics?.length ?? 0) + (desktop?.diagnostics?.length ?? 0) > 0) {
    lines.push("## Diagnostics");
    lines.push("");
    renderDiagList("Mobile", mobile);
    renderDiagList("Desktop", desktop);
  }

  // ── Trend ──
  if (history.length > 1) {
    const last5 = history.slice(-5);
    lines.push("## Recent trend");
    lines.push("");
    lines.push("| Date | Strategy | Perf | A11y | BP | SEO |");
    lines.push("|---|---|---|---|---|---|");
    for (const h of last5) {
      const date = new Date(h.timestamp).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`| ${date} | ${h.strategy} | ${h.scores.performance} | ${h.scores.accessibility} | ${h.scores.bestPractices} | ${h.scores.seo} |`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Report generated by @webhouse/cms-admin Lighthouse module.");
  lines.push("");
  return lines.join("\n");
}

// ── Strategy Card (Mobile or Desktop) ──

function StrategyCard({ label, icon, result, history, strategy }: {
  label: string;
  icon: React.ReactNode;
  result: LighthouseResult | null;
  history: ScoreHistoryEntry[];
  strategy: "mobile" | "desktop";
}) {
  if (!result?.scores) {
    return (
      <div style={{ padding: "1.5rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", opacity: 0.5, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "var(--muted-foreground)" }}>
          {icon} {label}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>No data yet</div>
      </div>
    );
  }

  const scores = result.scores;
  const prevEntry = [...history].reverse().find((e, i) => e.strategy === strategy && i > 0);
  const prevScores = prevEntry?.scores;

  return (
    <div style={{ padding: "1rem", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--muted-foreground)" }}>
        {icon} {label}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {(["performance", "accessibility", "seo", "bestPractices"] as const).map((key) => {
          const value = scores[key];
          const color = SCORE_COLOR_MAP[scoreColor(value)];
          const prev = prevScores?.[key];
          const diff = prev ? value - prev : 0;
          return (
            <div key={key} style={{ textAlign: "center" }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                border: `3px solid ${color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 0.3rem", fontSize: "1.1rem", fontWeight: 700, color,
              }}>
                {value}
              </div>
              <div style={{ fontSize: "0.65rem", fontWeight: 600 }}>
                {key === "bestPractices" ? "Best Pr." : key === "seo" ? "SEO" : key.charAt(0).toUpperCase() + key.slice(1)}
              </div>
              {diff !== 0 && (
                <div style={{ fontSize: "0.6rem", color: diff > 0 ? "#0cce6b" : "#ff4e42", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.1rem" }}>
                  {diff > 0 ? <TrendingUp style={{ width: 9, height: 9 }} /> : <TrendingDown style={{ width: 9, height: 9 }} />}
                  {diff > 0 ? "+" : ""}{diff}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CWV */}
      {result.coreWebVitals && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.72rem" }}>
          <CwvMetric label="LCP" value={`${(result.coreWebVitals.lcp / 1000).toFixed(1)}s`} threshold={[2500, 4000]} raw={result.coreWebVitals.lcp} />
          <CwvMetric label="CLS" value={result.coreWebVitals.cls.toFixed(3)} threshold={[0.1, 0.25]} raw={result.coreWebVitals.cls} />
          <CwvMetric label="FCP" value={`${(result.coreWebVitals.fcp / 1000).toFixed(1)}s`} threshold={[1800, 3000]} raw={result.coreWebVitals.fcp} />
          <CwvMetric label="TTFB" value={`${Math.round(result.coreWebVitals.ttfb)}ms`} threshold={[800, 1800]} raw={result.coreWebVitals.ttfb} />
        </div>
      )}
    </div>
  );
}

// ── Combined Opportunities + Diagnostics ──

function OpportunitiesSection({ mobile, desktop }: { mobile: LighthouseResult | null; desktop: LighthouseResult | null }) {
  const [expandOpps, setExpandOpps] = useState(true);
  const [expandDiag, setExpandDiag] = useState(false);

  // Merge and deduplicate opportunities from both
  const allOpps = new Map<string, { title: string; savingsMs?: number; score: number | null; source: string }>();
  for (const r of [mobile, desktop]) {
    if (!r?.opportunities) continue;
    const src = r.strategy;
    for (const opp of r.opportunities) {
      const existing = allOpps.get(opp.id);
      if (!existing || (opp.savingsMs ?? 0) > (existing.savingsMs ?? 0)) {
        allOpps.set(opp.id, { title: opp.title, savingsMs: opp.savingsMs, score: opp.score, source: src });
      }
    }
  }

  const allDiags = new Map<string, { title: string; displayValue?: string; description: string }>();
  for (const r of [mobile, desktop]) {
    if (!r?.diagnostics) continue;
    for (const d of r.diagnostics) {
      if (!allDiags.has(d.id)) allDiags.set(d.id, d);
    }
  }

  const opps = [...allOpps.values()];
  const diags = [...allDiags.values()];

  if (opps.length === 0 && diags.length === 0) return null;

  return (
    <div style={{ marginBottom: "2rem" }}>
      {opps.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => setExpandOpps(!expandOpps)} style={{
            display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none",
            cursor: "pointer", color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600, padding: 0, marginBottom: "0.5rem",
          }}>
            {expandOpps ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            Opportunities ({opps.length})
          </button>
          {expandOpps && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {opps.map((opp, i) => (
                <div key={i} style={{
                  padding: "0.6rem 0.85rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--card)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: "0.78rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: opp.score !== null && opp.score < 0.5 ? "#ff4e42" : "#ffa400", flexShrink: 0 }} />
                    {opp.title}
                    <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", background: "var(--muted)", padding: "1px 4px", borderRadius: 3 }}>{opp.source}</span>
                  </div>
                  {opp.savingsMs && (
                    <span style={{ color: "var(--muted-foreground)", fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                      save {(opp.savingsMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {diags.length > 0 && (
        <div>
          <button onClick={() => setExpandDiag(!expandDiag)} style={{
            display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none",
            cursor: "pointer", color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600, padding: 0, marginBottom: "0.5rem",
          }}>
            {expandDiag ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            Diagnostics ({diags.length})
          </button>
          {expandDiag && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {diags.map((d, i) => (
                <div key={i} style={{
                  padding: "0.6rem 0.85rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--card)", fontSize: "0.78rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>{d.title}</span>
                    {d.displayValue && <span style={{ color: "var(--muted-foreground)", fontSize: "0.72rem" }}>{d.displayValue}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── History Table ──

function HistoryTable({ history }: { history: ScoreHistoryEntry[] }) {
  return (
    <div>
      <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>
        Score History ({history.length} scans)
      </div>
      <div style={{ padding: "0.75rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Strategy</th>
              <th style={thStyle}>Perf</th>
              <th style={thStyle}>Access</th>
              <th style={thStyle}>SEO</th>
              <th style={thStyle}>Best Pr.</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().slice(0, 30).map((entry, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={tdStyle}>{new Date(entry.timestamp).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                    {entry.strategy === "mobile" ? <Smartphone style={{ width: 10, height: 10 }} /> : <Monitor style={{ width: 10, height: 10 }} />}
                    {entry.strategy}
                  </span>
                </td>
                <td style={tdStyle}><ScoreBadge score={entry.scores.performance} /></td>
                <td style={tdStyle}><ScoreBadge score={entry.scores.accessibility} /></td>
                <td style={tdStyle}><ScoreBadge score={entry.scores.seo} /></td>
                <td style={tdStyle}><ScoreBadge score={entry.scores.bestPractices} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Small components ──

function ScoreBadge({ score }: { score: number }) {
  return <span style={{ color: SCORE_COLOR_MAP[scoreColor(score)], fontWeight: 600 }}>{score}</span>;
}

function CwvMetric({ label, value, threshold, raw }: { label: string; value: string; threshold: [number, number]; raw: number }) {
  const color = raw <= threshold[0] ? "#0cce6b" : raw <= threshold[1] ? "#ffa400" : "#ff4e42";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <span style={{ fontWeight: 600, color: "var(--muted-foreground)", minWidth: 28 }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function PsiKeySetup() {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!key.trim()) return;
    setSaving(true);
    await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ psiApiKey: key.trim() }),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: 6, background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: "0.78rem" }}>
      <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Set up your own PageSpeed Insights API key</div>
      <div style={{ color: "var(--muted-foreground)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
        Get a free key (25,000 scans/day):
      </div>
      <ol style={{ margin: "0 0 0.5rem 1.25rem", padding: 0, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
        <li><a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noopener" style={{ color: "#F7BB2E" }}>Enable PageSpeed Insights API</a></li>
        <li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style={{ color: "#F7BB2E" }}>Create API Key</a></li>
        <li>Paste below</li>
      </ol>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="AIzaSy..." style={{ flex: 1, padding: "0.35rem 0.6rem", borderRadius: 5, border: "1px solid var(--border)", background: "var(--background)", fontSize: "0.78rem", color: "var(--foreground)", outline: "none" }} />
        <button onClick={handleSave} disabled={saving || !key.trim() || saved} style={{ padding: "0.35rem 0.75rem", borderRadius: 5, border: "none", background: saved ? "#0cce6b" : "#F7BB2E", color: "#0D0D0D", fontSize: "0.75rem", fontWeight: 600, cursor: saving ? "wait" : "pointer", opacity: saving || !key.trim() ? 0.6 : 1 }}>
          {saved ? "Saved ✓" : "Save key"}
        </button>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.35rem 0.5rem", fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "0.3rem 0.5rem" };
