/**
 * F144 P5 — Build history panel.
 *
 * Lists recent F144 ephemeral SSR builds for the active site, with
 * live progress polling for any non-terminal build. Drops into the
 * Deploy settings panel.
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";

interface BuildSummary {
  sha: string;
  startedAt: string;
  updatedAt: string;
  phase: "init" | "source-extract" | "image-build" | "image-push" | "done" | "failed";
  message?: string;
  success?: boolean;
  durationMs?: number;
  imageTag?: string;
}

interface BuildEvent {
  ts: string;
  phase: BuildSummary["phase"];
  message?: string;
}

interface BuildRecord extends BuildSummary {
  events: BuildEvent[];
  final?: { success: boolean; exitCode?: number | null; durationMs?: number; imageTag?: string };
}

interface BuildHistoryProps {
  siteId: string;
  /** Refresh interval ms when a build is in flight. Default 3000. */
  livePollMs?: number;
}

const TERMINAL_PHASES = new Set<BuildSummary["phase"]>(["done", "failed"]);

const PHASE_LABEL: Record<BuildSummary["phase"], string> = {
  "init": "Initializing",
  "source-extract": "Extracting source",
  "image-build": "Building image",
  "image-push": "Pushing to registry",
  "done": "Done",
  "failed": "Failed",
};

export function BuildHistory({ siteId, livePollMs = 3000 }: BuildHistoryProps){
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<BuildRecord | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/builder/list?site=${encodeURIComponent(siteId)}&limit=20`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { builds: BuildSummary[] };
      setBuilds(data.builds);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load builds");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // Initial load + live polling whenever any build is non-terminal
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasLive = builds.some((b) => !TERMINAL_PHASES.has(b.phase));
    if (!hasLive) return;
    const id = setInterval(() => { void refresh(); }, livePollMs);
    return () => clearInterval(id);
  }, [builds, livePollMs, refresh]);

  // Detail load when expanded changes
  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/builder/status?site=${encodeURIComponent(siteId)}&sha=${encodeURIComponent(expanded)}`,
        );
        if (!res.ok) return;
        const rec = (await res.json()) as BuildRecord;
        if (!cancelled) setDetail(rec);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [expanded, siteId, builds]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)" }}>
        <Loader2 size={14} className="spin" />
        <span style={{ fontSize: "0.85rem" }}>Loading build history…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: "var(--destructive)", fontSize: "0.85rem" }}>
        Build history unavailable: {error}
      </div>
    );
  }

  if (builds.length === 0) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", padding: "0.75rem", border: "1px dashed var(--border)", borderRadius: "6px" }}>
        No SSR builds yet. The first F144 ephemeral builder run will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {builds.map((b) => {
        const isExpanded = expanded === b.sha;
        const isLive = !TERMINAL_PHASES.has(b.phase);
        return (
          <div key={b.sha} style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
            <button
              onClick={() => setExpanded(isExpanded ? null : b.sha)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.85rem",
              }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <PhaseIcon phase={b.phase} />
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{b.sha.slice(0, 16)}</code>
              <span style={{ color: "var(--muted-foreground)" }}>{PHASE_LABEL[b.phase]}</span>
              {isLive && <Loader2 size={12} className="spin" style={{ color: "var(--primary)" }} />}
              <span style={{ marginLeft: "auto", color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                {fmtTime(b.startedAt)} · {fmtDuration(b)}
              </span>
            </button>
            {isExpanded && detail && (
              <div style={{ padding: "0.5rem 0.75rem 0.75rem 1.75rem", borderTop: "1px solid var(--border)", background: "var(--muted)/0.3" }}>
                {detail.events.map((e, i) => (
                  <div key={i} style={{ fontSize: "0.75rem", display: "flex", gap: "0.5rem", padding: "0.15rem 0" }}>
                    <span style={{ color: "var(--muted-foreground)", minWidth: "5rem" }}>{fmtTime(e.ts)}</span>
                    <span style={{ minWidth: "8rem" }}>{PHASE_LABEL[e.phase]}</span>
                    {e.message && <span style={{ color: "var(--muted-foreground)" }}>{e.message}</span>}
                  </div>
                ))}
                {detail.final?.imageTag && (
                  <div style={{ fontSize: "0.7rem", marginTop: "0.5rem", color: "var(--muted-foreground)" }}>
                    Image: <code style={{ fontFamily: "var(--font-mono)" }}>{detail.final.imageTag}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhaseIcon({ phase }: { phase: BuildSummary["phase"] }){
  if (phase === "done") return <Check size={14} style={{ color: "var(--success, #16a34a)" }} />;
  if (phase === "failed") return <AlertCircle size={14} style={{ color: "var(--destructive)" }} />;
  return <Loader2 size={14} className="spin" style={{ color: "var(--primary)" }} />;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

function fmtDuration(b: BuildSummary): string {
  if (b.durationMs !== undefined) {
    const s = Math.round(b.durationMs / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }
  // In-flight: show wall clock since started
  const elapsed = Date.now() - new Date(b.startedAt).getTime();
  const s = Math.floor(elapsed / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
