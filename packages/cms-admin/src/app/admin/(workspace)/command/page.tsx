"use client";

import { useState, useEffect } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import { CustomSelect } from "@/components/ui/custom-select";
import { Checkbox } from "@/components/ui/checkbox-styled";
import { useSiteRole } from "@/hooks/use-site-role";

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
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
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
        <p className="text-sm text-muted-foreground">Loading...</p>
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
    <>
    <ActionBar
      actions={!readOnly ? (
        <ActionButton variant="primary" onClick={handleSave} disabled={saving}
          icon={saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Save style={{ width: 14, height: 14 }} />}>
          {saving ? "Saving..." : "Save Settings"}
        </ActionButton>
      ) : undefined}
    >
      <ActionBarBreadcrumb items={["AI", "Cockpit"]} />
    </ActionBar>
    <div className="p-8 max-w-5xl">

      <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, opacity: readOnly ? 0.7 : 1 }}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Global params */}
          <div className="rounded-xl border border-border p-5 space-y-5">
            <h2 className="font-semibold text-foreground">
              Global Parameters
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
                <span>Factual</span>
                <span>Creative</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Prompt Depth</label>
              <SegmentedControl
                options={[
                  { value: "minimal", label: "Minimal" },
                  { value: "medium", label: "Medium" },
                  { value: "deep", label: "Deep" },
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
                <span className="text-xs font-medium">SEO Weight</span>
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
                <span>Creative freedom</span>
                <span>SEO optimized</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Speed / Quality</label>
              <SegmentedControl
                options={[
                  { value: "fast", label: "Fast" },
                  { value: "balanced", label: "Balanced" },
                  { value: "thorough", label: "Thorough" },
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
              <label style={labelStyle}>Primary model</label>
              <CustomSelect
                options={MODELS}
                value={params.primaryModel}
                onChange={(v) => setParams({ ...params, primaryModel: v })}
              />
            </div>

            <Checkbox
              checked={params.multiModelEnabled}
              onChange={(v) =>
                setParams({
                  ...params,
                  multiModelEnabled: v,
                })
              }
              label="Multi-model comparison"
            />

            {params.multiModelEnabled && (
              <div>
                <label style={labelStyle}>Compare models</label>
                <div className="space-y-1.5">
                  {MODELS.filter((m) => m.value !== params.primaryModel).map(
                    (m) => (
                      <Checkbox
                        key={m.value}
                        checked={params.compareModels.includes(m.value)}
                        onChange={(v) => {
                          const next = v
                            ? [...params.compareModels, m.value]
                            : params.compareModels.filter(
                                (val) => val !== m.value
                              );
                          setParams({ ...params, compareModels: next });
                        }}
                        label={m.label}
                      />
                    )
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Budget */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Budget</h2>
            <div>
              <label style={labelStyle}>Monthly budget (USD)</label>
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
              <label style={labelStyle}>Spent this month</label>
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
                {budgetPct.toFixed(0)}% of budget used
              </p>
            </div>
          </div>

          {/* Status monitor */}
          <div className="rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold text-foreground">Status Monitor</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ready</span>
                <span className="font-mono">{queueStats.ready ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In review</span>
                <span className="font-mono">{queueStats.in_review ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved</span>
                <span className="font-mono">{queueStats.approved ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rejected</span>
                <span className="font-mono">{queueStats.rejected ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Sync */}
          {!readOnly && (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-sm hover:bg-secondary transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing..." : "Re-Sync Orchestrator"}
            </button>
          )}
        </div>
      </div>
      </fieldset>
    </div>
    </>
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
