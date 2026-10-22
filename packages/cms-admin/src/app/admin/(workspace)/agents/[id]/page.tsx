"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Sparkles, Trash2, Play, CheckCircle, X, Plus, Copy, ChevronDown, ArrowLeft, Save, BookmarkPlus } from "lucide-react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTimeInput } from "@/components/ui/custom-time-input";
import { CustomRangeSlider } from "@/components/ui/custom-range-slider";
import { Checkbox, Radio } from "@/components/ui/checkbox-styled";
import type { AgentConfig } from "@/lib/agents";
import { TabTitle } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";
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

export default function AgentDetailPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [runPrompt, setRunPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ title: string } | null>(null);
  const [runError, setRunError] = useState("");

  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("copywriter");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(70);
  const [formality, setFormality] = useState(50);
  const [verbosity, setVerbosity] = useState(60);
  const [webSearch, setWebSearch] = useState(false);
  const [internalDatabase, setInternalDatabase] = useState(false);
  const [imageGeneration, setImageGeneration] = useState(false);
  const [autonomy, setAutonomy] = useState<"draft" | "full">("draft");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "manual" | "cron">(
    "daily"
  );
  const [time, setTime] = useState("06:00");
  const [maxPerRun, setMaxPerRun] = useState(3);
  const [active, setActive] = useState(true);
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState<string>("");
  const [weeklyBudgetUsd, setWeeklyBudgetUsd] = useState<string>("");
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState<string>("");
  const [agentLocale, setAgentLocale] = useState<string>("");
  const [siteLocales, setSiteLocales] = useState<{ locales: string[]; defaultLocale: string; autoTranslate: boolean }>({ locales: [], defaultLocale: "", autoTranslate: false });
  const [targetCollections, setTargetCollections] = useState<string[]>([]);
  const [fieldDefaults, setFieldDefaults] = useState<{ key: string; value: string }[]>([]);
  const [cloning, setCloning] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [confirmDeleteDefault, setConfirmDeleteDefault] = useState<number | null>(null);
  const [schemaFields, setSchemaFields] = useState<{ name: string; type: string; label?: string; options?: { value: string; label?: string }[] }[]>([]);
  const [availableCollections, setAvailableCollections] = useState<{ name: string; label: string }[]>([]);
  const [stats, setStats] = useState<AgentConfig["stats"]>({
    totalGenerated: 0,
    approved: 0,
    rejected: 0,
    edited: 0,
  });
  const [feedback, setFeedback] = useState<{
    id: string;
    type: "correction" | "rejection" | "edit";
    field?: string;
    original?: string;
    corrected?: string;
    notes?: string;
    createdAt: string;
  }[]>([]);

  useEffect(() => {
    if (!showDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowDelete(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDelete]);

  // Load site locales for the locale picker (Phase 6)
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.locales)) {
          setSiteLocales({
            locales: cfg.locales,
            defaultLocale: cfg.defaultLocale ?? cfg.locales[0] ?? "",
            autoTranslate: !!cfg.autoRetranslateOnUpdate,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Load recent feedback for this agent
  useEffect(() => {
    if (!id) return;
    fetch(`/api/cms/agents/${id}/feedback?limit=5`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d: { entries?: typeof feedback }) => setFeedback(d.entries ?? []))
      .catch(() => {});
  }, [id]);

  // Load available collections once
  useEffect(() => {
    fetch("/api/schema/collections")
      .then((r) => r.json())
      .then((data: { collections: { name: string; label: string }[] }) => {
        setAvailableCollections(data.collections ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/cms/agents/${id}`)
      .then((r) => r.json())
      .then((agent: AgentConfig) => {
        setName(agent.name);
        setRole(agent.role);
        setSystemPrompt(agent.systemPrompt);
        setTemperature(agent.behavior.temperature);
        setFormality(agent.behavior.formality);
        setVerbosity(agent.behavior.verbosity);
        setWebSearch(agent.tools.webSearch);
        setInternalDatabase(agent.tools.internalDatabase);
        setImageGeneration(agent.tools.imageGeneration ?? false);
        setAutonomy(agent.autonomy);
        setScheduleEnabled(agent.schedule.enabled);
        setFrequency(agent.schedule.frequency);
        setTime(agent.schedule.time);
        setMaxPerRun(agent.schedule.maxPerRun);
        setActive(agent.active);
        setDailyBudgetUsd(agent.dailyBudgetUsd != null ? String(agent.dailyBudgetUsd) : "");
        setWeeklyBudgetUsd(agent.weeklyBudgetUsd != null ? String(agent.weeklyBudgetUsd) : "");
        setMonthlyBudgetUsd(agent.monthlyBudgetUsd != null ? String(agent.monthlyBudgetUsd) : "");
        setAgentLocale(agent.locale ?? "");
        setTargetCollections(agent.targetCollections ?? []);
        setFieldDefaults(
          Object.entries(agent.fieldDefaults ?? {}).map(([key, value]) => ({
            key,
            value: String(value),
          }))
        );
        setStats(agent.stats);
        setLoading(false);
      })
      .catch(() => {
        setError(t("pages.agentEdit.failedLoad"));
        setLoading(false);
      });
  }, [id]);

  // Fetch schema fields — use targetCollections if set, otherwise all available collections
  useEffect(() => {
    const cols = targetCollections.length > 0
      ? targetCollections
      : availableCollections.map((c) => c.name);
    if (cols.length === 0) return;
    Promise.all(
      cols.map((col) =>
        fetch(`/api/cms/collections/${col}/schema`).then((r) => r.ok ? r.json() : null).catch(() => null)
      )
    ).then((results) => {
      const seen = new Map<string, typeof schemaFields[0]>();
      for (const result of results) {
        if (!result?.fields) continue;
        for (const f of result.fields as typeof schemaFields) {
          const existing = seen.get(f.name);
          if (!existing) {
            seen.set(f.name, { ...f });
          } else if (f.options && existing.options) {
            // Merge options from multiple collections (dedup by value)
            const existingVals = new Set(existing.options.map((o) => o.value));
            for (const o of f.options) {
              if (!existingVals.has(o.value)) existing.options.push(o);
            }
          }
        }
      }
      const merged = Array.from(seen.values());
      setSchemaFields(merged);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(targetCollections), JSON.stringify(availableCollections)]);

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
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/cms/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          systemPrompt,
          behavior: { temperature, formality, verbosity },
          tools: { webSearch, internalDatabase, imageGeneration },
          autonomy,
          targetCollections,
          fieldDefaults: Object.fromEntries(
            fieldDefaults.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
          ),
          schedule: { enabled: scheduleEnabled, frequency, time, maxPerRun },
          active,
          dailyBudgetUsd: dailyBudgetUsd.trim() ? Number(dailyBudgetUsd) : undefined,
          weeklyBudgetUsd: weeklyBudgetUsd.trim() ? Number(weeklyBudgetUsd) : undefined,
          monthlyBudgetUsd: monthlyBudgetUsd.trim() ? Number(monthlyBudgetUsd) : undefined,
          locale: agentLocale.trim() ? agentLocale : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t("pages.agentEdit.failedSave"));
    } catch {
      setError(t("pages.agentEdit.networkError"));
    }
    setSaving(false);
  }

  async function handleRun() {
    if (!runPrompt.trim()) return;
    setRunning(true);
    setRunError("");
    setRunResult(null);
    try {
      const res = await fetch(`/api/cms/agents/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: runPrompt }),
      });
      const data = await res.json();
      if (!res.ok) setRunError(data.error ?? t("pages.agentEdit.failedRun"));
      else setRunResult(data);
    } catch {
      setRunError(t("pages.agentEdit.networkError"));
    }
    setRunning(false);
  }

  async function handleSaveAsTemplate() {
    setSavingTemplate(true);
    setTemplateSaved(false);
    setError("");
    try {
      const res = await fetch("/api/cms/agent-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: `Template based on ${name}`,
          payload: {
            name,
            role,
            systemPrompt,
            behavior: { temperature, formality, verbosity },
            tools: { webSearch, internalDatabase, imageGeneration },
            autonomy,
            targetCollections,
            fieldDefaults: Object.fromEntries(
              fieldDefaults.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
            ),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t("pages.agentEdit.failedSaveTemplate"));
      else {
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2500);
      }
    } catch {
      setError(t("pages.agentEdit.networkError"));
    }
    setSavingTemplate(false);
  }

  async function handleClone() {
    setCloning(true);
    try {
      const res = await fetch(`/api/cms/agents/${id}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/admin/agents/${data.id}`);
      else setError(data.error ?? t("pages.agentEdit.cloneFailed"));
    } catch {
      setError(t("pages.agentEdit.networkError"));
    }
    setCloning(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/cms/agents/${id}`, { method: "DELETE" });
      router.push("/admin/agents");
    } catch {
      setError(t("pages.agentEdit.failedDelete"));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">{t("pages.agentEdit.loading")}</p>
      </div>
    );
  }

  return (
    <>
    {/* Breadcrumb bar */}
    <ActionBar
      actions={!readOnly ? (
        <>
          <ActionButton
            variant="secondary"
            onClick={handleSaveAsTemplate}
            disabled={savingTemplate}
            title={t("pages.agentEdit.saveAsTemplateTitle")}
            icon={
              templateSaved ? (
                <CheckCircle style={{ width: "0.8rem", height: "0.8rem", color: "#22c55e" }} />
              ) : (
                <BookmarkPlus style={{ width: "0.8rem", height: "0.8rem" }} />
              )
            }
          >
            {savingTemplate ? t("pages.agentEdit.saving") : templateSaved ? t("pages.agentEdit.savedBang") : t("pages.agentEdit.saveAsTemplate")}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={handleClone}
            disabled={cloning}
            title={t("pages.agentEdit.cloneTitle")}
            icon={<Copy style={{ width: "0.8rem", height: "0.8rem" }} />}
          >
            {cloning ? t("pages.agentEdit.cloning") : t("pages.agentEdit.clone")}
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={() => {
              const form = document.getElementById("agent-form") as HTMLFormElement | null;
              form?.requestSubmit();
            }}
            disabled={saving}
            icon={saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Save style={{ width: 14, height: 14 }} />}
          >
            {saving ? t("pages.agentEdit.saving") : t("pages.agentEdit.save")}
          </ActionButton>
        </>
      ) : undefined}
    >
      <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center" }} />
      <Link href="/admin/agents" className="text-muted-foreground hover:text-foreground transition-colors" title={t("pages.agentEdit.backToAgents")}>
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <ActionBarBreadcrumb items={[t("pages.agentEdit.breadcrumb"), name || id]} />
    </ActionBar>

    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div className="p-8 max-w-2xl">
      <TabTitle value={name || t("pages.agentEdit.tabFallback")} />

      {/* Stats */}
      {stats.totalGenerated > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: t("pages.agentEdit.statGenerated"), value: stats.totalGenerated },
            { label: t("pages.agentEdit.statApproved"), value: stats.approved },
            { label: t("pages.agentEdit.statRejected"), value: stats.rejected },
            { label: t("pages.agentEdit.statEdited"), value: stats.edited },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border p-3 text-center"
            >
              <p className="text-xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent feedback (Phase 2) — last 5 corrections/rejections used by the agent next run */}
      {feedback.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            {t("pages.agentEdit.recentFeedback", { count: feedback.length })}
          </h3>
          <div className="space-y-2">
            {feedback.map((f) => {
              const badgeColor =
                f.type === "rejection" ? "#ef4444" :
                f.type === "edit" ? "#3b82f6" : "#22c55e";
              return (
                <div
                  key={f.id}
                  className="rounded-lg border border-border p-3 text-xs"
                  style={{ background: "var(--card)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{
                      fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
                      padding: "0.1rem 0.4rem", borderRadius: "3px",
                      background: `color-mix(in srgb, ${badgeColor} 15%, transparent)`,
                      color: badgeColor,
                    }}>{f.type}</span>
                    {f.field && <span className="text-muted-foreground">{t("pages.agentEdit.fieldLabel")} <code>{f.field}</code></span>}
                    <span className="text-muted-foreground ml-auto">
                      {new Date(f.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {f.type === "rejection" && f.notes && (
                    <p className="text-foreground">{f.notes}</p>
                  )}
                  {(f.type === "correction" || f.type === "edit") && f.original && f.corrected && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground line-through truncate">{f.original}</p>
                      <p className="text-foreground truncate">{f.corrected}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t("pages.agentEdit.feedbackHint")}
          </p>
        </div>
      )}

      <form data-testid="agent-form" id="agent-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label style={labelStyle}>{t("pages.agentEdit.agentName")}</label>
          <input
            data-testid="agent-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
              data-testid="agent-generate-prompt"
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
            data-testid="agent-system-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
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
            <Checkbox checked={imageGeneration} onChange={(v) => setImageGeneration(v)} label={t("pages.agentEdit.imageGeneration")} />
          </div>
        </div>

        {/* Target Collections */}
        <div>
          <p style={labelStyle}>{t("pages.agentEdit.targetCollections")}</p>
          <p className="text-xs text-muted-foreground mb-2">{t("pages.agentEdit.targetCollectionsHint")}</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {targetCollections.map((col) => (
              <span
                key={col}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "99px",
                  background: "color-mix(in oklch, var(--primary) 12%, transparent)",
                  border: "1px solid color-mix(in oklch, var(--primary) 30%, transparent)",
                  color: "var(--primary)",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                {availableCollections.find((c) => c.name === col)?.label ?? col}
                <button
                  data-testid={`agent-target-collection-remove-${col}`}
                  type="button"
                  onClick={() => setTargetCollections((prev) => prev.filter((c) => c !== col))}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", display: "flex", lineHeight: 1 }}
                >
                  <X style={{ width: "0.65rem", height: "0.65rem" }} />
                </button>
              </span>
            ))}
          </div>
          {availableCollections.filter((c) => !targetCollections.includes(c.name)).length > 0 && (
            <CustomSelect
              options={[
                { value: "", label: t("pages.agentEdit.addCollection") },
                ...availableCollections
                  .filter((c) => !targetCollections.includes(c.name))
                  .map((c) => ({ value: c.name, label: c.label })),
              ]}
              value=""
              onChange={(val) => { if (val) setTargetCollections((prev) => [...prev, val]); }}
            />
          )}
        </div>

        {/* Field Defaults */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p style={labelStyle}>{t("pages.agentEdit.fieldDefaults")}</p>
            <span className="text-xs text-muted-foreground">{t("pages.agentEdit.fieldDefaultsHint")}</span>
          </div>
          <div className="space-y-2">
            {fieldDefaults.map((fd, i) => {
              const fieldDef = schemaFields.find((f) => f.name === fd.key);
              const valueOptions = fieldDef?.options ?? (fieldDef?.type === "boolean" ? [{ value: "true", label: "true" }, { value: "false", label: "false" }] : null);
              return (
                <div key={i} className="flex gap-2 items-center">
                  {/* Field name — autocomplete with schema suggestions */}
                  <FieldAutocomplete
                    value={fd.key}
                    suggestions={schemaFields}
                    onChange={(val) => setFieldDefaults((prev) => prev.map((f, j) => j === i ? { key: val, value: "" } : f))}
                    style={{ width: "42%" }}
                  />
                  {/* Value — dropdown for select/boolean, text for others */}
                  {valueOptions ? (
                    <CustomSelect
                      options={valueOptions.map((o) => ({ value: o.value, label: o.label ?? o.value }))}
                      value={fd.value}
                      onChange={(val) => setFieldDefaults((prev) => prev.map((f, j) => j === i ? { ...f, value: val } : f))}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <input
                      data-testid={`agent-field-default-value-${i}`}
                      type={fieldDef?.type === "number" ? "number" : "text"}
                      value={fd.value}
                      onChange={(e) => setFieldDefaults((prev) => prev.map((f, j) => j === i ? { ...f, value: e.target.value } : f))}
                      placeholder={fd.key ? t("pages.agentEdit.valueFor", { key: fd.key }) : t("pages.agentEdit.value")}
                      style={{ ...inputStyle, flex: 1, fontSize: "0.8rem" }}
                    />
                  )}
                  {confirmDeleteDefault === i ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <button data-testid={`agent-field-default-delete-confirm-${i}`} type="button" onClick={() => { setFieldDefaults((prev) => prev.filter((_, j) => j !== i)); setConfirmDeleteDefault(null); }}
                        style={{ fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer" }}>{t("pages.agentEdit.sure")}</button>
                      <button data-testid={`agent-field-default-delete-cancel-${i}`} type="button" onClick={() => setConfirmDeleteDefault(null)}
                        style={{ fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer" }}>{t("pages.agentEdit.no")}</button>
                    </span>
                  ) : (
                    <button
                      data-testid={`agent-field-default-delete-${i}`}
                      type="button"
                      onClick={() => setConfirmDeleteDefault(i)}
                      style={{ padding: "0.3rem", color: "var(--destructive)", background: "none", border: "none", cursor: "pointer", borderRadius: "4px" }}
                      className="hover:bg-destructive/10"
                    >
                      <X style={{ width: "0.8rem", height: "0.8rem" }} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              data-testid="agent-field-default-add"
              type="button"
              onClick={() => setFieldDefaults((prev) => [...prev, { key: "", value: "" }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> {t("pages.agentEdit.addDefault")}
            </button>
          </div>
        </div>

        {/* Autonomy */}
        <div>
          <p style={labelStyle}>{t("pages.agentEdit.autonomy")}</p>
          <div className="space-y-2">
            <Radio checked={autonomy === "draft"} onChange={() => setAutonomy("draft")} label={t("pages.agentEdit.draftReview")} description={t("pages.agentEdit.draftReviewDesc")} />
            <Radio checked={autonomy === "full"} onChange={() => setAutonomy("full")} label={t("pages.agentEdit.fullAutonomy")} description={t("pages.agentEdit.fullAutonomyDesc")} />
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
                  onChange={(v) => setFrequency(v as "daily" | "weekly" | "manual" | "cron")}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("pages.agentEdit.time")}</label>
                <CustomTimeInput value={time} onChange={setTime} />
              </div>
              <div>
                <label style={labelStyle}>{t("pages.agentEdit.maxPerRun")}</label>
                <input
                  data-testid="agent-max-per-run"
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

        {/* Phase 6 — Output locale. Only render the picker on multi-locale
            sites; on single-locale sites it's just noise. Blank value =
            inherit siteConfig.defaultLocale (the existing behaviour). */}
        {siteLocales.locales.length > 1 && (
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("pages.agentEdit.outputLanguage")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("pages.agentEdit.outputLanguageHint", { locale: siteLocales.defaultLocale.toUpperCase() })}{" "}
                {siteLocales.autoTranslate
                  ? t("pages.agentEdit.autoTranslateOn")
                  : t("pages.agentEdit.autoTranslateOff")}
              </p>
            </div>
            <CustomSelect
              options={[
                { value: "", label: t("pages.agentEdit.siteDefault", { locale: siteLocales.defaultLocale.toUpperCase() }) },
                ...siteLocales.locales.map((l) => ({ value: l, label: l.toUpperCase() })),
              ]}
              value={agentLocale}
              onChange={setAgentLocale}
            />
          </div>
        )}

        {/* Phase 4 — Per-agent cost guards. All optional; blank = no cap.
            Checked pre-flight in agent-runner and scheduler against the
            agent's analytics spend. */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("pages.agentEdit.costGuards")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("pages.agentEdit.costGuardsHint")}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={labelStyle}>{t("pages.agentEdit.daily")}</label>
              <input
                data-testid="agent-daily-budget"
                type="number"
                min={0}
                step={0.01}
                placeholder="—"
                value={dailyBudgetUsd}
                onChange={(e) => setDailyBudgetUsd(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("pages.agentEdit.weekly")}</label>
              <input
                data-testid="agent-weekly-budget"
                type="number"
                min={0}
                step={0.01}
                placeholder="—"
                value={weeklyBudgetUsd}
                onChange={(e) => setWeeklyBudgetUsd(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("pages.agentEdit.monthly")}</label>
              <input
                data-testid="agent-monthly-budget"
                type="number"
                min={0}
                step={0.01}
                placeholder="—"
                value={monthlyBudgetUsd}
                onChange={(e) => setMonthlyBudgetUsd(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Active toggle */}
        <Checkbox checked={active} onChange={(v) => setActive(v)} label={t("pages.agentEdit.agentIsActive")} />

        {error && <p className="text-sm text-destructive">{error}</p>}

      </form>

      {/* Run now */}
      {!readOnly && (
        <div className="mt-8 pt-6 border-t border-border space-y-3">
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", margin: 0 }}>
            {t("pages.agentEdit.runAgentNow")}
          </p>
          <textarea
            data-testid="agent-run-prompt"
            value={runPrompt}
            onChange={(e) => setRunPrompt(e.target.value)}
            rows={2}
            placeholder={t("pages.agentEdit.runPromptPlaceholder")}
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              data-testid="agent-run-button"
              type="button"
              onClick={handleRun}
              disabled={running || !runPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? t("pages.agentEdit.running") : t("pages.agentEdit.runNow")}
            </button>
            {runResult && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "hsl(142 71% 45%)" }}>
                <CheckCircle style={{ width: "14px", height: "14px" }} />
                {t("pages.agentEdit.addedToQueue", { title: runResult.title })}
              </span>
            )}
            {runError && <span style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{runError}</span>}
          </div>
        </div>
      )}

      {/* Delete section */}
      {!readOnly && (
        <div className="mt-6 pt-6 border-t border-border">
          <button
            data-testid="agent-delete-trigger"
            type="button"
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 text-sm text-destructive hover:opacity-80 transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
            {t("pages.agentEdit.deleteAgent")}
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "400px",
              width: "90%",
            }}
          >
            <p className="font-semibold text-foreground mb-2">{t("pages.agentEdit.deleteAgentQ")}</p>
            <p className="text-sm text-muted-foreground mb-4">
              {t("pages.agentEdit.deleteBody", { name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                data-testid="agent-delete-cancel"
                type="button"
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm rounded-md border border-border bg-transparent hover:bg-secondary transition-colors"
              >
                {t("pages.agentEdit.cancel")}
              </button>
              <button
                data-testid="agent-delete-confirm"
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {deleting ? t("pages.agentEdit.deleting") : t("pages.agentEdit.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </fieldset>
    </>
  );
}

// Autocomplete input for field names — shows schema suggestions but accepts any value
function FieldAutocomplete({
  value,
  suggestions,
  onChange,
  style,
}: {
  value: string;
  suggestions: { name: string; type: string; label?: string }[];
  onChange: (val: string) => void;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query when value changes externally (e.g. after row reset)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query
    ? suggestions.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          (s.label ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : suggestions;

  function commit(val: string) {
    onChange(val);
    setQuery(val);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Commit current query on blur
        onChange(query);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, query, onChange]);

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <input
        data-testid="agent-field-autocomplete-input"
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { onChange(query); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); }
          if (e.key === "Enter") { e.preventDefault(); onChange(query); setOpen(false); }
        }}
        placeholder={t("pages.agentEdit.fieldName")}
        style={{
          width: "100%",
          padding: "0.5rem 0.75rem",
          borderRadius: "7px",
          border: "1px solid var(--border)",
          background: "var(--background)",
          color: "var(--foreground)",
          fontSize: "0.8rem",
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
        onFocusCapture={(e) => { e.target.style.borderColor = "var(--primary)"; }}
        onBlurCapture={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          marginTop: "2px",
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: "7px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          zIndex: 50,
          maxHeight: "200px",
          overflowY: "auto",
        }}>
          {filtered.map((s) => (
            <button
              data-testid={`agent-field-autocomplete-option-${s.name}`}
              key={s.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(s.name); }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "0.4rem 0.625rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.8rem",
                color: "var(--foreground)",
                gap: "0.5rem",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ fontFamily: "monospace" }}>{s.name}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", flexShrink: 0 }}>{s.type}</span>
            </button>
          ))}
        </div>
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
