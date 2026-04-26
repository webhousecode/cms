"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Wrench, ChevronDown, ChevronUp, Copy, CheckCheck } from "lucide-react";
import type { DiagnoseResult, DiagnoseIssue } from "@/app/api/admin/site-config/diagnose/route";

interface Props {
  siteName: string;
  rawErrors: string;
}

type Phase = "diagnosing" | "report" | "confirming" | "fixing" | "done" | "error";

function buildAiHandoff(siteName: string, diagnosis: DiagnoseResult): string {
  const lines: string[] = [
    `# Config problems in "${siteName}"`,
    "",
    `## Summary`,
    diagnosis.summary,
    "",
    `## ${diagnosis.issues.length} ${diagnosis.issues.length === 1 ? "issue" : "issues"} found`,
    "",
  ];
  diagnosis.issues.forEach((issue, i) => {
    lines.push(`### Issue ${i + 1} — \`${issue.field}\``);
    lines.push(`**Problem:** ${issue.problem}`);
    lines.push(`**Auto-fixable:** ${issue.autoFixable ? "Yes" : "No"}`);
    lines.push(`**Fix:** ${issue.fix}`);
    lines.push("");
  });
  lines.push("---");
  lines.push("Fix all issues above in `cms.config.ts`. After fixing, restart the dev server and verify the site loads.");
  return lines.join("\n");
}

