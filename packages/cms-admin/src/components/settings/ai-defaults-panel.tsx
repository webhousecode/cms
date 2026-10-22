"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Check, Sparkles, AlertTriangle } from "lucide-react";
import { SettingsCard } from "./settings-card";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { listModels } from "@broberg/ai-sdk/registry";
import { DEFAULTS } from "@/lib/ai/model-defaults";
import { useT } from "@/lib/i18n-context";

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

/**
 * The models this CMS can actually run.
 *
 * Every AI call is pinned to the Mistral (EU/GDPR) provider, and cms-admin
 * wires up exactly three adapters — mistral, gemini, openai. There is no
 * Anthropic adapter at all. This list used to offer five Claude ids and nothing
 * else, so every model an admin could pick was one the system could not use:
 * sanneandersen.dk and webhouse-site both ended up with a Claude id stored, and
 * bulk SEO optimisation failed on every single document with "Invalid model".
 * One of the five (claude-opus-4-6) did not exist in the model registry either.
 *
 * Sourced from the shared registry rather than retyped, so a model that is
 * retired or suspended fleet-wide stops being offered here without an edit.
 */
const MODEL_LABELS: Record<string, string> = {
  "mistral-small-latest": "settings.aiDefaults.modelMistralSmall",
  "mistral-large-latest": "settings.aiDefaults.modelMistralLarge",
};

const MODEL_OPTIONS = listModels()
  .filter((m) => m.provider === "mistral" && m.available)
  .map((m) => ({ value: m.id, labelKey: MODEL_LABELS[m.id] }));

const TOKEN_OPTIONS = [
  { value: "2048", label: "settings.aiDefaults.tokensShort" },
  { value: "4096", label: "settings.aiDefaults.tokensStandard" },
  { value: "8192", label: "settings.aiDefaults.tokensLong" },
  { value: "16384", label: "settings.aiDefaults.tokensLarge" },
];

const CHAT_TOKEN_OPTIONS = [
  { value: "4096", label: "settings.aiDefaults.chatTokensStandard" },
  { value: "8192", label: "settings.aiDefaults.chatTokensRecommended" },
  { value: "16384", label: "settings.aiDefaults.chatTokensLong" },
  { value: "32768", label: "settings.aiDefaults.chatTokensMax" },
];

const ITERATION_OPTIONS = [
  { value: "10", label: "settings.aiDefaults.iterSimple" },
  { value: "15", label: "settings.aiDefaults.iterModerate" },
  { value: "25", label: "settings.aiDefaults.iterComplex" },
  { value: "40", label: "settings.aiDefaults.iterVeryComplex" },
  { value: "50", label: "settings.aiDefaults.iterMax" },
];

export function AIDefaultsPanel() {
  const t = useT();
  const modelOptions = MODEL_OPTIONS.map((m) => ({ value: m.value, label: m.labelKey ? t(m.labelKey) : m.value }));
  const translated = (list: { value: string; label: string }[]) => list.map((o) => ({ value: o.value, label: t(o.label) }));
  const [config, setConfig] = useState<AiDefaults>({
    aiContentModel: DEFAULTS.content,
    aiContentMaxTokens: 4096,
    aiCodeModel: DEFAULTS.code,
    aiInteractivesMaxTokens: 16384,
    aiPremiumModel: DEFAULTS.premium,
    aiChatModel: DEFAULTS.code,
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
    toast.success(t("settings.aiDefaults.saved"));
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
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{t("settings.common.loading")}</p>;
  }

  return (
    <form data-testid="panel-ai-defaults" ref={defaultsFormRef} onSubmit={handleSave} onChange={() => window.dispatchEvent(new CustomEvent("cms:settings-dirty"))}>
      <SettingsCard>
      {/* Content — cheap/fast text tasks */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>{t("settings.aiDefaults.contentHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {t("settings.aiDefaults.contentHint")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.model")}
            </label>
            <CustomSelect
              value={config.aiContentModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentModel: v }))}
              options={modelOptions}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.maxTokens")}
            </label>
            <CustomSelect
              value={String(config.aiContentMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentMaxTokens: parseInt(v, 10) }))}
              options={translated(TOKEN_OPTIONS)}
            />
          </div>
        </div>
      </div>

      {/* Code — smart tasks */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>{t("settings.aiDefaults.codeHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {t("settings.aiDefaults.codeHint")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.model")}
            </label>
            <CustomSelect
              value={config.aiCodeModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiCodeModel: v }))}
              options={modelOptions}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.maxTokensInteractives")}
            </label>
            <CustomSelect
              value={String(config.aiInteractivesMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(v, 10) }))}
              options={translated(TOKEN_OPTIONS)}
            />
          </div>
        </div>
      </div>

      {/* Premium — highest quality */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>{t("settings.aiDefaults.premiumHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {t("settings.aiDefaults.premiumHint")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.model")}
            </label>
            <CustomSelect
              value={config.aiPremiumModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiPremiumModel: v }))}
              options={modelOptions}
            />
          </div>
        </div>
      </div>

      {/* Chat — full-screen AI assistant */}
      <div style={{ marginBottom: "2rem" }}>
        <SectionHeading>{t("settings.aiDefaults.chatHeading")}</SectionHeading>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          {t("settings.aiDefaults.chatHint")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.model")}
            </label>
            <CustomSelect
              value={config.aiChatModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatModel: v }))}
              options={modelOptions}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.maxTokensPerResponse")}
            </label>
            <CustomSelect
              value={String(config.aiChatMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatMaxTokens: parseInt(v, 10) }))}
              options={translated(CHAT_TOKEN_OPTIONS)}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              {t("settings.aiDefaults.maxToolIterations")}
            </label>
            <CustomSelect
              value={String(config.aiChatMaxToolIterations)}
              onChange={(v) => setConfig((c) => ({ ...c, aiChatMaxToolIterations: parseInt(v, 10) }))}
              options={translated(ITERATION_OPTIONS)}
            />
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.3rem" }}>
              {t("settings.aiDefaults.iterationsHint")}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "8px", background: "color-mix(in srgb, var(--status-warning) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)", marginBottom: "1.25rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
        <AlertTriangle style={{ width: "0.875rem", height: "0.875rem", color: "var(--status-warning)", flexShrink: 0 }} />
        <span>{t("settings.aiDefaults.warning")}</span>
      </div>
      </SettingsCard>
    </form>
  );
}
