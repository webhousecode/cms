"use client";

import { useState, useRef, useEffect } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle, Download, ExternalLink, Image as ImageIcon, ImageOff, Link2, Loader2, MinusCircle, Play, Wrench, X, XCircle } from "lucide-react";
import type { LinkResult, ProgressEvent } from "@/app/api/check-links/route";
import type { LinkCheckRecord } from "@/lib/link-check-store";
import { cn } from "@/lib/utils";
import { useTabs } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { useT } from "@/lib/i18n-context";
import { useFormat } from "@/lib/format-locale";

type RunState = "idle" | "running" | "done" | "error";
type FixState = { loading: boolean; suggestion?: string | null; reason?: string; confidence?: string; applied?: boolean; error?: string };

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return t("tools.linkChecker.seconds", { n: secs });
  if (secs < 3600) return t("tools.linkChecker.minutes", { n: Math.floor(secs / 60) });
  if (secs < 86400) return t("tools.linkChecker.hours", { n: Math.floor(secs / 3600) });
  return t("tools.linkChecker.days", { n: Math.floor(secs / 86400) });
}

function statusIcon(status: LinkResult["status"]) {
  if (status === "ok") return <CheckCircle style={{ width: "0.875rem", height: "0.875rem", color: "#4ade80", flexShrink: 0 }} />;
  if (status === "redirect") return <ArrowRight style={{ width: "0.875rem", height: "0.875rem", color: "var(--status-warning)", flexShrink: 0 }} />;
  // Amber, not red: a doubtful address and an unchecked one are questions, not
  // verdicts. Painting them red is how a tool teaches people to ignore red.
  if (status === "schemeless" || status === "unverified")
    return <AlertTriangle style={{ width: "0.875rem", height: "0.875rem", color: "var(--status-warning)", flexShrink: 0 }} />;
  if (status === "dangerous")
    return <XCircle style={{ width: "0.875rem", height: "0.875rem", color: "#f87171", flexShrink: 0 }} />;
  if (status === "skipped")
    return <MinusCircle style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)", flexShrink: 0 }} />;
  return <XCircle style={{ width: "0.875rem", height: "0.875rem", color: "#f87171", flexShrink: 0 }} />;
}

function statusLabel(r: LinkResult, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (r.status === "ok") return r.httpStatus ? t("tools.linkChecker.statusOkCode", { code: r.httpStatus }) : t("tools.linkChecker.statusOk");
  if (r.status === "redirect") return `${r.httpStatus} → ${r.redirectTo}`;
  if (r.status === "broken") return r.httpStatus ? t("tools.linkChecker.statusBrokenCode", { code: r.httpStatus }) : r.error ?? t("tools.linkChecker.statusNotFound");
  if (r.status === "skipped") return t("tools.linkChecker.statusSkipped");
  if (r.status === "schemeless") return r.error ?? t("tools.linkChecker.statusSchemeless");
  if (r.status === "unverified") return r.error ?? t("tools.linkChecker.statusUnverified");
  if (r.status === "dangerous") return r.error ?? t("tools.linkChecker.statusDangerous");
  return r.error ?? t("tools.linkChecker.statusError");
}

function FixButton({ link, onFixed }: { link: LinkResult; onFixed: (newUrl: string) => void }) {
  const t = useT();
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
      setFix({ loading: false, error: t("tools.linkChecker.suggestFailed") });
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
      setFix((s) => ({ ...s, loading: false, error: t("tools.linkChecker.applyFailed") }));
    }
  }

  if (fix.applied) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 font-mono">
        <Check style={{ width: "0.75rem", height: "0.75rem" }} /> {t("tools.linkChecker.fixed")}
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
                <span className="text-[9px] px-1 py-px rounded bg-green-500/10 text-green-400">{t("tools.linkChecker.high")}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">{fix.reason}</div>
            <div className="flex gap-1.5 mt-0.5">
              <button
                type="button"
                data-testid="link-fix-apply"
                onClick={applySuggestion}
                disabled={fix.loading}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {fix.loading ? <Loader2 style={{ width: "0.6rem", height: "0.6rem", animation: "spin 1s linear infinite" }} /> : <Check style={{ width: "0.6rem", height: "0.6rem" }} />}
                {t("tools.linkChecker.apply")}
              </button>
              <button
                type="button"
                data-testid="link-fix-cancel"
                onClick={() => setFix({ loading: false })}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
              >
                <X style={{ width: "0.6rem", height: "0.6rem" }} />
              </button>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">{fix.reason ?? t("tools.linkChecker.noSuggestion")}</span>
        )}
        {fix.error && <span className="text-[11px] text-red-400">{fix.error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-testid="link-fix-suggest"
      onClick={getSuggestion}
      disabled={fix.loading}
      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-border hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50"
    >
      {fix.loading ? (
        <Loader2 style={{ width: "0.7rem", height: "0.7rem", animation: "spin 1s linear infinite" }} />
      ) : (
        <Wrench style={{ width: "0.7rem", height: "0.7rem" }} />
      )}
      {t("tools.linkChecker.fix")}
    </button>
  );
}