export function ConfigRepairPanel({ siteName, rawErrors }: Props) {
  const [phase, setPhase] = useState<Phase>("diagnosing");
  const [diagnosis, setDiagnosis] = useState<DiagnoseResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!diagnosis) return;
    const md = buildAiHandoff(siteName, diagnosis);
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function diagnose() {
      try {
        const res = await fetch("/api/admin/site-config/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawErrors }),
        });
        if (cancelled) return;
        const data = await res.json() as DiagnoseResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Diagnosis failed");
        setDiagnosis(data);
        setPhase("report");
      } catch (err) {
        if (!cancelled) {
          setErrMsg(err instanceof Error ? err.message : "Diagnosis failed");
          setPhase("error");
        }
      }
    }
    diagnose();
    return () => { cancelled = true; };
  }, [rawErrors]);

  async function handleFix() {
    setPhase("fixing");
    setErrMsg(null);
    try {
      const res = await fetch("/api/admin/site-config/auto-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawErrors }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Fix failed");
      setPhase("done");
      // Reload after short delay so site-pool picks up corrected config
      setTimeout(() => { window.location.href = "/admin"; }, 1800);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Fix failed");
      setPhase("report");
    }
  }

  const card: React.CSSProperties = {
    background: "var(--background)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "1.25rem 1.5rem",
  };

  return (
    <div style={{
      padding: "2rem",
      maxWidth: "760px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column",
      gap: "1.25rem",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <AlertTriangle style={{ width: "1.5rem", height: "1.5rem", color: "#f59e0b", flexShrink: 0, marginTop: "2px" }} />
        <div>
          <h1 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.25rem" }}>
            Configuration problem in &ldquo;{siteName}&rdquo;
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
            This site cannot load until the config is corrected. All other sites are unaffected.
          </p>
        </div>
      </div>

      {/* Diagnosing state */}
      {phase === "diagnosing" && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--muted-foreground)" }}>
          <Loader2 className="animate-spin" style={{ width: "1rem", height: "1rem" }} />
          <span style={{ fontSize: "0.85rem" }}>Analysing the configuration…</span>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div style={{ ...card, borderColor: "var(--destructive)" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--destructive)", margin: "0 0 0.5rem" }}>{errMsg}</p>
          <details style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
            <summary style={{ cursor: "pointer" }}>Raw validation errors</summary>
            <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{rawErrors}</pre>
          </details>
        </div>
      )}

      {/* LLM Report */}
      {diagnosis && (phase === "report" || phase === "confirming" || phase === "fixing" || phase === "done") && (
        <>
          {/* Summary */}
          <div style={card}>
            <p style={{ fontSize: "0.9rem", lineHeight: 1.65, margin: 0, color: "var(--foreground)" }}>
              {diagnosis.summary}
            </p>
          </div>

          {/* Issue list */}
          {diagnosis.issues.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <h2 style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", margin: 0 }}>
                  {diagnosis.issues.length} {diagnosis.issues.length === 1 ? "issue" : "issues"} found
                </h2>
                <button
                  onClick={handleCopy}
                  title="Copy all issues as markdown — paste into AI site builder"
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    fontSize: "0.7rem", fontWeight: 600,
                    padding: "0.25rem 0.65rem", borderRadius: "5px",
                    border: "1px solid var(--border)",
                    background: copied ? "color-mix(in srgb, #16a34a 12%, transparent)" : "transparent",
                    color: copied ? "#16a34a" : "var(--muted-foreground)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {copied
                    ? <><CheckCheck style={{ width: "0.75rem", height: "0.75rem" }} />Copied!</>
                    : <><Copy style={{ width: "0.75rem", height: "0.75rem" }} />Copy for AI builder</>}
                </button>
              </div>
              {diagnosis.issues.map((issue: DiagnoseIssue, i: number) => (
                <div key={i} style={{
                  ...card,
                  padding: "0.75rem 1rem",
                  borderLeft: `3px solid ${issue.autoFixable ? "#f59e0b" : "var(--destructive)"}`,
                }}>
                  <div style={{
                    display: "flex", alignItems: "flex-start",
                    justifyContent: "space-between", gap: "0.5rem",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.2rem" }}>
                        {issue.problem}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                        {issue.field}
                      </div>
                    </div>
                    {issue.autoFixable && (
                      <span style={{
                        fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "4px",
                        background: "color-mix(in srgb, #f59e0b 15%, transparent)",
                        color: "#d97706", fontWeight: 600, flexShrink: 0,
                      }}>
                        Auto-fixable
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
                    style={{
                      marginTop: "0.4rem", fontSize: "0.7rem", color: "var(--primary)",
                      background: "none", border: "none", cursor: "pointer",
                      padding: 0, display: "flex", alignItems: "center", gap: "0.2rem",
                    }}
                  >
                    {expanded[i]
                      ? <><ChevronUp style={{ width: "0.7rem", height: "0.7rem" }} /> Hide fix</>
                      : <><ChevronDown style={{ width: "0.7rem", height: "0.7rem" }} /> How to fix</>}
                  </button>
                  {expanded[i] && (
                    <div style={{
                      marginTop: "0.4rem", fontSize: "0.75rem", color: "var(--foreground)",
                      padding: "0.5rem 0.6rem", borderRadius: "5px",
                      background: "var(--muted)", lineHeight: 1.55,
                    }}>
                      {issue.fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* CTA */}
          {phase === "done" && (
            <div style={{
              ...card,
              borderColor: "#16a34a",
              display: "flex", alignItems: "center", gap: "0.75rem",
              color: "#16a34a",
            }}>
              <Check style={{ width: "1.25rem", height: "1.25rem", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Configuration fixed!</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.8 }}>Returning to the site…</div>
              </div>
            </div>
          )}

          {phase === "report" && (
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {diagnosis.canAutoFix ? (
                <>
                  <p style={{ fontSize: "0.9rem", margin: 0 }}>
                    😊 Jeg kan fixe det for dig — skal jeg prøve?
                  </p>
                  {diagnosis.autoFixNotes && (
                    <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>
                      {diagnosis.autoFixNotes}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setPhase("confirming")}
                      style={{
                        padding: "0.5rem 1.1rem", borderRadius: "7px",
                        background: "var(--primary)", color: "#0D0D0D",
                        border: "none", fontSize: "0.85rem", fontWeight: 600,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem",
                      }}
                    >
                      <Wrench style={{ width: "0.85rem", height: "0.85rem" }} />
                      Ja, fix det for mig
                    </button>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                      The original file will be overwritten.
                    </span>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>
                  This configuration requires manual editing — see the instructions above.
                </p>
              )}
            </div>
          )}

          {(phase === "confirming" || phase === "fixing") && (
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <p style={{ fontSize: "0.9rem", margin: 0, fontWeight: 600 }}>
                Er du sikker? Filen <code style={{ fontSize: "0.8rem" }}>{diagnosis.configPath.split("/").slice(-2).join("/")}</code> overskrives.
              </p>
              {errMsg && (
                <p style={{ fontSize: "0.75rem", color: "var(--destructive)", margin: 0 }}>{errMsg}</p>
              )}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={handleFix}
                  disabled={phase === "fixing"}
                  style={{
                    padding: "0.45rem 1rem", borderRadius: "6px",
                    background: "var(--primary)", color: "#0D0D0D",
                    border: "none", fontSize: "0.8rem", fontWeight: 600,
                    cursor: phase === "fixing" ? "wait" : "pointer",
                    display: "flex", alignItems: "center", gap: "0.35rem",
                    opacity: phase === "fixing" ? 0.7 : 1,
                  }}
                >
                  {phase === "fixing" && <Loader2 className="animate-spin" style={{ width: "0.75rem", height: "0.75rem" }} />}
                  {phase === "fixing" ? "Fixing…" : "Ja, overskriv"}
                </button>
                <button
                  onClick={() => setPhase("report")}
                  disabled={phase === "fixing"}
                  style={{
                    padding: "0.45rem 0.9rem", borderRadius: "6px",
                    background: "transparent", color: "var(--foreground)",
                    border: "1px solid var(--border)", fontSize: "0.8rem",
                    cursor: phase === "fixing" ? "not-allowed" : "pointer",
                  }}
                >
                  Nej, annuller
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
