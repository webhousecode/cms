"use client";

import { useState, useRef, useEffect } from "react";
import { Link2, Play, CheckCircle, XCircle, ArrowRight, ExternalLink, Loader2, Wrench, Check, X, ImageOff, Image as ImageIcon } from "lucide-react";
import type { LinkResult, ProgressEvent } from "@/app/api/check-links/route";
import type { LinkCheckRecord } from "@/lib/link-check-store";
import { cn } from "@/lib/utils";
import { useTabs } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

type RunState = "idle" | "running" | "done" | "error";
type FixState = { loading: boolean; suggestion?: string | null; reason?: string; confidence?: string; applied?: boolean; error?: string };

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs} seconds`;
  if (secs < 3600) return `${Math.floor(secs / 60)} minutes`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hours`;
  return `${Math.floor(secs / 86400)} days`;
}

function statusIcon(status: LinkResult["status"]) {
  if (status === "ok") return <CheckCircle style={{ width: "0.875rem", height: "0.875rem", color: "#4ade80", flexShrink: 0 }} />;
  if (status === "redirect") return <ArrowRight style={{ width: "0.875rem", height: "0.875rem", color: "#facc15", flexShrink: 0 }} />;
  return <XCircle style={{ width: "0.875rem", height: "0.875rem", color: "#f87171", flexShrink: 0 }} />;
}

function statusLabel(r: LinkResult) {
  if (r.status === "ok") return r.httpStatus ? `${r.httpStatus} OK` : "OK";
  if (r.status === "redirect") return `${r.httpStatus} → ${r.redirectTo}`;
  if (r.status === "broken") return r.httpStatus ? `${r.httpStatus} Broken` : r.error ?? "Not found";
  return r.error ?? "Error";
}

