"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
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
