"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Check, Sparkles, AlertTriangle } from "lucide-react";
import { SettingsCard } from "./settings-card";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";

interface AiDefaults {
  aiInteractivesModel: string;
  aiInteractivesMaxTokens: number;
  aiContentModel: string;
  aiContentMaxTokens: number;
  aiChatModel: string;
  aiChatMaxTokens: number;
  aiChatMaxToolIterations: number;
}

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast, affordable" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — best for code" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6 — most capable" },
];

const TOKEN_OPTIONS = [
  { value: "2048", label: "2,048 — short content" },
  { value: "4096", label: "4,096 — standard content" },
  { value: "8192", label: "8,192 — long content" },
  { value: "16384", label: "16,384 — large HTML/code" },
];

const ITERATION_OPTIONS = [
  { value: "10", label: "10 — simple tasks" },
  { value: "15", label: "15 — moderate tasks" },
  { value: "25", label: "25 — complex multi-step" },
  { value: "40", label: "40 — very complex workflows" },
];

const fieldStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "7px",
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "0.8rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

export function AIDefaultsPanel() {
  const [config, setConfig] = useState<AiDefaults>({
    aiInteractivesModel: "claude-sonnet-4-6",
    aiInteractivesMaxTokens: 16384,
    aiContentModel: "claude-haiku-4-5-20251001",
    aiContentMaxTokens: 4096,
    aiChatModel: "claude-sonnet-4-6",
    aiChatMaxTokens: 8192,
    aiChatMaxToolIterations: 25,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d: AiDefaults) => {
        setConfig((prev) => ({ ...prev, ...d }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiInteractivesModel: config.aiInteractivesModel,
        aiInteractivesMaxTokens: config.aiInteractivesMaxTokens,
        aiContentModel: config.aiContentModel,
        aiContentMaxTokens: config.aiContentMaxTokens,
        aiChatModel: config.aiChatModel,
        aiChatMaxTokens: config.aiChatMaxTokens,
        aiChatMaxToolIterations: config.aiChatMaxToolIterations,
      }),
    });
    setSaving(false);
    setSaved(true);
    toast.success("AI defaults saved");
    setTimeout(() => setSaved(false), 2500);
    window.dispatchEvent(new CustomEvent("cms:settings-saved"));
  }

  const defaultsFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    function onSave() { defaultsFormRef.current?.requestSubmit(); }
    window.addEventListener("cms:settings-save", onSave);
    return () => window.removeEventListener("cms:settings-save", onSave);
  }, []);

  if (loading) {
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</p>;
  }

  return (
    <form ref={defaultsFormRef} onSubmit={handleSave} onChange={() => window.dispatchEvent(new CustomEvent("cms:settings-dirty"))}>
      <SettingsCard>
      {/* Interactives section */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>Interactives (Generate &amp; Edit with AI)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used when creating or editing HTML interactives. Sonnet is recommended for complex code generation. Higher token limits prevent truncated output on large files.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiInteractivesModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens
            </label>
            <CustomSelect
              value={String(config.aiInteractivesMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Content writing section */}
      <div style={{ marginBottom: "1.5rem" }}>
        <SectionHeading>Content Writing (Chat, Generate, Rewrite)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for in-editor AI chat, article generation, and text rewriting. Haiku is usually sufficient for text content.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiContentModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens
            </label>
            <CustomSelect
              value={String(config.aiContentMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Chat section */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>Chat (AI Assistant)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for the full-screen Chat mode. Higher token limits and more tool iterations allow complex multi-step tasks like creating multiple posts with scheduling.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiChatModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens per response
            </label>
            <CustomSelect
              value={String(config.aiChatMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tool iterations per message
            </label>
            <CustomSelect
              value={String(config.aiChatMaxToolIterations)}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatMaxToolIterations: parseInt(v, 10) }))}
              options={ITERATION_OPTIONS}
            />
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.3rem" }}>
              Each tool call (search, create, schedule) counts as one iteration. Complex tasks may need 25+.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", marginBottom: "1.25rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
        <AlertTriangle style={{ width: "0.875rem", height: "0.875rem", color: "#eab308", flexShrink: 0 }} />
        <span>Changing models affects AI quality and cost. Sonnet produces better code but costs more per request. These are defaults — the built-in values are recommended for most use cases.</span>
      </div>
      </SettingsCard>
    </form>
  );
}
