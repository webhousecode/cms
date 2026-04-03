"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Rocket, Check, Loader2, ExternalLink, AlertCircle, Copy } from "lucide-react";
import { SectionHeading } from "@/components/ui/section-heading";
import type { WizardState } from "./deploy-wizard";

interface ProgressEvent {
  step: string;
  message: string;
  progress: number;
  status: "running" | "done" | "error";
  url?: string;
  error?: string;
}

const STEPS = [
  { key: "init", label: "Validating" },
  { key: "create-app", label: "Creating app" },
  { key: "set-secrets", label: "Setting secrets" },
  { key: "create-machine", label: "Deploying container" },
  { key: "wait-healthy", label: "Starting" },
  { key: "allocate-ip", label: "Allocating IPs" },
  { key: "done", label: "Live" },
];

interface Props {
  state: WizardState;
}

export function StepDeploy({ state }: Props) {
  const [deploying, setDeploying] = useState(false);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<ProgressEvent | null>(null);
  const [started, setStarted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setEvents([]);
    setCurrentEvent(null);
    setStarted(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/admin/deploy/docker-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: state.template,
          appName: state.appName,
          region: state.region,
          vmSize: state.vmSize,
          flyToken: state.flyToken,
          flyOrg: state.flyOrg,
          adminEmail: state.adminEmail || "admin@webhouse.app",
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "Deploy failed");
        setCurrentEvent({ step: "error", message: text, progress: 100, status: "error" });
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
  }, [state]);

  // Auto-start on mount
  useEffect(() => {
    if (!started) {
      handleDeploy();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = currentEvent?.progress ?? 0;
  const isDone = currentEvent?.status === "done";
  const isError = currentEvent?.status === "error";
  const finalUrl = currentEvent?.url;

  return (
    <div>
      <SectionHeading>Deploying to Fly.io</SectionHeading>

      {/* Progress bar */}
      <div style={{
        height: 6,
        borderRadius: 3,
        background: "var(--muted)",
        overflow: "hidden",
        marginBottom: "1.5rem",
      }}>
        <div style={{
          height: "100%",
          borderRadius: 3,
          background: isError ? "var(--destructive)" : isDone ? "rgb(74 222 128)" : "#F7BB2E",
          width: `${progress}%`,
          transition: "width 0.5s ease, background 0.3s",
        }} />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
        {STEPS.map((step) => {
          const event = events.find((e) => e.step === step.key);
          const isCurrent = currentEvent?.step === step.key;
          const currentIdx = STEPS.findIndex((s) => s.key === currentEvent?.step);
          const stepIdx = STEPS.findIndex((s) => s.key === step.key);
          const isCompleted = currentIdx > stepIdx;
          const isActive = isCurrent || isCompleted;

          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: isCompleted ? "rgb(74 222 128)" : isCurrent ? "#F7BB2E" : "var(--muted)",
              }}>
                {isCompleted ? (
                  <Check style={{ width: 12, height: 12, color: "#fff" }} />
                ) : isCurrent && deploying ? (
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12, color: "#0D0D0D" }} />
                ) : isCurrent && isDone ? (
                  <Check style={{ width: 12, height: 12, color: "#0D0D0D" }} />
                ) : (
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--muted-foreground)", opacity: 0.4 }} />
                )}
              </div>
              <span style={{
                fontSize: "0.78rem",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current status */}
      <div style={{
        fontSize: "0.72rem",
        color: "var(--muted-foreground)",
        fontFamily: "monospace",
        padding: "0.5rem 0.6rem",
        background: "var(--background)",
        borderRadius: 6,
        border: "1px solid var(--border)",
        minHeight: "1.5rem",
      }}>
        {currentEvent?.message ?? "Initializing..."}
      </div>

      {/* Error */}
      {isError && (
        <div style={{
          marginTop: "1rem",
          padding: "0.75rem",
          borderRadius: 8,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
        }}>
          <AlertCircle style={{ width: 16, height: 16, color: "var(--destructive)", flexShrink: 0, marginTop: "0.1rem" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--destructive)", lineHeight: 1.4 }}>
            {currentEvent?.error ?? "Deploy failed"}
          </span>
        </div>
      )}

      {/* Success */}
      {isDone && finalUrl && (
        <div style={{ marginTop: "1.5rem" }}>
          <a
            href={finalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              padding: "0.6rem",
              borderRadius: 8,
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              color: "rgb(74 222 128)",
              fontSize: "0.85rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <ExternalLink style={{ width: 16, height: 16 }} />
            {finalUrl}
          </a>

          <div style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            background: "var(--muted)",
            border: "1px solid var(--border)",
          }}>
            <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
              Admin credentials (save these!)
            </p>
            <div style={{ fontSize: "0.78rem", fontFamily: "monospace", lineHeight: 1.8 }}>
              <div>Email: {state.adminEmail || "admin@webhouse.app"}</div>
              <div>Password: <em style={{ color: "var(--muted-foreground)" }}>check Fly.io secrets</em></div>
            </div>
            <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.5rem" }}>
              Run <code style={{ fontSize: "0.65rem", padding: "1px 3px", borderRadius: 3, background: "var(--background)" }}>fly secrets list -a {state.appName}</code> to see the generated password.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
