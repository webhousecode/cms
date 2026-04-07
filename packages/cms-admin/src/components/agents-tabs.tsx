"use client";

/**
 * Tab shell for /admin/agents — Phase 6.
 *
 * Three tabs:
 *  - Agents: the existing AgentsList
 *  - Templates: manage local org templates (delete, browse marketplace)
 *  - Workflows: pipeline runner (placeholder until Chunk 2)
 *
 * Tab choice persisted to localStorage so it survives tab switches.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Trash2, HardDrive, Globe, Workflow, Play, Loader2, CheckCircle, ChevronRight } from "lucide-react";
import { AgentsList } from "@/components/agents-list";
import type { AgentConfig } from "@/lib/agents";
import type { AgentTemplate } from "@/lib/agent-templates";
import type { AgentWorkflow } from "@/lib/agent-workflows";

type TabId = "agents" | "templates" | "workflows";

const STORAGE_KEY = "cms:agents-tab";

const TABS: { id: TabId; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "templates", label: "Templates" },
  { id: "workflows", label: "Workflows" },
];

export function AgentsTabs({ agents, readOnly }: { agents: AgentConfig[]; readOnly: boolean }) {
  const [tab, setTab] = useState<TabId>("agents");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as TabId | null;
      if (saved && (saved === "agents" || saved === "templates" || saved === "workflows")) {
        setTab(saved);
      }
    } catch { /* ignore */ }
  }, []);

  function switchTab(t: TabId) {
    setTab(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "agents" && agents.length > 0 && (
              <span className="ml-1.5 text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                {agents.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "agents" && <AgentsList agents={agents} readOnly={readOnly} />}
      {tab === "templates" && <TemplatesTab readOnly={readOnly} />}
      {tab === "workflows" && <WorkflowsTab agents={agents} readOnly={readOnly} />}
    </div>
  );
}

function TemplatesTab({ readOnly }: { readOnly: boolean }) {
  const [local, setLocal] = useState<AgentTemplate[]>([]);
  const [marketplace, setMarketplace] = useState<AgentTemplate[]>([]);
  const [marketplaceError, setMarketplaceError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cms/agent-templates");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLocal(data.local ?? []);
      setMarketplace(data.marketplace ?? []);
      setMarketplaceError(data.marketplaceError);
    } catch {
      // leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    setConfirming(null);
    try {
      await fetch(`/api/cms/agent-templates/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading templates…</p>;
  }

  return (
    <div className="space-y-8">
      {/* Local templates */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Your org ({local.length})
          </p>
          <p className="text-xs text-muted-foreground ml-auto">
            Saved from existing agents via the &ldquo;Save as template&rdquo; button. Shared across every site in this org.
          </p>
        </div>
        {local.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No local templates yet. Open an agent and click <strong>Save as template</strong> in the action bar to make one.
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {local.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {t.icon ? `${t.icon} ` : ""}{t.name}
                    </p>
                    {t.category && (
                      <span className="inline-block mt-1 text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {t.category}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    confirming === t.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          disabled={deleting === t.id}
                          style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(t.id)}
                        title="Delete template"
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {t.description || <em>No description</em>}
                </p>
                <p className="text-[0.65rem] font-mono text-muted-foreground/70 mt-auto">
                  Saved {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Marketplace templates */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Marketplace ({marketplace.length})
          </p>
          <p className="text-xs text-muted-foreground ml-auto">
            Curated by the people behind webhouse.app — updated automatically.
          </p>
        </div>
        {marketplace.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {marketplaceError
              ? <>Marketplace unreachable — <span className="italic">{marketplaceError}</span></>
              : <>The marketplace is currently empty. New templates land at <code className="text-xs">webhousecode/cms-agents</code>.</>
            }
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {marketplace.map((t) => (
              <Link
                key={t.id}
                href={`/admin/agents/new?template=${t.id}`}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="font-semibold text-sm truncate">
                  {t.icon ? `${t.icon} ` : ""}{t.name}
                </p>
                {t.category && (
                  <span className="inline-block self-start text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {t.category}
                  </span>
                )}
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {t.description || <em>No description</em>}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowsTab({ agents, readOnly }: { agents: AgentConfig[]; readOnly: boolean }) {
  const [workflows, setWorkflows] = useState<AgentWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSteps, setNewSteps] = useState<string[]>([]);
  const [newScheduleEnabled, setNewScheduleEnabled] = useState(false);
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly" | "manual">("daily");
  const [newTime, setNewTime] = useState("06:00");
  const [newMaxPerRun, setNewMaxPerRun] = useState(1);
  const [newDefaultPrompt, setNewDefaultPrompt] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [runPrompt, setRunPrompt] = useState<Record<string, string>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cms/workflows");
      if (res.ok) setWorkflows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const agentNameById = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  async function handleCreate() {
    if (!newName.trim() || newSteps.length === 0) return;
    setError("");
    try {
      const res = await fetch("/api/cms/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          steps: newSteps.map((agentId) => ({ agentId })),
          active: true,
          schedule: {
            enabled: newScheduleEnabled,
            frequency: newFrequency,
            time: newTime,
            maxPerRun: newMaxPerRun,
          },
          defaultPrompt: newDefaultPrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create workflow");
        return;
      }
      setNewName("");
      setNewSteps([]);
      setNewScheduleEnabled(false);
      setNewFrequency("daily");
      setNewTime("06:00");
      setNewMaxPerRun(1);
      setNewDefaultPrompt("");
      setCreating(false);
      await load();
    } catch {
      setError("Network error");
    }
  }

  async function handleDelete(id: string) {
    setConfirming(null);
    await fetch(`/api/cms/workflows/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleRun(id: string) {
    const prompt = (runPrompt[id] ?? "").trim();
    if (!prompt) return;
    setRunningId(id);
    setError("");
    try {
      const res = await fetch(`/api/cms/workflows/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Workflow failed");
        return;
      }
      setRunning(id);
      setRunPrompt((p) => ({ ...p, [id]: "" }));
      await load();
      setTimeout(() => setRunning(null), 3000);
    } catch {
      setError("Network error");
    } finally {
      setRunningId(null);
    }
  }

  function addStep(agentId: string) {
    setNewSteps((s) => [...s, agentId]);
  }
  function removeStep(idx: number) {
    setNewSteps((s) => s.filter((_, i) => i !== idx));
  }
  function moveStep(idx: number, dir: -1 | 1) {
    setNewSteps((s) => {
      const next = [...s];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading workflows…</p>;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Pipelines ({workflows.length})
        </p>
        {!readOnly && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            New workflow
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <p className="text-sm font-semibold">New workflow</p>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Writer → SEO → Translator"
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">Steps</label>
            {newSteps.length === 0 ? (
              <p className="text-xs text-muted-foreground italic mb-2">No steps yet — add agents below.</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {newSteps.map((stepAgentId, idx) => (
                  <div key={`${stepAgentId}-${idx}`} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card">
                    <span className="text-[0.65rem] font-mono text-muted-foreground w-6">#{idx + 1}</span>
                    <span className="text-sm flex-1 font-medium">{agentNameById(stepAgentId)}</span>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, -1)}
                      disabled={idx === 0}
                      className="text-xs px-1.5 py-0.5 rounded border border-border disabled:opacity-30"
                      title="Move up"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => moveStep(idx, 1)}
                      disabled={idx === newSteps.length - 1}
                      className="text-xs px-1.5 py-0.5 rounded border border-border disabled:opacity-30"
                      title="Move down"
                    >↓</button>
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="text-xs px-1.5 py-0.5 rounded text-destructive hover:bg-destructive/10"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[0.65rem] uppercase font-mono text-muted-foreground mb-1">Add agent</p>
            <div className="flex flex-wrap gap-1.5">
              {agents.filter((a) => a.active).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => addStep(a.id)}
                  className="text-xs px-2 py-1 rounded-md border border-border hover:border-primary hover:bg-primary/5"
                >
                  + {a.name}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule (optional) */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={newScheduleEnabled}
                onChange={(e) => setNewScheduleEnabled(e.target.checked)}
                className="accent-primary"
              />
              Run on a schedule
            </label>
            {newScheduleEnabled && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">Frequency</label>
                    <select
                      value={newFrequency}
                      onChange={(e) => setNewFrequency(e.target.value as "daily" | "weekly" | "manual")}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly (Mon)</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">Time</label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">Max per run</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={newMaxPerRun}
                      onChange={(e) => setNewMaxPerRun(Number(e.target.value))}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">
                    Default prompt (sent to step 1 on each scheduled run)
                  </label>
                  <textarea
                    value={newDefaultPrompt}
                    onChange={(e) => setNewDefaultPrompt(e.target.value)}
                    rows={2}
                    placeholder="e.g. Write a fresh blog post about a topic the site hasn't covered yet."
                    className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs resize-none"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || newSteps.length === 0}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(""); setNewSteps([]); }}
              className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {workflows.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Workflow className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground mb-1">No workflows yet</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Chain multiple agents into a single pipeline (e.g. Writer → SEO → Translator).
            One prompt in, one curation queue item out.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{wf.name}</p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {wf.steps.map((s, i) => (
                      <span key={s.id} className="flex items-center gap-1">
                        <span className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {agentNameById(s.agentId)}
                        </span>
                        {i < wf.steps.length - 1 && (
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[0.65rem] font-mono text-muted-foreground">
                    <span>{wf.stats.totalRuns} runs</span>
                    <span>${wf.stats.totalCostUsd.toFixed(4)} total</span>
                    {wf.stats.lastRunAt && <span>last: {new Date(wf.stats.lastRunAt).toLocaleString()}</span>}
                  </div>
                </div>
                {!readOnly && (
                  confirming === wf.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                      <button type="button" onClick={() => handleDelete(wf.id)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>
                        Yes
                      </button>
                      <button type="button" onClick={() => setConfirming(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(wf.id)}
                      title="Delete workflow"
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>

              {!readOnly && wf.steps.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex items-end gap-2">
                  <div className="flex-1">
                    <textarea
                      value={runPrompt[wf.id] ?? ""}
                      onChange={(e) => setRunPrompt((p) => ({ ...p, [wf.id]: e.target.value }))}
                      rows={2}
                      placeholder="Prompt to start the pipeline (sent to step 1)"
                      className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs resize-none"
                      disabled={runningId === wf.id}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRun(wf.id)}
                    disabled={runningId === wf.id || !(runPrompt[wf.id] ?? "").trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {runningId === wf.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : running === wf.id ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {runningId === wf.id ? "Running…" : running === wf.id ? "Done" : "Run"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