function FixButton({ link, onFixed }: { link: LinkResult; onFixed: (newUrl: string) => void }) {
  const [fix, setFix] = useState<FixState>({ loading: false });

  async function getSuggestion() {
    setFix({ loading: true });
    try {
      const res = await fetch("/api/check-links/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: link.url,
          text: link.text,
          docCollection: link.docCollection,
          docSlug: link.docSlug,
          type: link.type,
          error: link.error,
        }),
      });
      const data = await res.json();
      setFix({ loading: false, suggestion: data.suggestion, reason: data.reason, confidence: data.confidence });
    } catch {
      setFix({ loading: false, error: "Failed to get suggestion" });
    }
  }

  async function applySuggestion() {
    if (!fix.suggestion) return;
    setFix((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/check-links/apply-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docCollection: link.docCollection,
          docSlug: link.docSlug,
          field: link.field,
          oldUrl: link.url,
          newUrl: fix.suggestion,
          linkText: link.text,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFix((s) => ({ ...s, loading: false, error: err.error }));
        return;
      }
      setFix((s) => ({ ...s, loading: false, applied: true }));
      onFixed(fix.suggestion!);
    } catch {
      setFix((s) => ({ ...s, loading: false, error: "Failed to apply fix" }));
    }
  }

  if (fix.applied) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 font-mono">
        <Check style={{ width: "0.75rem", height: "0.75rem" }} /> Fixed
      </span>
    );
  }

  if (fix.suggestion !== undefined) {
    return (
      <div className="flex flex-col gap-1">
        {fix.suggestion ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-foreground truncate max-w-[180px]" title={fix.suggestion}>
                {fix.suggestion}
              </span>
              {fix.confidence === "high" && (
                <span className="text-[9px] px-1 py-px rounded bg-green-500/10 text-green-400">high</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">{fix.reason}</div>
            <div className="flex gap-1.5 mt-0.5">
              <button
                type="button"
                onClick={applySuggestion}
                disabled={fix.loading}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {fix.loading ? <Loader2 style={{ width: "0.6rem", height: "0.6rem", animation: "spin 1s linear infinite" }} /> : <Check style={{ width: "0.6rem", height: "0.6rem" }} />}
                Apply
              </button>
              <button
                type="button"
                onClick={() => setFix({ loading: false })}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
              >
                <X style={{ width: "0.6rem", height: "0.6rem" }} />
              </button>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">{fix.reason ?? "No suggestion"}</span>
        )}
        {fix.error && <span className="text-[11px] text-red-400">{fix.error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={getSuggestion}
      disabled={fix.loading}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50"
    >
      {fix.loading ? (
        <Loader2 style={{ width: "0.7rem", height: "0.7rem", animation: "spin 1s linear infinite" }} />
      ) : (
        <Wrench style={{ width: "0.7rem", height: "0.7rem" }} />
      )}
      Fix
    </button>
  );
}

export default function LinkCheckerPage() {
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [state, setState] = useState<RunState>("idle");
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState(0);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [filter, setFilter] = useState<"all" | "broken" | "redirect" | "ok" | "broken-images">("broken");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { openTab } = useTabs();

  // Load last persisted result on mount
  useEffect(() => {
    fetch("/api/check-links/last")
      .then((r) => r.json())
      .then((d: LinkCheckRecord | null) => {
        if (!d) return;
        setResults(d.results);
        setTotal(d.total);
        setChecked(d.total);
        setCheckedAt(d.checkedAt);
        setState("done");
      })
      .catch(() => {});
  }, []);

  async function runCheck() {
    setState("running");
    setResults([]);
    setChecked(0);
    setTotal(0);
    setCheckedAt(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/check-links", { signal: ctrl.signal });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as ProgressEvent;
            if (evt.kind === "start") {
              setTotal(evt.totalLinks);
            } else if (evt.kind === "result") {
              setResults((prev) => [...prev, evt.result]);
              setChecked((n) => n + 1);
            } else if (evt.kind === "done") {
              setCheckedAt(evt.checkedAt);
              setState("done");
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") setState("error");
    }
  }

  function stop() {
    abortRef.current?.abort();
    setState("idle");
  }

  const broken = results.filter((r) => (r.status === "broken" || r.status === "error") && r.kind !== "image");
  const brokenImages = results.filter((r) => (r.status === "broken" || r.status === "error") && r.kind === "image");
  const allBroken = results.filter((r) => r.status === "broken" || r.status === "error");
  const redirects = results.filter((r) => r.status === "redirect");
  const ok = results.filter((r) => r.status === "ok");

  const visible = filter === "all" ? results
    : filter === "broken" ? broken
    : filter === "broken-images" ? brokenImages
    : filter === "redirect" ? redirects
    : ok;

  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div className="flex flex-col min-h-screen">
      <ActionBar
        actions={<>
          {state === "running" ? (
            <ActionButton variant="secondary" onClick={stop}>
              Stop
            </ActionButton>
          ) : (
            <ActionButton variant="primary" onClick={runCheck} icon={<Play style={{ width: 14, height: 14 }} />}>
              Run Check
            </ActionButton>
          )}
        </>}
      >
        <ActionBarBreadcrumb items={["Tools", "Link Checker"]} />
        {state === "done" && (
          <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
            · {results.length} checked · {broken.length} broken links · {brokenImages.length} broken images · {redirects.length} redirects
          </span>
        )}
      </ActionBar>

      <div className="p-6 max-w-5xl">

        {/* Last-run notice */}
        {checkedAt && state !== "running" && (
          <p className="text-xs text-muted-foreground mb-4 font-mono">
            Last checked: {new Date(checkedAt).toLocaleString()} &nbsp;·&nbsp; It has been {timeAgo(checkedAt)} since your last link check.
          </p>
        )}

        {/* Idle state — no previous results */}
        {state === "idle" && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
            <Link2 style={{ width: "3rem", height: "3rem", opacity: 0.2 }} />
            <p className="text-sm">Checks all links and images across every richtext and image field.</p>
            <p className="text-xs opacity-60">Internal links verify the target document exists. Internal images verify the file exists on disk. External URLs send a HEAD request.</p>
            <button type="button" onClick={runCheck}
              className="mt-2 flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              <Play style={{ width: "0.875rem", height: "0.875rem" }} />
              Run check
            </button>
          </div>
        )}

        {/* Progress */}
        {state === "running" && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite", color: "var(--primary)" }} />
              <span className="text-sm text-muted-foreground">
                Checking {checked} / {total || "?"} links…
              </span>
            </div>
            {total > 0 && (
              <div style={{ height: "4px", background: "var(--muted)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--primary)", transition: "width 200ms" }} />
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        {(state === "running" || state === "done") && results.length > 0 && (
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            {[
              { key: "broken" as const, label: "Broken Links", count: broken.length, icon: <XCircle style={{ width: "1rem", height: "1rem", color: "#f87171" }} /> },
              { key: "broken-images" as const, label: "Broken Images", count: brokenImages.length, icon: <ImageOff style={{ width: "1rem", height: "1rem", color: "#f87171" }} /> },
              { key: "redirect" as const, label: "Redirects", count: redirects.length, icon: <ArrowRight style={{ width: "1rem", height: "1rem", color: "#facc15" }} /> },
              { key: "ok" as const, label: "OK", count: ok.length, icon: <CheckCircle style={{ width: "1rem", height: "1rem", color: "#4ade80" }} /> },
              { key: "all" as const, label: "All", count: results.length, icon: <Link2 style={{ width: "1rem", height: "1rem", color: "var(--muted-foreground)" }} /> },
            ].map(({ key, label, count, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.625rem 1rem", borderRadius: "8px",
                  border: `1px solid ${filter === key ? "var(--primary)" : "var(--border)"}`,
                  background: filter === key ? "var(--accent)" : "var(--card)",
                  cursor: "pointer",
                }}
              >
                {icon}
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>{count}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results table */}
        {visible.length > 0 && (
          <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
                  {["icon", "URL / Image", "Item", "Field", "Status", "Fix"].map((h) => (
                    <th key={h} style={{ padding: "0.5rem 0.875rem", textAlign: "left", fontFamily: "monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", fontWeight: 400 }}>{h === "icon" ? "" : h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i < visible.length - 1 ? "1px solid var(--border)" : "none",
                      background: r.status === "broken" || r.status === "error" ? "rgba(248,113,113,0.04)" : undefined,
                    }}
                  >
                    <td style={{ padding: "0.5rem 0.875rem" }}>{statusIcon(r.status)}</td>
                    <td style={{ padding: "0.5rem 0.875rem", maxWidth: "260px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        {r.kind === "image" ? (
                          <ImageIcon style={{ width: "0.7rem", height: "0.7rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
                        ) : r.type === "external" ? (
                          <ExternalLink style={{ width: "0.7rem", height: "0.7rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
                        ) : null}
                        <span
                          className="font-mono truncate"
                          style={{ fontSize: "0.75rem", color: "var(--foreground)" }}
                          title={r.url}
                        >
                          {r.text !== r.url && r.text ? (
                            <><span style={{ color: "var(--muted-foreground)" }}>{r.text}</span> <span style={{ opacity: 0.5 }}>→</span> {r.url}</>
                          ) : r.url}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem 0.875rem" }}>
                      <button
                        type="button"
                        onClick={() => openTab(`/admin/${r.docCollection}/${r.docSlug}`, r.docTitle)}
                        className="hover:underline text-left"
                        style={{ color: "var(--foreground)", fontSize: "0.8rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        {r.docTitle}
                      </button>
                      <div style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
                        {r.docCollection}
                      </div>
                    </td>
                    <td style={{ padding: "0.5rem 0.875rem", fontFamily: "monospace", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                      {r.field}
                    </td>
                    <td style={{ padding: "0.5rem 0.875rem" }}>
                      <span
                        className={cn(
                          "text-xs font-mono px-2 py-0.5 rounded-full",
                          r.status === "ok" && "bg-green-500/10 text-green-400",
                          r.status === "redirect" && "bg-yellow-500/10 text-yellow-400",
                          (r.status === "broken" || r.status === "error") && "bg-red-500/10 text-red-400",
                        )}
                      >
                        {statusLabel(r)}
                      </span>
                    </td>
                    <td style={{ padding: "0.5rem 0.875rem" }}>
                      {(r.status === "broken" || r.status === "error") && (
                        <FixButton
                          link={r}
                          onFixed={(newUrl) => {
                            setResults((prev) => prev.map((p) =>
                              p === r ? { ...p, url: newUrl, status: "ok", error: undefined, httpStatus: undefined } : p
                            ));
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Done — no broken links */}
        {state === "done" && allBroken.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <CheckCircle style={{ width: "2rem", height: "2rem", color: "#4ade80" }} />
            <p className="text-sm font-medium text-foreground">All links and images are healthy</p>
            <p className="text-xs">Checked {results.length} items · {new Date(checkedAt!).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
    </fieldset>
  );
}
