"use client";

import { useState, useEffect, useCallback } from "react";
import { Gauge, RefreshCw, Monitor, Smartphone, ChevronDown, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { TabTitle } from "@/lib/tabs-context";
import { scoreColor, SCORE_COLOR_MAP, type LighthouseResult, type ScoreHistoryEntry } from "@/lib/lighthouse/types";

export default function LighthousePage() {
  const [mobile, setMobile] = useState<LighthouseResult | null>(null);
  const [desktop, setDesktop] = useState<LighthouseResult | null>(null);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/lighthouse/latest").then((r) => r.json()).then((d) => {
      // Latest may be either strategy — load both from history
      if (d?.scores) {
        if (d.strategy === "mobile") setMobile(d);
        else setDesktop(d);
      }
    }).catch(() => {});
    fetch("/api/admin/lighthouse/history").then((r) => r.json()).then((h) => {
      setHistory(h);
      // Populate from history if we only have one
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

  const hasResults = !!(mobile?.scores || desktop?.scores);

  return (
    <>
      <TabTitle value="Lighthouse" />
      <ActionBar
        helpArticleId="lighthouse-intro"
        actions={
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
