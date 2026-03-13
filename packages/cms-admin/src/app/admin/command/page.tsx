"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw } from "lucide-react";

interface CockpitParams {
  temperature: number;
  promptDepth: "minimal" | "medium" | "deep";
  seoWeight: number;
  speedQuality: "fast" | "balanced" | "thorough";
  primaryModel: string;
  multiModelEnabled: boolean;
  compareModels: string[];
  monthlyBudgetUsd: number;
  currentMonthSpentUsd: number;
}

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
];

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

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  display: "block",
  marginBottom: "0.375rem",
};

export default function CommandPage() {
  const [params, setParams] = useState<CockpitParams | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueStats, setQueueStats] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/cms/command")
      .then((r) => r.json())
      .then(setParams);
    fetch("/api/cms/curation?stats=true")
      .then((r) => r.json())
      .then(setQueueStats);
  }, []);

  async function handleSave() {
    if (!params) return;
    setSaving(true);
    await fetch("/api/cms/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    setSaving(false);
  }

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/cms/command/sync", { method: "POST" });
    setSyncing(false);
  }

  if (!params) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Indlaeser...</p>
      </div>
    );
  }

  const budgetPct =
    params.monthlyBudgetUsd > 0
      ? (params.currentMonthSpentUsd / params.monthlyBudgetUsd) * 100
      : 0;
  const budgetColor =
    budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-yellow-500" : "bg-green-500";

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          AI
        </p>
        <h1 className="text-3xl font-bold text-foreground">AI Cockpit</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Global params */}
          <div className="rounded-xl border border-border p-5 space-y-5">
            <h2 className="font-semibold text-foreground">
              Globale Parametre
            </h2>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">Temperature</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {params.temperature}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.temperature}
                onChange={(e) =>
                  setParams({
                    ...params,
                    temperature: Number(e.target.value),
                  })
                }
                className="w-full accent-[var(--primary)]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Faktuel</span>
                <span>Kreativ</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Prompt Dybde</label>
              <SegmentedControl
                options={[
                  { value: "minimal", label: "Minimal" },
                  { value: "medium", label: "Medium" },
                  { value: "deep", label: "Dybde" },
                ]}
                value={params.promptDepth}
                onChange={(v) =>
                  setParams({
                    ...params,
                    promptDepth: v as CockpitParams["promptDepth"],
                  })
                }
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">SEO Vaegtning</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {params.seoWeight}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={params.seoWeight}
                onChange={(e) =>
                  setParams({
                    ...params,
                    seoWeight: Number(e.target.value),
                  })
                }
                className="w-full accent-[var(--primary)]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Kreativ frihed</span>
                <span>SEO Optimeret</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Hastighed / Kvalitet</label>
              <SegmentedControl
                options={[
                  { value: "fast", label: "Hurtig" },
                  { value: "balanced", label: "Balanceret" },
                  { value: "thorough", label: "Grundig" },
                ]}
                value={params.speedQuality}
                onChange={(v) =>
                  setParams({
                    ...params,
                    speedQuality: v as CockpitParams["speedQuality"],
                  })
                }
              />
            </div>
          </div>

          {/* Model engine */}
          <div className="rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Model Engine</h2>

            <div>
              <label style={labelStyle}>Primaer model</label>
              <select
                value={params.primaryModel}
                onChange={(e) =>
                  setParams({ ...params, primaryModel: e.target.value })
                }
                style={inputStyle}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.multiModelEnabled}
                onChange={(e) =>
                  setParams({
                    ...params,
                    multiModelEnabled: e.target.checked,
                  })
                }
              />
              Multi-model sammenligning
            </label>

            {params.multiModelEnabled && (
              <div>
                <label style={labelStyle}>Sammenligningsmodeller</label>
                <div className="space-y-1.5">
                  {MODELS.filter((m) => m.value !== params.primaryModel).map(
                    (m) => (
                      <label
                        key={m.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={params.compareModels.includes(m.value)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...params.compareModels, m.value]
                              : params.compareModels.filter(
                                  (v) => v !== m.value
                                );
                            setParams({ ...params, compareModels: next });
                          }}
                        />
                        {m.label}
                      </label>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Gemmer..." : "Gem Indstillinger"}
          </button>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Budget */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Budget</h2>
            <div>
              <label style={labelStyle}>Maanedligt budget (USD)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={params.monthlyBudgetUsd}
                onChange={(e) =>
                  setParams({
                    ...params,
                    monthlyBudgetUsd: Number(e.target.value),
                  })
                }
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Brugt denne maaned</label>
              <p className="text-lg font-mono font-bold text-foreground">
                ${params.currentMonthSpentUsd.toFixed(2)}
              </p>
            </div>
            <div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetColor}`}
                  style={{ width: `${Math.min(100, budgetPct)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {budgetPct.toFixed(0)}% af budget brugt
              </p>
            </div>
          </div>

          {/* Status monitor */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Status Monitor</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Klar</span>
                <span className="font-mono">{queueStats.ready ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Under review</span>
                <span className="font-mono">{queueStats.in_review ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Godkendt</span>
                <span className="font-mono">{queueStats.approved ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Afvist</span>
                <span className="font-mono">{queueStats.rejected ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Sync */}
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-sm hover:bg-secondary transition-colors disabled:opacity-60"
          >
            <RefreshCw
              className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Synkroniserer..." : "Re-Sync Orchestrator"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex border border-border rounded-lg overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
