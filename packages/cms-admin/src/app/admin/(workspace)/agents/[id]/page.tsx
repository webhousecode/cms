"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Sparkles, Trash2, Play, CheckCircle, X, Plus, Copy, ChevronDown, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { CustomSelect } from "@/components/ui/custom-select";
import { Checkbox, Radio } from "@/components/ui/checkbox-styled";
import type { AgentConfig } from "@/lib/agents";
import { TabTitle } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";

const ROLES = [
  { value: "copywriter", label: "Content Writer" },
  { value: "seo", label: "SEO" },
  { value: "geo", label: "GEO Optimizer" },
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

export default function AgentDetailPage() {
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
  const [autonomy, setAutonomy] = useState<"draft" | "full">("draft");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "manual">(
    "daily"
  );
  const [time, setTime] = useState("06:00");
  const [maxPerRun, setMaxPerRun] = useState(3);
  const [active, setActive] = useState(true);
  const [targetCollections, setTargetCollections] = useState<string[]>([]);
  const [fieldDefaults, setFieldDefaults] = useState<{ key: string; value: string }[]>([]);
  const [cloning, setCloning] = useState(false);
  const [confirmDeleteDefault, setConfirmDeleteDefault] = useState<number | null>(null);
  const [schemaFields, setSchemaFields] = useState<{ name: string; type: string; label?: string; options?: { value: string; label?: string }[] }[]>([]);
  const [availableCollections, setAvailableCollections] = useState<{ name: string; label: string }[]>([]);
  const [stats, setStats] = useState<AgentConfig["stats"]>({
    totalGenerated: 0,
    approved: 0,
    rejected: 0,
    edited: 0,
  });

  useEffect(() => {
    if (!showDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowDelete(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDelete]);

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
        setAutonomy(agent.autonomy);
        setScheduleEnabled(agent.schedule.enabled);
        setFrequency(agent.schedule.frequency);
        setTime(agent.schedule.time);
        setMaxPerRun(agent.schedule.maxPerRun);
        setActive(agent.active);
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
        setError("Failed to load agent");
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
      setError("Failed to generate prompt");
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
          tools: { webSearch, internalDatabase },
          autonomy,
          targetCollections,
          fieldDefaults: Object.fromEntries(
            fieldDefaults.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
          ),
          schedule: { enabled: scheduleEnabled, frequency, time, maxPerRun },
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to save");
    } catch {
      setError("Network error");
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
      if (!res.ok) setRunError(data.error ?? "Failed to run agent");
      else setRunResult(data);
    } catch {
      setRunError("Network error");
    }
    setRunning(false);
  }

  async function handleClone() {
    setCloning(true);
    try {
      const res = await fetch(`/api/cms/agents/${id}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/admin/agents/${data.id}`);
      else setError(data.error ?? "Clone failed");
    } catch {
      setError("Network error");
    }
    setCloning(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/cms/agents/${id}`, { method: "DELETE" });
      router.push("/admin/agents");
    } catch {
      setError("Failed to delete agent");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
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
            onClick={handleClone}
            disabled={cloning}
            title="Clone agent"
            icon={<Copy style={{ width: "0.8rem", height: "0.8rem" }} />}
          >
            {cloning ? "Cloning..." : "Clone"}
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
            {saving ? "Saving..." : "Save"}
          </ActionButton>
        </>
      ) : undefined}
    >
      <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center" }} />
      <Link href="/admin/agents" className="text-muted-foreground hover:text-foreground transition-colors" title="Back to Agents">
        <ArrowLeft className="w-4 h-4" />
      </Link>
      <ActionBarBreadcrumb items={["agents", name || id]} />
    </ActionBar>

    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div className="p-8 max-w-2xl">
      <TabTitle value={name || "Agent"} />

      {/* Stats */}
      {stats.totalGenerated > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "Generated", value: stats.totalGenerated },
            { label: "Approved", value: stats.approved },
            { label: "Rejected", value: stats.rejected },
            { label: "Edited", value: stats.edited },
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

      <form id="agent-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label style={labelStyle}>Agent Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            <Checkbox checked={webSearch} onChange={(v) => setWebSearch(v)} label="Web search" />
            <Checkbox checked={internalDatabase} onChange={(v) => setInternalDatabase(v)} label="Internal database" />
          </div>
        </div>

        {/* Target Collections */}
        <div>
          <p style={labelStyle}>Target Collections</p>
          <p className="text-xs text-muted-foreground mb-2">Which collections this agent generates content for.</p>
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
                { value: "", label: "— add a collection —" },
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
            <p style={labelStyle}>Field Defaults</p>
            <span className="text-xs text-muted-foreground">Override LLM — agent always uses these values</span>
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
                      type={fieldDef?.type === "number" ? "number" : "text"}
                      value={fd.value}
                      onChange={(e) => setFieldDefaults((prev) => prev.map((f, j) => j === i ? { ...f, value: e.target.value } : f))}
                      placeholder={fd.key ? `value for ${fd.key}` : "value"}
                      style={{ ...inputStyle, flex: 1, fontSize: "0.8rem" }}
                    />
                  )}
                  {confirmDeleteDefault === i ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <button type="button" onClick={() => { setFieldDefaults((prev) => prev.filter((_, j) => j !== i)); setConfirmDeleteDefault(null); }}
                        style={{ fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer" }}>Sure?</button>
                      <button type="button" onClick={() => setConfirmDeleteDefault(null)}
                        style={{ fontSize: "0.6rem", padding: "0.15rem 0.4rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer" }}>No</button>
                    </span>
                  ) : (
                    <button
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
              type="button"
              onClick={() => setFieldDefaults((prev) => [...prev, { key: "", value: "" }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> Add default
            </button>
          </div>
        </div>

        {/* Autonomy */}
        <div>
          <p style={labelStyle}>Autonomy</p>
          <div className="space-y-2">
            <Radio checked={autonomy === "draft"} onChange={() => setAutonomy("draft")} label="Draft & Review" description="— goes to curation queue" />
            <Radio checked={autonomy === "full"} onChange={() => setAutonomy("full")} label="Full Autonomy" description="— publishes directly" />
          </div>
        </div>

        {/* Schedule */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <Checkbox checked={scheduleEnabled} onChange={(v) => setScheduleEnabled(v)} label="Enable schedule" />
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
        <Checkbox checked={active} onChange={(v) => setActive(v)} label="Agent is active" />

        {error && <p className="text-sm text-destructive">{error}</p>}

      </form>

      {/* Run now */}
      {!readOnly && (
        <div className="mt-8 pt-6 border-t border-border space-y-3">
          <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", margin: 0 }}>
            Run agent now
          </p>
          <textarea
            value={runPrompt}
            onChange={(e) => setRunPrompt(e.target.value)}
            rows={2}
            placeholder="Describe what to generate, e.g. &quot;Write an article about rotator cuff injuries for athletes&quot;"
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", outline: "none", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !runPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Running…" : "Run now"}
            </button>
            {runResult && (
              <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "hsl(142 71% 45%)" }}>
                <CheckCircle style={{ width: "14px", height: "14px" }} />
                &ldquo;{runResult.title}&rdquo; added to Curation Queue
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
            type="button"
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 text-sm text-destructive hover:opacity-80 transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
            Delete agent
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
            <p className="font-semibold text-foreground mb-2">Delete agent?</p>
            <p className="text-sm text-muted-foreground mb-4">
              This action cannot be undone. The agent &ldquo;{name}&rdquo; and
              all its configuration will be permanently deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm rounded-md border border-border bg-transparent hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
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
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { onChange(query); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); }
          if (e.key === "Enter") { e.preventDefault(); onChange(query); setOpen(false); }
        }}
        placeholder="field name"
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
