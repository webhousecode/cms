"use client";

import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Send, ChevronDown } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

const ROLES = [
  { value: "copywriter", label: "Content Writer" },
  { value: "seo", label: "SEO" },
  { value: "translator", label: "Translator" },
  { value: "refresher", label: "Content Refresher" },
  { value: "custom", label: "Custom" },
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
        setAiError(data.error ?? "Failed to generate agent");
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
      setAiError("Network error");
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
      setError("Failed to generate prompt");
    }
    setGenerating(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Agent name is required");
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
        setError(data.error ?? "Failed to create agent");
        setSaving(false);
        return;
      }
      router.push(`/admin/agents/${data.id}`);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          AI Agents
        </p>
        <h1 className="text-2xl font-bold text-foreground">New Agent</h1>
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
            Describe your agent
          </span>
          {formFilled && (
            <button
              type="button"
              onClick={() => setFormCollapsed((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {formCollapsed ? "Show form" : "Hide form"}
              <ChevronDown style={{ width: "12px", height: "12px", transform: formCollapsed ? "rotate(-90deg)" : "none", transition: "transform 150ms" }} />
            </button>
          )}
        </div>

        {/* Input area */}
        <div style={{ padding: "0 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={handleDescribeKey}
            rows={3}
            placeholder={"e.g. \"An agent that writes evidence-based physiotherapy articles in Danish, academic tone, can search the web, runs every Monday at 7am\""}
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
                ? <><Loader2 style={{ width: "13px", height: "13px" }} className="animate-spin" /> Generating…</>
                : <><Send style={{ width: "13px", height: "13px" }} /> Generate agent</>
              }
            </button>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>⌘ Enter</span>
            {formFilled && !aiLoading && (
              <span style={{ fontSize: "0.72rem", color: "hsl(142 71% 45%)", marginLeft: "auto" }}>
                ✓ Form filled — review and save below
              </span>
            )}
          </div>

          {aiError && (
            <p style={{ fontSize: "0.75rem", color: "var(--destructive)", margin: 0 }}>{aiError}</p>
          )}
        </div>
      </div>

      {/* ── Manual form (collapsible after AI fill) ─────────────── */}
      {!formCollapsed && (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label style={labelStyle}>Agent Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Blog Writer"
            style={inputStyle}
          />
        </div>

        {/* Role */}
        <div>
          <label style={labelStyle}>Role</label>
          <CustomSelect
            options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
            value={role}
            onChange={setRole}
          />
        </div>

        {/* System Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              System Prompt
            </label>
            <button
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
              Auto-generate
            </button>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            placeholder="Describe the agent's role, tone and constraints..."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {/* Behavior sliders */}
        <div className="rounded-lg border border-border p-4 space-y-4">
          <p style={{ ...labelStyle, marginBottom: 0 }}>Behavior</p>
          <SliderField
            label="Creativity"
            leftLabel="Factual"
            rightLabel="Creative"
            value={temperature}
            onChange={setTemperature}
          />
          <SliderField
            label="Formality"
            leftLabel="Casual"
            rightLabel="Academic"
            value={formality}
            onChange={setFormality}
          />
          <SliderField
            label="Verbosity"
            leftLabel="Concise"
            rightLabel="Detailed"
            value={verbosity}
            onChange={setVerbosity}
          />
        </div>

        {/* Tools */}
        <div>
          <p style={labelStyle}>Tools</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
              />
              Web search
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={internalDatabase}
                onChange={(e) => setInternalDatabase(e.target.checked)}
              />
              Internal database
            </label>
          </div>
        </div>

        {/* Autonomy */}
        <div>
          <p style={labelStyle}>Autonomy</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autonomy"
                checked={autonomy === "draft"}
                onChange={() => setAutonomy("draft")}
              />
              <span>
                <strong>Draft & Review</strong>
                <span className="text-muted-foreground ml-1">
                  — AI drafts go to the curation queue
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autonomy"
                checked={autonomy === "full"}
                onChange={() => setAutonomy("full")}
              />
              <span>
                <strong>Full Autonomy</strong>
                <span className="text-muted-foreground ml-1">
                  — Publishes directly (requires &gt;95% approval &amp; 20+ items)
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
            />
            Enable schedule
          </label>
          {scheduleEnabled && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label style={labelStyle}>Frequency</label>
                <CustomSelect
                  options={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "manual", label: "Manual" },
                  ]}
                  value={frequency}
                  onChange={(v) => setFrequency(v as "daily" | "weekly" | "manual")}
                />
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Max per run</label>
                <input
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Agent is active
        </label>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          {saving ? "Creating..." : "Create Agent"}
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
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--primary)]"
        style={{ height: "6px" }}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
