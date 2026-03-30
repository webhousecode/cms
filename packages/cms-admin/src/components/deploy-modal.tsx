"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Rocket, X, Check, Loader2, ExternalLink, AlertCircle } from "lucide-react";

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
  /** If true, skip setup guide — provider is already configured */
  configured: boolean;
  /** Effective provider label (e.g. "GitHub Pages", "Fly.io") */
  providerLabel: string;
  /** App name or repo */
  appName?: string;
  /** Production URL (shown after success) */
  productionUrl?: string;
  /** Whether auto-deploy on save is enabled */
  deployOnSave: boolean;
}

interface ProgressEvent {
  step: string;
  message: string;
  progress: number;
  status: "running" | "done" | "error";
  url?: string;
  error?: string;
}

const STEPS = [
  { key: "init", label: "Initializing" },
  { key: "build", label: "Building & optimizing" },
  { key: "push", label: "Pushing to provider" },
  { key: "done", label: "Live" },
];

export function DeployModal({ open, onClose, configured, providerLabel, appName, productionUrl, deployOnSave }: DeployModalProps) {
  const [deploying, setDeploying] = useState(false);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<ProgressEvent | null>(null);
  const [skipDialog, setSkipDialog] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("cms-deploy-skip-dialog") === "true";
    return false;
  });
  const abortRef = useRef<AbortController | null>(null);

  // Auto-start deploy if dialog should be skipped
  useEffect(() => {
    if (open && configured && skipDialog && !deploying) {
      handleDeploy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setEvents([]);
    setCurrentEvent(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/admin/deploy/stream", {
        method: "POST",
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setCurrentEvent({ step: "error", message: `Deploy failed: ${res.status}`, progress: 100, status: "error" });
        setDeploying(false);
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
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as ProgressEvent;
              setCurrentEvent(event);
              setEvents((prev) => [...prev, event]);
            } catch { /* malformed JSON */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setCurrentEvent({ step: "error", message: String(err), progress: 100, status: "error" });
      }
    }

    setDeploying(false);
  }, []);

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
    // Reset state for next open
    setTimeout(() => {
      setEvents([]);
      setCurrentEvent(null);
      setDeploying(false);
    }, 300);
  };

  if (!open) return null;

  const progress = currentEvent?.progress ?? 0;
  const isDone = currentEvent?.status === "done";
  const isError = currentEvent?.status === "error";
  const finalUrl = currentEvent?.url ?? productionUrl;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "16px", padding: "2rem", width: "28rem",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Rocket style={{ width: "1.1rem", height: "1.1rem", color: "var(--primary)" }} />
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              {deploying || isDone || isError ? "Deploying" : "Deploy Site"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--muted-foreground)", padding: "0.25rem",
            }}
          >
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* Pre-deploy: confirmation */}
        {!deploying && !isDone && !isError && (
          <>
            <div style={{
              padding: "1rem", borderRadius: "10px", marginBottom: "1.25rem",
              background: "color-mix(in srgb, var(--primary) 6%, transparent)",
              border: "1px solid color-mix(in srgb, var(--primary) 15%, transparent)",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.5rem" }}>
                {providerLabel}{appName ? ` — ${appName}` : ""}
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.8 }}>
                <li>Build static pages from content</li>
                <li>Generate sitemap, robots.txt, llms.txt, RSS feed</li>
                <li>Optimize SEO (OpenGraph, JSON-LD, meta tags)</li>
                <li>Push to {providerLabel}</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleDeploy}
              style={{
                width: "100%", padding: "0.6rem", borderRadius: "8px",
                border: "none", background: "var(--primary)", color: "#fff",
                fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
              }}
            >
              <Rocket style={{ width: "0.9rem", height: "0.9rem" }} />
              Deploy now
            </button>

            <label style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              marginTop: "1rem", cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={skipDialog}
                onChange={(e) => {
                  setSkipDialog(e.target.checked);
                  localStorage.setItem("cms-deploy-skip-dialog", String(e.target.checked));
                }}
                style={{ accentColor: "var(--primary)" }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                Don't show this dialog — deploy immediately
              </span>
            </label>
          </>
        )}

        {/* Deploying: progress */}
        {(deploying || isDone || isError) && (
          <>
            {/* Progress bar */}
            <div style={{
              height: "6px", borderRadius: "3px",
              background: "var(--muted)", overflow: "hidden",
              marginBottom: "1.25rem",
            }}>
              <div style={{
                height: "100%", borderRadius: "3px",
                background: isError ? "var(--destructive)" : isDone ? "rgb(74 222 128)" : "var(--primary)",
                width: `${progress}%`,
                transition: "width 0.5s ease, background 0.3s",
              }} />
            </div>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {STEPS.map((step) => {
                const event = events.find((e) => e.step === step.key);
                const isCurrent = currentEvent?.step === step.key;
                const isCompleted = event && !isCurrent && currentEvent && STEPS.findIndex(s => s.key === currentEvent.step) > STEPS.findIndex(s => s.key === step.key);
                const isActive = isCurrent || isCompleted;

                return (
                  <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{
                      width: "1.25rem", height: "1.25rem", borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                      background: isCompleted ? "rgb(74 222 128)" : isCurrent ? "var(--primary)" : "var(--muted)",
                    }}>
                      {isCompleted ? (
                        <Check style={{ width: "0.7rem", height: "0.7rem", color: "#fff" }} />
                      ) : isCurrent && deploying ? (
                        <Loader2 className="animate-spin" style={{ width: "0.7rem", height: "0.7rem", color: "#fff" }} />
                      ) : isCurrent && isDone ? (
                        <Check style={{ width: "0.7rem", height: "0.7rem", color: "#fff" }} />
                      ) : (
                        <span style={{ width: "0.35rem", height: "0.35rem", borderRadius: "50%", background: "var(--muted-foreground)", opacity: 0.4 }} />
                      )}
                    </div>
                    <span style={{
                      fontSize: "0.8rem",
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
                    }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Current status message */}
            <div style={{
              fontSize: "0.72rem", color: "var(--muted-foreground)",
              fontFamily: "monospace", padding: "0.5rem 0.6rem",
              background: "var(--background)", borderRadius: "6px",
              border: "1px solid var(--border)",
              minHeight: "1.5rem",
            }}>
              {currentEvent?.message ?? "Waiting..."}
            </div>

            {/* Error */}
            {isError && (
              <div style={{
                marginTop: "0.75rem", padding: "0.6rem", borderRadius: "8px",
                background: "color-mix(in srgb, var(--destructive) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--destructive) 30%, transparent)",
                display: "flex", alignItems: "flex-start", gap: "0.5rem",
              }}>
                <AlertCircle style={{ width: "0.85rem", height: "0.85rem", color: "var(--destructive)", flexShrink: 0, marginTop: "0.1rem" }} />
                <span style={{ fontSize: "0.72rem", color: "var(--destructive)", lineHeight: 1.4 }}>
                  {currentEvent?.error ?? "Deploy failed"}
                </span>
              </div>
            )}

            {/* Success */}
            {isDone && finalUrl && (
              <a
                href={finalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                  marginTop: "1rem", padding: "0.5rem", borderRadius: "8px",
                  background: "color-mix(in srgb, rgb(74 222 128) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, rgb(74 222 128) 25%, transparent)",
                  color: "rgb(74 222 128)", fontSize: "0.8rem", fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                <ExternalLink style={{ width: "0.8rem", height: "0.8rem" }} />
                {finalUrl}
              </a>
            )}

            {/* Close button when done/error */}
            {(isDone || isError) && (
              <button
                type="button"
                onClick={handleClose}
                style={{
                  width: "100%", marginTop: "1rem", padding: "0.5rem",
                  borderRadius: "8px", border: "1px solid var(--border)",
                  background: "transparent", color: "var(--foreground)",
                  fontSize: "0.8rem", cursor: "pointer",
                }}
              >
                Close
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
