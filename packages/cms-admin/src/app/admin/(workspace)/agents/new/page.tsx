"use client";

import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles, Send, ChevronDown, BookOpen, Globe, HardDrive } from "lucide-react";
import { useEffect } from "react";
import type { AgentTemplate } from "@/lib/agent-templates";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTimeInput } from "@/components/ui/custom-time-input";
import { CustomRangeSlider } from "@/components/ui/custom-range-slider";
import { Checkbox, Radio } from "@/components/ui/checkbox-styled";
import { useT } from "@/lib/i18n-context";

const ROLES = [
  { value: "copywriter", labelKey: "pages.agentEdit.roles.copywriter" },
  { value: "seo", labelKey: "pages.agentEdit.roles.seo" },
  { value: "geo", labelKey: "pages.agentEdit.roles.geo" },
  { value: "translator", labelKey: "pages.agentEdit.roles.translator" },
  { value: "refresher", labelKey: "pages.agentEdit.roles.refresher" },
  { value: "custom", labelKey: "pages.agentEdit.roles.custom" },
] as const;

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  display: "block",
  marginBottom: "0.375rem",
  color: "var(--foreground)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  borderRadius: "7px",
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box",
};

export default function NewAgentPage() {
  const t = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // AI description chat
  const [description, setDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [formFilled, setFormFilled] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("copywriter");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(70);
  const [formality, setFormality] = useState(50);
  const [verbosity, setVerbosity] = useState(60);
  const [webSearch, setWebSearch] = useState(false);
  const [internalDatabase, setInternalDatabase] = useState(false);
  const [autonomy, setAutonomy] = useState<"draft" | "full">("draft");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "manual">(
    "daily"
  );
  const [time, setTime] = useState("06:00");
  const [maxPerRun, setMaxPerRun] = useState(3);
  const [active, setActive] = useState(true);

  // Phase 6 — template library
  const [localTemplates, setLocalTemplates] = useState<AgentTemplate[]>([]);
  const [marketplaceTemplates, setMarketplaceTemplates] = useState<AgentTemplate[]>([]);
  const [marketplaceError, setMarketplaceError] = useState<string | undefined>(undefined);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const searchParams = useSearchParams();

  useEffect(() => {
    fetch("/api/cms/agent-templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const local = data.local ?? [];
        const market = data.marketplace ?? [];
        setLocalTemplates(local);
        setMarketplaceTemplates(market);
        setMarketplaceError(data.marketplaceError);

        // ?template=<id> deep link from the Command Palette / marketplace
        // cards in the Templates tab. Find it in either pool and pre-fill.
        const wantedId = searchParams.get("template");
        if (wantedId) {
          const found = [...local, ...market].find((tpl: AgentTemplate) => tpl.id === wantedId);
          if (found) applyTemplate(found);
        }
      })
      .catch(() => {})
      .finally(() => setTemplatesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(template: AgentTemplate) {
    const p = template.payload as Record<string, unknown>;
    if (typeof p.name === "string") setName(p.name);
    if (typeof p.role === "string") setRole(p.role);
    if (typeof p.systemPrompt === "string") setSystemPrompt(p.systemPrompt);
    const beh = p.behavior as { temperature?: number; formality?: number; verbosity?: number } | undefined;
    if (beh?.temperature !== undefined) setTemperature(beh.temperature);
    if (beh?.formality !== undefined) setFormality(beh.formality);
    if (beh?.verbosity !== undefined) setVerbosity(beh.verbosity);
    const tools = p.tools as { webSearch?: boolean; internalDatabase?: boolean } | undefined;
    if (tools?.webSearch !== undefined) setWebSearch(tools.webSearch);
    if (tools?.internalDatabase !== undefined) setInternalDatabase(tools.internalDatabase);
    if (p.autonomy === "draft" || p.autonomy === "full") setAutonomy(p.autonomy);
    setFormFilled(true);
    setFormCollapsed(false);
    // Smooth scroll to the form so the user sees what was filled in
    setTimeout(() => {
      document.getElementById("agent-form-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function handleDescribe() {
    if (!description.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/cms/agents/create-from-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok || !data.config) {
        setAiError(data.error ?? t("pages.agentNew.failedGenerate"));
        return;
      }
      const c = data.config;
      if (c.name) setName(c.name);
      if (c.role) setRole(c.role);
      if (c.systemPrompt) setSystemPrompt(c.systemPrompt);
      if (c.behavior) {
        if (c.behavior.temperature !== undefined) setTemperature(c.behavior.temperature);
        if (c.behavior.formality !== undefined) setFormality(c.behavior.formality);
        if (c.behavior.verbosity !== undefined) setVerbosity(c.behavior.verbosity);
      }
      if (c.tools) {
        if (c.tools.webSearch !== undefined) setWebSearch(c.tools.webSearch);
        if (c.tools.internalDatabase !== undefined) setInternalDatabase(c.tools.internalDatabase);
      }
      if (c.autonomy) setAutonomy(c.autonomy);
      if (c.schedule) {
        if (c.schedule.enabled !== undefined) setScheduleEnabled(c.schedule.enabled);
        if (c.schedule.frequency) setFrequency(c.schedule.frequency);
        if (c.schedule.time) setTime(c.schedule.time);
        if (c.schedule.maxPerRun) setMaxPerRun(c.schedule.maxPerRun);
      }
      if (c.active !== undefined) setActive(c.active);
      setFormFilled(true);
      setFormCollapsed(false);
    } catch {
      setAiError(t("pages.agentEdit.networkError"));
    } finally {
      setAiLoading(false);
    }
  }

  function handleDescribeKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleDescribe();
    }
  }

  async function handleGeneratePrompt() {
    setGenerating(true);
    try {
      const res = await fetch("/api/cms/agents/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name, collections: [] }),
      });
      const data = await res.json();
      if (data.prompt) setSystemPrompt(data.prompt);
      else if (data.error) setError(data.error);
    } catch {
      setError(t("pages.agentEdit.failedGeneratePrompt"));
    }
    setGenerating(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t("pages.agentNew.nameRequired"));
      return;
    }
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/cms/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          systemPrompt,
          behavior: { temperature, formality, verbosity },
          tools: { webSearch, internalDatabase },
          autonomy,
          targetCollections: [],
          schedule: { enabled: scheduleEnabled, frequency, time, maxPerRun },
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("pages.agentNew.failedCreate"));
        setSaving(false);
        return;
      }
      router.push(`/admin/agents/${data.id}`);
    } catch {
      setError(t("pages.agentEdit.networkError"));
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          {t("pages.agentNew.agents")}
        </p>
        <h1 className="text-2xl font-bold text-foreground">{t("pages.agentNew.newAgent")}</h1>
      </div>

      {/* ── AI describe-to-create panel ─────────────────────────── */}
      <div
        style={{
          marginBottom: "2rem",
          borderRadius: "12px",
          border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))",
          background: "color-mix(in srgb, var(--primary) 4%, var(--card))",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.875rem 1rem 0.75rem" }}>
          <Sparkles style={{ width: "15px", height: "15px", color: "var(--primary)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", flex: 1 }}>
            {t("pages.agentNew.describeAgent")}
          </span>
          {formFilled && (
            <button
              data-testid="agent-toggle-form-button"
              type="button"
              onClick={() => setFormCollapsed((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {formCollapsed ? t("pages.agentNew.showForm") : t("pages.agentNew.hideForm")}
              <ChevronDown style={{ width: "12px", height: "12px", transform: formCollapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }} />
            </button>
          )}
        </div>

        {/* Input area */}
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <textarea
            data-testid="agent-describe-textarea"
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleDescribeKey}
            rows={3}
            placeholder={t("pages.agentNew.describePlaceholder")}
            style={{
              width: "100%",
              padding: "0.625rem 0.75rem",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--background)",
              color: "var(--foreground)",
              fontSize: "0.85rem",
              outline: "none",
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.5,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              data-testid="agent-generate-button"
              type="button"
              onClick={handleDescribe}
              disabled={aiLoading || !description.trim()}
              style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                padding: "0.45rem 1rem", borderRadius: "7px", border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontSize: "0.8rem", fontWeight: 600, cursor: aiLoading || !description.trim() ? "not-allowed" : "pointer",
                opacity: aiLoading || !description.trim() ? 0.6 : 1,
                transition: "opacity 150ms",
              }}
            >
              {aiLoading
                ? <><Loader2 style={{ width: "13px", height: "13px" }} className="animate-spin" /> {t("pages.agentNew.generating")}</>
                : <><Send style={{ width: "13px", height: "13px" }} /> {t("pages.agentNew.generateAgent")}</>
              }
            </button>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>⌘ Enter</span>
            {formFilled && !aiLoading && (
              <span style={{ fontSize: "0.72rem", color: "hsl(142 71% 45%)", marginLeft: "auto" }}>
                {t("pages.agentNew.formFilled")}
              </span>
            )}
          </div>

          {aiError && (
            <p style={{ fontSize: "0.75rem", color: "var(--destructive)", margin: 0 }}>{aiError}</p>
          )}
        </div>
      </div>

      {/* ── Template library (Phase 6) ──────────────────────────── */}
      {!templatesLoading && (localTemplates.length > 0 || marketplaceTemplates.length > 0 || marketplaceError) && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <BookOpen style={{ width: "14px", height: "14px", color: "var(--muted-foreground)" }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
              {t("pages.agentNew.startFromTemplate")}
            </span>
          </div>

          {localTemplates.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <HardDrive style={{ width: "10px", height: "10px" }} />
                {t("pages.agentNew.yourOrg", { count: localTemplates.length })}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.625rem" }}>
                {localTemplates.map((tpl) => (
                  <button
                    data-testid={`agent-template-local-${tpl.id}`}
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    style={{
                      textAlign: "left", padding: "0.75rem 0.875rem", borderRadius: "8px",
                      border: "1px solid var(--border)", background: "var(--card)",
                      color: "var(--foreground)", cursor: "pointer", transition: "all 150ms",
                    }}
                    className="hover:border-primary hover:bg-primary/5"
                  >
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, margin: 0, marginBottom: "0.2rem" }}>
                      {tpl.icon ? `${tpl.icon} ` : ""}{tpl.name}
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0, lineHeight: 1.4 }}>
                      {tpl.description || t("pages.agentNew.localTemplate")}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {marketplaceTemplates.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)", marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Globe style={{ width: "10px", height: "10px" }} />
                {t("pages.agentNew.marketplace", { count: marketplaceTemplates.length })}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.625rem" }}>
                {marketplaceTemplates.map((tpl) => (
                  <button
                    data-testid={`agent-template-marketplace-${tpl.id}`}
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    style={{
                      textAlign: "left", padding: "0.75rem 0.875rem", borderRadius: "8px",
                      border: "1px solid var(--border)", background: "var(--card)",
                      color: "var(--foreground)", cursor: "pointer", transition: "all 150ms",
                    }}
                    className="hover:border-primary hover:bg-primary/5"
                  >
                    <p style={{ fontSize: "0.85rem", fontWeight: 600, margin: 0, marginBottom: "0.2rem" }}>
                      {tpl.icon ? `${tpl.icon} ` : ""}{tpl.name}
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0, lineHeight: 1.4 }}>
                      {tpl.description || t("pages.agentNew.marketplaceTemplate")}
                    </p>
                    {tpl.category && (
                      <span style={{ display: "inline-block", marginTop: "0.4rem", fontSize: "0.6rem", padding: "0.1rem 0.4rem", background: "var(--secondary)", color: "var(--secondary-foreground)", borderRadius: "9999px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {tpl.category}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {marketplaceError && (
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontStyle: "italic" }}>
              {t("pages.agentNew.marketplaceUnavailable", { error: marketplaceError })}
            </p>
          )}
        </div>
      )}

      {/* ── Manual form (collapsible after AI fill) ─────────────── */}
      {!formCollapsed && (
      <form data-testid="agent-form" id="agent-form-anchor" onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label style={labelStyle}>{t("pages.agentEdit.agentName")}</label>
          <input
            data-testid="agent-form-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("pages.agentNew.namePlaceholder")}
            style={inputStyle}
          />
        </div>

        {/* Role */}
        <div>
          <label style={labelStyle}>{t("pages.agentEdit.role")}</label>
          <CustomSelect
            options={ROLES.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
            value={role}
            onChange={setRole}
          />
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              {t("pages.agentEdit.systemPrompt")}
            </label>
            <button
              data-testid="agent-generate-prompt-button"
              type="button"
              onClick={handleGeneratePrompt}
              disabled={generating}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:opacity-80 transition-opacity"
            >
              {generating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {t("pages.agentEdit.autoGenerate")}
            </button>
          </div>
          <textarea
            data-testid="agent-form-prompt-textarea"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            placeholder={t("pages.agentNew.promptPlaceholder")}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* Behavior sliders */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <p style={{ ...labelStyle, marginBottom: 0 }}>{t("pages.agentEdit.behavior")}</p>
          <SliderField
            label={t("pages.agentEdit.creativity")}
            leftLabel={t("pages.agentEdit.factual")}
            rightLabel={t("pages.agentEdit.creative")}
            value={temperature}
            onChange={setTemperature}
          />
          <SliderField
            label={t("pages.agentEdit.formality")}
            leftLabel={t("pages.agentEdit.casual")}
            rightLabel={t("pages.agentEdit.academic")}
            value={formality}
            onChange={setFormality}
          />
          <SliderField
            label={t("pages.agentEdit.verbosity")}
            leftLabel={t("pages.agentEdit.concise")}
            rightLabel={t("pages.agentEdit.detailed")}
            value={verbosity}
            onChange={setVerbosity}
          />
        </div>

        {/* Tools */}
        <div>
          <p style={labelStyle}>{t("pages.agentEdit.tools")}</p>
          <div className="space-y-2">
            <Checkbox checked={webSearch} onChange={(v) => setWebSearch(v)} label={t("pages.agentEdit.webSearch")} />
            <Checkbox checked={internalDatabase} onChange={(v) => setInternalDatabase(v)} label={t("pages.agentEdit.internalDatabase")} />
          </div>
        </div>

        {/* Autonomy */}
        <div>
          <p style={labelStyle}>{t("pages.agentEdit.autonomy")}</p>
          <div className="space-y-2">
            <Radio checked={autonomy === "draft"} onChange={() => setAutonomy("draft")} label={t("pages.agentEdit.draftReview")} description={t("pages.agentNew.draftReviewDesc")} />
            <Radio checked={autonomy === "full"} onChange={() => setAutonomy("full")} label={t("pages.agentEdit.fullAutonomy")} description={t("pages.agentNew.fullAutonomyDesc")} />
          </div>
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <Checkbox checked={scheduleEnabled} onChange={(v) => setScheduleEnabled(v)} label={t("pages.agentEdit.enableSchedule")} />
          {scheduleEnabled && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label style={labelStyle}>{t("pages.agentEdit.frequency")}</label>
                <CustomSelect
                  options={[
                    { value: "daily", label: t("pages.agentEdit.daily") },
                    { value: "weekly", label: t("pages.agentEdit.weekly") },
                    { value: "manual", label: t("pages.agentEdit.manual") },
                  ]}
                  value={frequency}
                  onChange={(v) => setFrequency(v as "daily" | "weekly" | "manual")}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("pages.agentEdit.time")}</label>
                <CustomTimeInput value={time} onChange={setTime} />
              </div>
              <div>
                <label style={labelStyle}>{t("pages.agentEdit.maxPerRun")}</label>
                <input
                  data-testid="agent-form-max-per-run-input"
                  type="number"
                  min={1}
                  max={10}
                  value={maxPerRun}
                  onChange={(e) => setMaxPerRun(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
            </div>
          )}
        </div>

        {/* Active toggle */}
        <Checkbox checked={active} onChange={(v) => setActive(v)} label={t("pages.agentEdit.agentIsActive")} />

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          data-testid="agent-form-submit-button"
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {saving ? t("pages.agentNew.creating") : t("pages.agentNew.createAgent")}
        </button>
      </form>
      )}
    </div>
  );
}

function SliderField({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs text-muted-foreground font-mono">{value}</span>
      </div>
      <CustomRangeSlider min={0} max={100} value={value} onChange={onChange} />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