export default function LinkCheckerPage() {
  const t = useT();
  const fmt = useFormat();
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [state, setState] = useState<RunState>("idle");
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState(0);
  const [results, setResults] = useState<LinkResult[]>([]);
  const [filter, setFilter] = useState<"all" | "broken" | "redirect" | "ok" | "broken-images" | "attention">("broken");
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
      if (!res.body) throw new Error("No response body"); // i18n-ignore: internal exception, never shown

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

  const broken = results.filter((r) => (r.status === "broken" || r.status === "error" || r.status === "dangerous") && r.kind !== "image");
  const brokenImages = results.filter((r) => (r.status === "broken" || r.status === "error") && r.kind === "image");
  const allBroken = results.filter((r) => r.status === "broken" || r.status === "error" || r.status === "dangerous");
  const redirects = results.filter((r) => r.status === "redirect");
  const ok = results.filter((r) => r.status === "ok");
  // Their own bucket on purpose. Counted as broken they train the reader to
  // ignore red; left out of every list they disappear silently — and a
  // disappeared warning is the worse of the two.
  const attention = results.filter((r) => r.status === "schemeless" || r.status === "unverified");
  // «Intet at se her» skal betyde INTET, ikke «intet i den bunke jeg tæller».
  // Den grønne kvittering var betinget af allBroken alene, så et site med 20
  // skemaløse links kunne slutte med et grønt flueben og fundene gemt bag en
  // fane ingen havde grund til at klikke på. Det er præcis dette korts egen
  // pointe, genindført ét lag højere oppe.
  const needsAttention = results.filter((r) => r.status !== "ok" && r.status !== "skipped");

  const visible = filter === "all" ? results
    : filter === "broken" ? broken
    : filter === "broken-images" ? brokenImages
    : filter === "redirect" ? redirects
    : filter === "attention" ? attention
    : ok;

  function exportReport() {
    const report = {
      exportedAt: new Date().toISOString(),
      checkedAt,
      // Alle tilstande med, og summen SKAL gå op: et resultat der ikke er
      // talt med nogen steder er et fund der forsvinder ud af rapporten.
      summary: {
        total: results.length,
        brokenLinks: broken.length,
        brokenImages: brokenImages.length,
        redirects: redirects.length,
        attention: attention.length,
        skipped: results.filter((r) => r.status === "skipped").length,
        ok: ok.length,
      },
      attention: attention.map((r) => ({
        url: r.url,
        text: r.text,
        status: r.status,
        reason: r.error,
        document: `${r.docCollection}/${r.docSlug}`,
        field: r.field,
      })),
      brokenLinks: broken.map((r) => ({
        url: r.url,
        text: r.text,
        document: `${r.docCollection}/${r.docSlug}`,
        title: r.docTitle,
        field: r.field,
        status: r.httpStatus ?? r.error,
      })),
      brokenImages: brokenImages.map((r) => ({
        url: r.url,
        alt: r.text,
        document: `${r.docCollection}/${r.docSlug}`,
        title: r.docTitle,
        field: r.field,
        status: r.httpStatus ?? r.error,
      })),
      redirects: redirects.map((r) => ({
        url: r.url,
        redirectTo: r.redirectTo,
        document: `${r.docCollection}/${r.docSlug}`,
        title: r.docTitle,
        field: r.field,
        httpStatus: r.httpStatus,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `link-check-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div data-testid="link-checker-root" className="flex flex-col">
      <ActionBar helpArticleId="linkchecker-intro"
        actions={<>
          {state === "done" && needsAttention.length > 0 && (
            <ActionButton variant="secondary" onClick={exportReport} icon={<Download style={{ width: 14, height: 14 }} />}>
              {t("tools.linkChecker.exportJson")}
            </ActionButton>
          )}
          {state === "running" ? (
            <ActionButton variant="secondary" onClick={stop}>
              {t("tools.linkChecker.stop")}
            </ActionButton>
          ) : (
            <ActionButton variant="primary" onClick={runCheck} icon={<Play style={{ width: 14, height: 14 }} />}>
              {t("tools.linkChecker.runCheck")}
            </ActionButton>
          )}
        </>}
      >
        <ActionBarBreadcrumb items={[t("tools.common.tools"), t("tools.linkChecker.title")]} />
      </ActionBar>

      <div className="p-6 max-w-5xl">
        {state === "done" && (
          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0 0 1rem", fontFamily: "monospace" }}>
            {t("tools.linkChecker.summary", { checked: results.length, broken: broken.length, images: brokenImages.length, redirects: redirects.length })}
          </p>
        )}
        {/* Last-run notice */}
        {checkedAt && state !== "running" && (
          <p className="text-xs text-muted-foreground mb-4 font-mono">
            {t("tools.linkChecker.lastChecked", { date: fmt.dateTime(checkedAt), ago: timeAgo(checkedAt, t) })}
          </p>
        )}

        {/* Idle state — no previous results */}
        {state === "idle" && results.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
            <Link2 style={{ width: "3rem", height: "3rem", opacity: 0.2 }} />
            <p className="text-sm">{t("tools.linkChecker.idleIntro")}</p>
            <p className="text-xs opacity-60">{t("tools.linkChecker.idleHint")}</p>
            <button data-testid="link-checker-start" type="button" onClick={runCheck}
              className="mt-2 flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              <Play style={{ width: "0.875rem", height: "0.875rem" }} />
              {t("tools.linkChecker.runCheckLower")}
            </button>
          </div>
        )}

        {/* Progress */}
        {state === "running" && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite", color: "var(--primary)" }} />
              <span className="text-sm text-muted-foreground">
                {t("tools.linkChecker.checking", { checked, total: total || "?" })}
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
              { key: "broken" as const, label: t("tools.linkChecker.brokenLinks"), count: broken.length, icon: <XCircle style={{ width: "1rem", height: "1rem", color: "#f87171" }} /> },
              { key: "broken-images" as const, label: t("tools.linkChecker.brokenImages"), count: brokenImages.length, icon: <ImageOff style={{ width: "1rem", height: "1rem", color: "#f87171" }} /> },
              { key: "attention" as const, label: t("tools.linkChecker.attention"), count: attention.length, icon: <AlertTriangle style={{ width: "1rem", height: "1rem", color: "var(--status-warning)" }} /> },
              { key: "redirect" as const, label: t("tools.linkChecker.redirects"), count: redirects.length, icon: <ArrowRight style={{ width: "1rem", height: "1rem", color: "var(--status-warning)" }} /> },
              { key: "ok" as const, label: t("tools.linkChecker.ok"), count: ok.length, icon: <CheckCircle style={{ width: "1rem", height: "1rem", color: "#4ade80" }} /> },
              { key: "all" as const, label: t("tools.linkChecker.all"), count: results.length, icon: <Link2 style={{ width: "1rem", height: "1rem", color: "var(--muted-foreground)" }} /> },
            ].map(({ key, label, count, icon }) => (
              <button
                key={key}
                type="button"
                data-testid={`links-filter-${key}`}
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
                  {["icon", "thUrl", "thItem", "thField", "thStatus", "thFix"].map((h) => (
                    <th key={h} style={{ padding: "0.5rem 0.875rem", textAlign: "left", fontFamily: "monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", fontWeight: 400 }}>{h === "icon" ? "" : t(`tools.linkChecker.${h}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i < visible.length - 1 ? "1px solid var(--border)" : "none",
                      background:
                        r.status === "broken" || r.status === "error"
                          ? "rgba(248,113,113,0.04)"
                          : r.status === "schemeless" || r.status === "unverified"
                            ? "rgba(251,191,36,0.05)"
                            : undefined,
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
                        data-testid={`link-checker-doc-button-${r.docCollection}-${r.docSlug}`}
                        type="button"
                        onClick={() => openTab(`/admin/content/${r.docCollection}/${r.docSlug}`, r.docTitle)}
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
                          r.status === "ok" && "bg-green-500/10 text-green-400", // i18n-ignore: CSS class names
                          r.status === "redirect" && "bg-status-warning/10 text-status-warning", // i18n-ignore: CSS class names
                          (r.status === "broken" || r.status === "error") && "bg-red-500/10 text-red-400", // i18n-ignore: CSS class names
                          (r.status === "schemeless" || r.status === "unverified") && "bg-status-warning/10 text-status-warning", // i18n-ignore: CSS class names
                          r.status === "skipped" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {statusLabel(r, t)}
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
        {state === "done" && needsAttention.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <CheckCircle style={{ width: "2rem", height: "2rem", color: "#4ade80" }} />
            <p className="text-sm font-medium text-foreground">{t("tools.linkChecker.allHealthy")}</p>
            <p className="text-xs">{t("tools.linkChecker.checkedItems", { n: results.length, date: fmt.dateTime(checkedAt!) })}</p>
          </div>
        )}
      </div>
    </div>
    </fieldset>
  );
}
