"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Check, Sparkles, AlertTriangle } from "lucide-react";
import { SettingsCard } from "./settings-card";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";

interface AiDefaults {
  aiContentModel: string;
  aiContentMaxTokens: number;
  aiCodeModel: string;
  aiInteractivesMaxTokens: number;
  aiPremiumModel: string;
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

const CHAT_TOKEN_OPTIONS = [
  { value: "4096", label: "4,096 — standard" },
  { value: "8192", label: "8,192 — recommended" },
  { value: "16384", label: "16,384 — long responses" },
  { value: "32768", label: "32,768 — maximum" },
];

const ITERATION_OPTIONS = [
  { value: "10", label: "10 — simple tasks" },
  { value: "15", label: "15 — moderate tasks" },
  { value: "25", label: "25 — complex multi-step" },
  { value: "40", label: "40 — very complex workflows" },
  { value: "50", label: "50 — maximum" },
];

export function AIDefaultsPanel() {
  const [config, setConfig] = useState<AiDefaults>({
    aiContentModel: "claude-haiku-4-5-20251001",
    aiContentMaxTokens: 4096,
    aiCodeModel: "claude-sonnet-4-6",
    aiInteractivesMaxTokens: 16384,
    aiPremiumModel: "claude-opus-4-6",
    aiChatModel: "claude-sonnet-4-6",
    aiChatMaxTokens: 16384,
    aiChatMaxToolIterations: 25,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => {
        setConfig((prev) => ({
          ...prev,
          // Map old field names to new ones for backwards compat
          aiContentModel: String(d.aiContentModel ?? prev.aiContentModel),
          aiContentMaxTokens: Number(d.aiContentMaxTokens ?? prev.aiContentMaxTokens),
          aiCodeModel: String(d.aiCodeModel ?? d.aiInteractivesModel ?? prev.aiCodeModel),
          aiInteractivesMaxTokens: Number(d.aiInteractivesMaxTokens ?? prev.aiInteractivesMaxTokens),
          aiPremiumModel: String(d.aiPremiumModel ?? prev.aiPremiumModel),
          aiChatModel: String(d.aiChatModel ?? prev.aiChatModel),
          aiChatMaxTokens: Number(d.aiChatMaxTokens ?? prev.aiChatMaxTokens),
          aiChatMaxToolIterations: Number(d.aiChatMaxToolIterations ?? prev.aiChatMaxToolIterations),
        }));
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
        aiContentModel: config.aiContentModel,
        aiContentMaxTokens: config.aiContentMaxTokens,
        aiCodeModel: config.aiCodeModel,
        aiInteractivesModel: config.aiCodeModel, // keep legacy field in sync
        aiInteractivesMaxTokens: config.aiInteractivesMaxTokens,
        aiPremiumModel: config.aiPremiumModel,
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
      {/* Content — cheap/fast text tasks */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>Content (SEO, Rewrite, Proofread)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for SEO optimization, text rewriting, proofreading, and link fixing. Haiku is fast and affordable for these tasks.
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

      {/* Code — smart tasks */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>Code (Interactives, Generate, Agents)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for HTML interactives, content generation, and AI agent creation. Sonnet is recommended — best balance of quality and cost.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiCodeModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiCodeModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens (interactives)
            </label>
            <CustomSelect
              value={String(config.aiInteractivesMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Premium — highest quality */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>Premium (Brand Voice)</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for brand voice analysis and translation. Opus delivers the highest quality for nuanced creative work.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiPremiumModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiPremiumModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Chat — full-screen AI assistant */}
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
              options={CHAT_TOKEN_OPTIONS}
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
        <span>Changing models affects AI quality and cost. Higher-tier models produce better results but cost more per request. The built-in defaults are recommended for most use cases.</span>
      </div>
      </SettingsCard>
    </form>
  );
}
