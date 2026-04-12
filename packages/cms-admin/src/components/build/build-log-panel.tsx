"use client";

/**
 * F126 Phase 2 — Build Log Panel.
 *
 * Slide-out panel on the right side that streams real-time build output
 * from POST /api/cms/build/execute (NDJSON). Shows stdout/stderr with
 * ANSI color support, status bar, copy/download, and cancel button.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Download, Square, Terminal, Check, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ansiToHtml } from "@/lib/build/ansi-to-html";

// ── Types ────────────────────────────────────────────────────

interface LogLine {
  stream: "stdout" | "stderr";
  line: string;
  timestamp: string;
}

type BuildStatus = "idle" | "running" | "success" | "failed" | "cancelled";

interface ProfileInfo {
  name: string;
  description?: string;
  isDefault: boolean;
}

interface BuildLogPanelProps {
  open: boolean;
  onClose: () => void;
  /** Active profile name to build with. */
  profile?: string;
  /** Available profiles for the profile selector. */
  profiles?: ProfileInfo[];
  /** Callback when user selects a different profile. */
  onProfileChange?: (name: string) => void;
}

// ── Component ────────────────────────────────────────────────

export function BuildLogPanel({ open, onClose, profile, profiles, onProfileChange }: BuildLogPanelProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<BuildStatus>("idle");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [command, setCommand] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const logBodyRef = useRef<HTMLDivElement | null>(null);
  const buildIdRef = useRef(0);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = logBodyRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Start a build
  const startBuild = useCallback(async () => {
    // Cancel any running build
    abortRef.current?.abort();

    const ac = new AbortController();
    abortRef.current = ac;
    const currentBuild = ++buildIdRef.current;

    setLogs([]);
    setStatus("running");
    setExitCode(null);
    setDuration(0);
    setCommand("");
    setAutoScroll(true);

    toast.info(profile ? `Build started (${profile})` : "Build started", { duration: 2000 });

    try {
      const res = await fetch("/api/cms/build/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        // Try to read error from NDJSON response
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text.split("\n")[0]);
          if (parsed.message) errMsg = parsed.message;
        } catch { /* ignore */ }
        if (currentBuild === buildIdRef.current) {
          setStatus("failed");
          toast.error("Build failed", { description: errMsg, duration: 8000 });
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          if (currentBuild !== buildIdRef.current) return;
          try {
            const event = JSON.parse(line);
            handleEvent(event, currentBuild);
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        if (currentBuild === buildIdRef.current) {
          setStatus("cancelled");
          toast.info("Build cancelled", { duration: 3000 });
        }
      } else {
        if (currentBuild === buildIdRef.current) {
          setStatus("failed");
          toast.error("Build failed", {
            description: (err as Error).message,
            duration: 8000,
          });
        }
      }
    }
  }, []);

  const handleEvent = useCallback(
    (event: Record<string, unknown>, buildId: number) => {
      if (buildId !== buildIdRef.current) return;

      switch (event.type) {
        case "start":
          setCommand(event.command as string);
          break;
        case "log":
          setLogs((prev) => [
            ...prev,
            {
              stream: event.stream as "stdout" | "stderr",
              line: event.line as string,
              timestamp: event.timestamp as string,
            },
          ]);
          break;
        case "complete": {
          const success = event.success as boolean;
          setStatus(
            (event.cancelled as boolean)
              ? "cancelled"
              : success
                ? "success"
                : "failed",
          );
          setExitCode(event.exitCode as number);
          setDuration(event.duration as number);
          if (success) {
            toast.success("Build complete", {
              description: `${formatDuration(event.duration as number)}`,
              duration: 5000,
            });
          } else {
            toast.error("Build failed", {
              description: `Exit code ${event.exitCode}`,
              duration: 8000,
            });
          }
          break;
        }
        case "error":
          setStatus("failed");
          toast.error("Build error", {
            description: event.message as string,
            duration: 8000,
          });
          break;
      }
    },
    [],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleCopy = useCallback(() => {
    const text = logs.map((l) => `[${l.stream}] ${l.line}`).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied to clipboard", { duration: 2000 });
    });
  }, [logs]);

  const handleDownload = useCallback(() => {
    const text = logs
      .map((l) => `${l.timestamp} [${l.stream}] ${l.line}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `build-log-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "480px",
        maxWidth: "100vw",
        zIndex: 9999,
        background: "var(--card)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border)",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Terminal
            style={{ width: "0.9rem", height: "0.9rem", color: "var(--muted-foreground)" }}
          />
          <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>Build Log</span>
          <StatusBadge status={status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {status === "running" && (
            <button
              type="button"
              onClick={handleCancel}
              title="Cancel build"
              style={{
                background: "none",
                border: "1px solid var(--destructive)",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--destructive)",
                padding: "0.2rem 0.4rem",
                fontSize: "0.65rem",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <Square style={{ width: "0.6rem", height: "0.6rem" }} />
              Cancel
            </button>
          )}
          {status !== "running" && status !== "idle" && (
            <button
              type="button"
              onClick={startBuild}
              title="Re-run build"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                cursor: "pointer",
                color: "var(--foreground)",
                padding: "0.2rem 0.4rem",
                fontSize: "0.65rem",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <Terminal style={{ width: "0.6rem", height: "0.6rem" }} />
              Re-run
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted-foreground)",
              padding: "0.25rem",
            }}
          >
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>
      </div>

      {/* ── Command bar ── */}
      {command && (
        <div
          style={{
            padding: "0.4rem 1rem",
            fontSize: "0.7rem",
            color: "var(--muted-foreground)",
            borderBottom: "1px solid var(--border)",
            background: "rgba(0,0,0,0.15)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          $ {command}
        </div>
      )}

      {/* ── Profile selector (Phase 3) ── */}
      {profiles && profiles.length > 1 && status !== "running" && (
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.4rem 1rem",
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
          }}
        >
          {profiles.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onProfileChange?.(p.name)}
              style={{
                fontSize: "0.65rem",
                fontWeight: p.name === profile ? 600 : 400,
                padding: "0.2rem 0.5rem",
                borderRadius: "4px",
                border: p.name === profile ? "1px solid var(--foreground)" : "1px solid var(--border)",
                background: p.name === profile ? "var(--accent)" : "transparent",
                color: p.name === profile ? "var(--foreground)" : "var(--muted-foreground)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Log body ── */}
      <div
        ref={logBodyRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0.5rem 0",
          fontSize: "0.7rem",
          lineHeight: 1.5,
        }}
      >
        {status === "idle" && logs.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--muted-foreground)",
              gap: "0.75rem",
            }}
          >
            <Terminal style={{ width: "2rem", height: "2rem", opacity: 0.3 }} />
            <span style={{ fontSize: "0.8rem" }}>No build running</span>
            <button
              type="button"
              onClick={startBuild}
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                border: "none",
                borderRadius: "6px",
                padding: "0.5rem 1.25rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Start Build
            </button>
          </div>
        )}
        {logs.map((l, i) => (
          <div
            key={i}
            style={{
              padding: "0 1rem",
              display: "flex",
              gap: "0.5rem",
              color:
                l.stream === "stderr"
                  ? "var(--destructive)"
                  : "var(--foreground)",
              wordBreak: "break-all",
            }}
          >
            <span
              style={{
                color: "var(--muted-foreground)",
                flexShrink: 0,
                fontSize: "0.6rem",
                opacity: 0.5,
                minWidth: "2.5rem",
                textAlign: "right",
                userSelect: "none",
              }}
            >
              {i + 1}
            </span>
            <span
              dangerouslySetInnerHTML={{ __html: ansiToHtml(l.line) }}
            />
          </div>
        ))}
        {status === "running" && (
          <div
            style={{
              padding: "0.5rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "var(--muted-foreground)",
              fontSize: "0.7rem",
            }}
          >
            <Loader2
              style={{ width: "0.7rem", height: "0.7rem" }}
              className="animate-spin"
            />
            Building...
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 1rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.65rem",
          color: "var(--muted-foreground)",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {exitCode !== null && <span>Exit: {exitCode}</span>}
          {duration > 0 && <span>{formatDuration(duration)}</span>}
          {logs.length > 0 && <span>{logs.length} lines</span>}
        </div>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={logs.length === 0}
            title="Copy logs"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: logs.length === 0 ? "default" : "pointer",
              color: "var(--muted-foreground)",
              padding: "0.2rem 0.4rem",
              display: "flex",
              alignItems: "center",
              gap: "0.2rem",
              opacity: logs.length === 0 ? 0.3 : 1,
            }}
          >
            <Copy style={{ width: "0.6rem", height: "0.6rem" }} />
            Copy
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={logs.length === 0}
            title="Download logs"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: logs.length === 0 ? "default" : "pointer",
              color: "var(--muted-foreground)",
              padding: "0.2rem 0.4rem",
              display: "flex",
              alignItems: "center",
              gap: "0.2rem",
              opacity: logs.length === 0 ? 0.3 : 1,
            }}
          >
            <Download style={{ width: "0.6rem", height: "0.6rem" }} />
            Download
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─�� Helpers ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: BuildStatus }) {
  const config: Record<BuildStatus, { label: string; color: string; bg: string; icon?: React.ReactNode }> =
    {
      idle: { label: "Ready", color: "var(--muted-foreground)", bg: "transparent" },
      running: {
        label: "Running",
        color: "#f0c674",
        bg: "rgba(240,198,116,0.12)",
        icon: <Loader2 style={{ width: "0.55rem", height: "0.55rem" }} className="animate-spin" />,
      },
      success: {
        label: "Success",
        color: "rgb(74 222 128)",
        bg: "rgba(74,222,128,0.12)",
        icon: <Check style={{ width: "0.55rem", height: "0.55rem" }} />,
      },
      failed: {
        label: "Failed",
        color: "var(--destructive)",
        bg: "rgba(229,85,97,0.12)",
        icon: <AlertTriangle style={{ width: "0.55rem", height: "0.55rem" }} />,
      },
      cancelled: {
        label: "Cancelled",
        color: "var(--muted-foreground)",
        bg: "rgba(128,128,128,0.12)",
        icon: <Square style={{ width: "0.55rem", height: "0.55rem" }} />,
      },
    };

  const c = config[status];
  if (status === "idle") return null;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6rem",
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        padding: "0.1rem 0.4rem",
        borderRadius: "4px",
        fontFamily: "monospace",
      }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}
