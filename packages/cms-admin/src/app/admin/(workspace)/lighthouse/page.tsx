"use client";

import { useState, useEffect, useCallback } from "react";
import { Gauge, RefreshCw, Monitor, Smartphone, AlertTriangle, ChevronDown, ChevronRight, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { TabTitle } from "@/lib/tabs-context";
import { scoreColor, SCORE_COLOR_MAP, type LighthouseResult, type LighthouseScore, type ScoreHistoryEntry } from "@/lib/lighthouse/types";

export default function LighthousePage() {
  const [latest, setLatest] = useState<LighthouseResult | null>(null);
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [error, setError] = useState<string | null>(null);
  const [expandOpps, setExpandOpps] = useState(true);

  useEffect(() => {
    fetch("/api/admin/lighthouse/latest").then((r) => r.json()).then(setLatest).catch(() => {});
    fetch("/api/admin/lighthouse/history").then((r) => r.json()).then(setHistory).catch(() => {});
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lighthouse/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLatest(data);
      // Refresh history
      const histRes = await fetch("/api/admin/lighthouse/history");
      setHistory(await histRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }, [strategy]);

  const scores = latest?.scores;
  const prevScores = history.length >= 2 ? history[history.length - 2]?.scores : null;

  return (
    <>
      <TabTitle value="Lighthouse" />
      <ActionBar
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* Strategy toggle */}
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              {(["mobile", "desktop"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  style={{
                    padding: "0.25rem 0.5rem", border: "none", cursor: "pointer",
                    background: strategy === s ? "var(--accent)" : "transparent",
                    color: strategy === s ? "var(--foreground)" : "var(--muted-foreground)",
                    display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem",
                  }}
                >
                  {s === "mobile" ? <Smartphone style={{ width: 13, height: 13 }} /> : <Monitor style={{ width: 13, height: 13 }} />}
                  {s === "mobile" ? "Mobile" : "Desktop"}
                </button>
              ))}
            </div>

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
              {scanning ? "Scanning..." : "Run Scan"}
            </button>
          </div>
        }
      >
        <ActionBarBreadcrumb items={["Lighthouse"]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "64rem" }}>
        {error && (
          <div style={{
            padding: "0.75rem 0.85rem", borderRadius: 6, marginBottom: "1.5rem",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            fontSize: "0.8rem", color: "#ef4444",
          }}>
            {error}
            {error.includes("quota") && (
              <PsiKeySetup />
            )}
          </div>
        )}

        {/* ── Score Cards ── */}
        {scores ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
              {(["performance", "accessibility", "seo", "bestPractices"] as const).map((key) => {
                const value = scores[key];
                const color = SCORE_COLOR_MAP[scoreColor(value)];
                const prev = prevScores?.[key];
                const diff = prev ? value - prev : 0;
                return (
                  <div key={key} style={{
                    padding: "1.25rem", borderRadius: 10,
                    border: "1px solid var(--border)", background: "var(--card)",
                    textAlign: "center",
                  }}>
                    {/* Score circle */}
                    <div style={{
                      width: 64, height: 64, borderRadius: "50%",
                      border: `3px solid ${color}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 0.5rem", fontSize: "1.5rem", fontWeight: 700,
                      color,
                    }}>
                      {value}
                    </div>
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "capitalize" }}>
                      {key === "bestPractices" ? "Best Practices" : key}
                    </div>
                    {diff !== 0 && (
                      <div style={{ fontSize: "0.68rem", color: diff > 0 ? "#0cce6b" : "#ff4e42", marginTop: "0.15rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.15rem" }}>
                        {diff > 0 ? <TrendingUp style={{ width: 11, height: 11 }} /> : <TrendingDown style={{ width: 11, height: 11 }} />}
                        {diff > 0 ? "+" : ""}{diff}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Core Web Vitals ── */}
            {latest.coreWebVitals && (
              <div style={{
                padding: "1rem 1.25rem", borderRadius: 10, marginBottom: "2rem",
                border: "1px solid var(--border)", background: "var(--card)",
              }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>
                  Core Web Vitals
                </div>
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  <CwvMetric label="LCP" value={`${(latest.coreWebVitals.lcp / 1000).toFixed(1)}s`} threshold={[2500, 4000]} raw={latest.coreWebVitals.lcp} />
                  <CwvMetric label="CLS" value={latest.coreWebVitals.cls.toFixed(3)} threshold={[0.1, 0.25]} raw={latest.coreWebVitals.cls} />
                  <CwvMetric label="FCP" value={`${(latest.coreWebVitals.fcp / 1000).toFixed(1)}s`} threshold={[1800, 3000]} raw={latest.coreWebVitals.fcp} />
                  <CwvMetric label="TTFB" value={`${Math.round(latest.coreWebVitals.ttfb)}ms`} threshold={[800, 1800]} raw={latest.coreWebVitals.ttfb} />
                </div>
              </div>
            )}

            {/* ── Opportunities ── */}
            {latest.opportunities.length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <button onClick={() => setExpandOpps(!expandOpps)} style={{
                  display: "flex", alignItems: "center", gap: "0.3rem", background: "none", border: "none",
                  cursor: "pointer", color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600, padding: 0, marginBottom: "0.5rem",
                }}>
                  {expandOpps ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                  Opportunities ({latest.opportunities.length})
                </button>
                {expandOpps && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {latest.opportunities.map((opp) => (
                      <div key={opp.id} style={{
                        padding: "0.6rem 0.85rem", borderRadius: 6,
                        border: "1px solid var(--border)", background: "var(--card)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        fontSize: "0.78rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: "50%",
                            background: opp.score !== null && opp.score < 0.5 ? "#ff4e42" : "#ffa400",
                            flexShrink: 0,
                          }} />
                          {opp.title}
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

            {/* ── Meta ── */}
            <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
              {latest.url} · {latest.strategy} · {latest.engine === "psi" ? "PageSpeed Insights" : "Local Lighthouse"} · {new Date(latest.timestamp).toLocaleString()}
            </div>
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
              Run your first Lighthouse audit to see performance, accessibility, SEO, and best practices scores.
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

        {/* ── Score History ── */}
        {history.length > 1 && (
          <div style={{ marginTop: "2rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>
              Score History ({history.length} scans)
            </div>
            <div style={{
              padding: "0.75rem", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--card)", overflowX: "auto",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Perf</th>
                    <th style={thStyle}>Access</th>
                    <th style={thStyle}>SEO</th>
                    <th style={thStyle}>Best Practices</th>
                    <th style={thStyle}>Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().slice(0, 20).map((entry, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={tdStyle}>{new Date(entry.timestamp).toLocaleDateString()}</td>
                      <td style={tdStyle}><ScoreBadge score={entry.scores.performance} /></td>
                      <td style={tdStyle}><ScoreBadge score={entry.scores.accessibility} /></td>
                      <td style={tdStyle}><ScoreBadge score={entry.scores.seo} /></td>
                      <td style={tdStyle}><ScoreBadge score={entry.scores.bestPractices} /></td>
                      <td style={tdStyle}>{entry.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = SCORE_COLOR_MAP[scoreColor(score)];
  return (
    <span style={{ color, fontWeight: 600 }}>{score}</span>
  );
}

function CwvMetric({ label, value, threshold, raw }: { label: string; value: string; threshold: [number, number]; raw: number }) {
  const color = raw <= threshold[0] ? "#0cce6b" : raw <= threshold[1] ? "#ffa400" : "#ff4e42";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", minWidth: 32 }}>{label}</span>
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color }}>{value}</span>
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
    <div style={{
      marginTop: "0.75rem", padding: "0.75rem", borderRadius: 6,
      background: "var(--card)", border: "1px solid var(--border)",
      color: "var(--foreground)", fontSize: "0.78rem",
    }}>
      <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Set up a PageSpeed Insights API key</div>
      <div style={{ color: "var(--muted-foreground)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
        Without a key, quota is shared and runs out quickly. Get your own free key (25,000 scans/day):
      </div>
      <ol style={{ margin: "0 0 0.5rem 1.25rem", padding: 0, color: "var(--muted-foreground)", lineHeight: 1.7 }}>
        <li>Go to <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noopener" style={{ color: "#F7BB2E" }}>Google Cloud Console → PageSpeed Insights API</a></li>
        <li>Click <strong>Enable</strong></li>
        <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style={{ color: "#F7BB2E" }}>Credentials</a> → Create Credentials → API Key</li>
        <li>Paste it below</li>
      </ol>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIzaSy..."
          style={{
            flex: 1, padding: "0.35rem 0.6rem", borderRadius: 5,
            border: "1px solid var(--border)", background: "var(--background)",
            fontSize: "0.78rem", color: "var(--foreground)", outline: "none",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving || !key.trim() || saved}
          style={{
            padding: "0.35rem 0.75rem", borderRadius: 5, border: "none",
            background: saved ? "#0cce6b" : "#F7BB2E", color: "#0D0D0D",
            fontSize: "0.75rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
            opacity: saving || !key.trim() ? 0.6 : 1,
          }}
        >
          {saved ? "Saved ✓" : saving ? "Saving..." : "Save key"}
        </button>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "0.35rem 0.5rem", fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "0.3rem 0.5rem" };
