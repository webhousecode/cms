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
import { Plus, Trash2, HardDrive, Globe, Workflow, Play, Loader2, CheckCircle, ChevronRight, Pencil } from "lucide-react";
import { SortableWorkflowSteps } from "@/components/sortable-workflow-steps";
import { ModeToggle } from "@/components/ui/mode-toggle";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // Each step carries a stable row id (independent of agentId) so DnD
  // sorting works even when the same agent appears twice in a pipeline.
  // Phase 6 polish: optional overrideCollection lets the curator override
  // the agent's default targetCollection for this specific step.
  const [newSteps, setNewSteps] = useState<{ id: string; agentId: string; overrideCollection?: string }[]>([]);
  const [newScheduleEnabled, setNewScheduleEnabled] = useState(false);
  const [newFrequency, setNewFrequency] = useState<"daily" | "weekly" | "manual" | "cron">("daily");
  const [newTime, setNewTime] = useState("06:00");
  const [newMaxPerRun, setNewMaxPerRun] = useState(1);
  const [newDefaultPrompt, setNewDefaultPrompt] = useState("");
  const [newCron, setNewCron] = useState("");
  // ui ↔ json toggle for the create/edit form
  const [formMode, setFormMode] = useState<"ui" | "json">("ui");
  const [jsonDraft, setJsonDraft] = useState<string>("");
  const [jsonError, setJsonError] = useState<string>("");
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

  function resetForm() {
    setNewName("");
    setNewSteps([]);
    setNewScheduleEnabled(false);
    setNewFrequency("daily");
    setNewTime("06:00");
    setNewMaxPerRun(1);
    setNewDefaultPrompt("");
    setNewCron("");
    setCreating(false);
    setEditingId(null);
    setFormMode("ui");
    setJsonDraft("");
    setJsonError("");
  }

  function startEdit(wf: AgentWorkflow) {
    setEditingId(wf.id);
    setNewName(wf.name);
    setNewSteps(wf.steps.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      ...(s.overrideCollection ? { overrideCollection: s.overrideCollection } : {}),
    })));
    // Workflows created before chunk 2 don't have a schedule field — fall
    // back to the same defaults the API uses for new workflows.
    const sched = wf.schedule ?? { enabled: false, frequency: "manual" as const, time: "06:00", maxPerRun: 1 };
    setNewScheduleEnabled(sched.enabled);
    setNewFrequency(sched.frequency);
    setNewTime(sched.time);
    setNewMaxPerRun(sched.maxPerRun);
    setNewCron((sched as { cron?: string }).cron ?? "");
    setNewDefaultPrompt(wf.defaultPrompt ?? "");
    setCreating(true);
    setFormMode("ui");
    setJsonError("");
  }

  /** Build the workflow JSON body the form currently represents. */
  function currentBody() {
    return {
      name: newName.trim(),
      steps: newSteps.map((s) => ({
        id: s.id,
        agentId: s.agentId,
        ...(s.overrideCollection?.trim() ? { overrideCollection: s.overrideCollection.trim() } : {}),
      })),
      active: true,
      schedule: {
        enabled: newScheduleEnabled,
        frequency: newFrequency,
        time: newTime,
        maxPerRun: newMaxPerRun,
        ...(newFrequency === "cron" && newCron.trim() ? { cron: newCron.trim() } : {}),
      },
      defaultPrompt: newDefaultPrompt.trim() || undefined,
    };
  }

  /** Switch between UI and JSON modes, syncing the JSON draft from
   *  the form fields when entering JSON mode and parsing it back when
   *  leaving. Bad JSON shows an error and keeps the user in JSON mode. */
  function switchMode() {
    if (formMode === "ui") {
      setJsonDraft(JSON.stringify(currentBody(), null, 2));
      setJsonError("");
      setFormMode("json");
    } else {
      try {
        const parsed = JSON.parse(jsonDraft);
        if (typeof parsed.name !== "string") throw new Error("name must be a string");
        if (!Array.isArray(parsed.steps)) throw new Error("steps must be an array");
        setNewName(parsed.name ?? "");
        setNewSteps(
          (parsed.steps as { id?: string; agentId?: string }[]).map((s, i) => ({
            id: s.id ?? `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            agentId: s.agentId ?? "",
          })).filter((s) => s.agentId),
        );
        if (parsed.schedule) {
          setNewScheduleEnabled(!!parsed.schedule.enabled);
          if (parsed.schedule.frequency) setNewFrequency(parsed.schedule.frequency);
          if (parsed.schedule.time) setNewTime(parsed.schedule.time);
          if (parsed.schedule.maxPerRun) setNewMaxPerRun(parsed.schedule.maxPerRun);
        }
        if (typeof parsed.defaultPrompt === "string") setNewDefaultPrompt(parsed.defaultPrompt);
        setJsonError("");
        setFormMode("ui");
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
      }
    }
  }

  async function handleSave() {
    setError("");
    // If the user is in JSON mode, parse it first so they can save
    // straight from the editor without manually clicking the toggle.
    let body: ReturnType<typeof currentBody>;
    if (formMode === "json") {
      try {
        body = JSON.parse(jsonDraft);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : "Invalid JSON");
        return;
      }
    } else {
      body = currentBody();
    }
    if (!body.name?.trim() || !Array.isArray(body.steps) || body.steps.length === 0) {
      setError("name and at least one step are required");
      return;
    }
    const isEdit = editingId !== null;
    const url = isEdit ? `/api/cms/workflows/${editingId}` : "/api/cms/workflows";
    try {
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed to ${isEdit ? "update" : "create"} workflow`);
        return;
      }
      resetForm();
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
    setNewSteps((s) => [
      ...s,
      {
        id: `step-${Date.now()}-${s.length}-${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        // overrideCollection left undefined; curator can fill in via the per-row input
      },
    ]);
  }
  function removeStep(rowId: string) {
    setNewSteps((s) => s.filter((step) => step.id !== rowId));
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
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{editingId ? "Edit workflow" : "New workflow"}</p>
            <ModeToggle mode={formMode} onToggle={switchMode} />
          </div>

          {formMode === "json" ? (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Workflow JSON</label>
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-md border border-border bg-background font-mono text-xs"
              />
              {jsonError && (
                <p className="text-xs text-destructive mt-1">⚠ {jsonError}</p>
              )}
              <p className="text-[0.65rem] text-muted-foreground mt-1">
                Switch back to UI mode to validate, or click {editingId ? "Save changes" : "Create"} to save directly from JSON.
              </p>
            </div>
          ) : (
            <>
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
            <SortableWorkflowSteps
              steps={newSteps.map((s) => ({
                id: s.id,
                agentId: s.agentId,
                agentName: agentNameById(s.agentId),
                overrideCollection: s.overrideCollection,
              }))}
              onReorder={(reordered) => setNewSteps(reordered.map((s) => ({
                id: s.id,
                agentId: s.agentId,
                ...(s.overrideCollection ? { overrideCollection: s.overrideCollection } : {}),
              })))}
              onRemove={removeStep}
              onCollectionChange={(id, value) => setNewSteps((prev) => prev.map((s) =>
                s.id === id ? { ...s, overrideCollection: value || undefined } : s
              ))}
            />
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
                      onChange={(e) => setNewFrequency(e.target.value as "daily" | "weekly" | "manual" | "cron")}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly (Mon)</option>
                      <option value="manual">Manual</option>
                      <option value="cron">Cron (advanced)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">Time</label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      disabled={newFrequency === "cron"}
                      title={newFrequency === "cron" ? "Time field ignored when frequency is cron" : undefined}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs disabled:opacity-50"
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
                {newFrequency === "cron" && (
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">
                      Cron expression
                    </label>
                    <input
                      type="text"
                      value={newCron}
                      onChange={(e) => setNewCron(e.target.value)}
                      placeholder="0 9 * * 1-5"
                      spellCheck={false}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs font-mono"
                    />
                    <p className="text-[0.65rem] text-muted-foreground mt-1 leading-snug">
                      5-field cron syntax: <code>min hour dom month dow</code>. The scheduler ticks every 5 minutes,
                      so cron expressions finer than 5 minutes are silently coarsened. Examples:
                      <br />
                      <code>0 9 * * 1-5</code> — weekdays at 09:00
                      &nbsp;·&nbsp;
                      <code>0 */6 * * *</code> — every 6 hours
                      &nbsp;·&nbsp;
                      <code>0 8 1 * *</code> — 1st of each month at 08:00
                    </p>
                  </div>
                )}
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
            </>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={formMode === "ui" ? (!newName.trim() || newSteps.length === 0) : !jsonDraft.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(wf)}
                        title="Edit workflow"
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(wf.id)}
                        title="Delete workflow"
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
