"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import type { AgentConfig } from "@/lib/agents";

const ROLES = [
  { value: "copywriter", label: "Indholdsskribent" },
  { value: "seo", label: "SEO Optimering" },
  { value: "translator", label: "Oversætter" },
  { value: "refresher", label: "Indholdsopdatering" },
  { value: "custom", label: "Brugerdefineret" },
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const [stats, setStats] = useState<AgentConfig["stats"]>({
    totalGenerated: 0,
    approved: 0,
    rejected: 0,
    edited: 0,
  });

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
        setStats(agent.stats);
        setLoading(false);
      })
      .catch(() => {
        setError("Kunne ikke indlæse agent");
        setLoading(false);
      });
  }, [id]);

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
      setError("Kunne ikke generere prompt");
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
          targetCollections: [],
          schedule: { enabled: scheduleEnabled, frequency, time, maxPerRun },
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Kunne ikke gemme");
    } catch {
      setError("Netværksfejl");
    }
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/cms/agents/${id}`, { method: "DELETE" });
      router.push("/admin/agents");
    } catch {
      setError("Kunne ikke slette agent");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Indlaeser...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          AI Agenter
        </p>
        <h1 className="text-2xl font-bold text-foreground">Rediger Agent</h1>
      </div>

      {/* Stats */}
      {stats.totalGenerated > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "Genereret", value: stats.totalGenerated },
            { label: "Godkendt", value: stats.approved },
            { label: "Afvist", value: stats.rejected },
            { label: "Redigeret", value: stats.edited },
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label style={labelStyle}>Agent Navn</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Role */}
        <div>
          <label style={labelStyle}>Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={inputStyle}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
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
              Auto-generer
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
          <p style={{ ...labelStyle, marginBottom: 0 }}>Adfærd</p>
          <SliderField
            label="Kreativitet"
            leftLabel="Faktuel"
            rightLabel="Kreativ"
            value={temperature}
            onChange={setTemperature}
          />
          <SliderField
            label="Formalitet"
            leftLabel="Casual"
            rightLabel="Akademisk"
            value={formality}
            onChange={setFormality}
          />
          <SliderField
            label="Verbosity"
            leftLabel="Kort"
            rightLabel="Detaljeret"
            value={verbosity}
            onChange={setVerbosity}
          />
        </div>

        {/* Tools */}
        <div>
          <p style={labelStyle}>Vaerktoejer</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
              />
              Websogning
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={internalDatabase}
                onChange={(e) => setInternalDatabase(e.target.checked)}
              />
              Intern database
            </label>
          </div>
        </div>

        {/* Autonomy */}
        <div>
          <p style={labelStyle}>Autonomi</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autonomy"
                checked={autonomy === "draft"}
                onChange={() => setAutonomy("draft")}
              />
              <span>
                <strong>Kladde & Godkendelse</strong>
                <span className="text-muted-foreground ml-1">
                  — sendes til kurerings-koen
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
                <strong>Fuld Autonomi</strong>
                <span className="text-muted-foreground ml-1">
                  — publicerer direkte
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
            Planlaegning aktiveret
          </label>
          {scheduleEnabled && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label style={labelStyle}>Frekvens</label>
                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(
                      e.target.value as "daily" | "weekly" | "manual"
                    )
                  }
                  style={inputStyle}
                >
                  <option value="daily">Daglig</option>
                  <option value="weekly">Ugentlig</option>
                  <option value="manual">Manuel</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tidspunkt</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Maks per koersel</label>
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
          Agent er aktiv
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? "Gemmer..." : "Gem Aendringer"}
        </button>
      </form>

      {/* Delete section */}
      <div className="mt-10 pt-6 border-t border-border">
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 text-sm text-destructive hover:opacity-80 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
          Slet agent
        </button>
      </div>

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
            <p className="font-semibold text-foreground mb-2">Slet agent?</p>
            <p className="text-sm text-muted-foreground mb-4">
              Denne handling kan ikke fortrydes. Agenten &ldquo;{name}&rdquo; og
              al dens konfiguration vil blive slettet permanent.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="px-4 py-2 text-sm rounded-md border border-border bg-transparent hover:bg-secondary transition-colors"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-white hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {deleting ? "Sletter..." : "Slet"}
              </button>
            </div>
          </div>
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
