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
import { CustomTimeInput } from "@/components/ui/custom-time-input";
import { CustomRangeSlider } from "@/components/ui/custom-range-slider";
import { AgentsList } from "@/components/agents-list";
import type { AgentConfig } from "@/lib/agents";
import type { AgentTemplate } from "@/lib/agent-templates";
import type { AgentWorkflow } from "@/lib/agent-workflows";
import { useT } from "@/lib/i18n-context";
import { useFormat } from "@/lib/format-locale";

type TabId = "agents" | "templates" | "workflows";

const STORAGE_KEY = "cms:agents-tab";

const TABS: { id: TabId; label: string }[] = [
  { id: "agents", label: "agents.agentsTabs.tabAgents" },
  { id: "templates", label: "agents.agentsTabs.tabTemplates" },
  { id: "workflows", label: "agents.agentsTabs.tabWorkflows" },
];

export function AgentsTabs({ agents, readOnly }: { agents: AgentConfig[]; readOnly: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<TabId>("agents");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as TabId | null;
      if (saved && (saved === "agents" || saved === "templates" || saved === "workflows")) {
        setTab(saved);
      }
    } catch { /* ignore */ }
  }, []);

  function switchTab(next: TabId) {
    setTab(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((tb) => (
          <button
            data-testid={`agents-tab-${tb.id}`}
            key={tb.id}
            type="button"
            onClick={() => switchTab(tb.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
              tab === tb.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tb.label)}
            {tb.id === "agents" && agents.length > 0 && (
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

interface EditDraft {
  name: string;
  description: string;
  category: string;
  systemPrompt: string;
  temperature: number;
  formality: number;
  verbosity: number;
  webSearch: boolean;
  internalDatabase: boolean;
  imageGeneration: boolean;
}

function TemplatesTab({ readOnly }: { readOnly: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [local, setLocal] = useState<AgentTemplate[]>([]);
  const [marketplace, setMarketplace] = useState<AgentTemplate[]>([]);
  const [marketplaceError, setMarketplaceError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

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

  function startEditTemplate(tpl: AgentTemplate) {
    const p = tpl.payload as Record<string, unknown>;
    const beh = (p.behavior ?? {}) as { temperature?: number; formality?: number; verbosity?: number };
    const tools = (p.tools ?? {}) as { webSearch?: boolean; internalDatabase?: boolean; imageGeneration?: boolean };
    setEditingId(tpl.id);
    setEditDraft({
      name: tpl.name,
      description: tpl.description ?? "",
      category: tpl.category ?? "",
      systemPrompt: typeof p.systemPrompt === "string" ? p.systemPrompt : "",
      temperature: beh.temperature ?? 50,
      formality: beh.formality ?? 50,
      verbosity: beh.verbosity ?? 50,
      webSearch: !!tools.webSearch,
      internalDatabase: tools.internalDatabase !== false,
      imageGeneration: !!tools.imageGeneration,
    });
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
    setEditError("");
  }

  async function handleSaveEdit(tpl: AgentTemplate) {
    if (!editDraft) return;
    setSaving(true);
    setEditError("");
    try {
      // Reuse the existing payload as the base, then patch the editable fields.
      // Anything we don't expose in the form (autonomy, targetCollections,
      // fieldDefaults, role) is preserved.
      const basePayload = (tpl.payload ?? {}) as Record<string, unknown>;
      const newPayload = {
        ...basePayload,
        name: editDraft.name,
        systemPrompt: editDraft.systemPrompt,
        behavior: {
          temperature: editDraft.temperature,
          formality: editDraft.formality,
          verbosity: editDraft.verbosity,
        },
        tools: {
          webSearch: editDraft.webSearch,
          internalDatabase: editDraft.internalDatabase,
          imageGeneration: editDraft.imageGeneration,
        },
      };
      const res = await fetch(`/api/cms/agent-templates/${tpl.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name,
          description: editDraft.description,
          category: editDraft.category || undefined,
          payload: newPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? t("agents.agentsTabs.failedToSave"));
        return;
      }
      cancelEdit();
      await load();
    } catch {
      setEditError(t("agents.agentsTabs.networkError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("agents.agentsTabs.loadingTemplates")}</p>;
  }

  return (
    <div className="space-y-8">
      {/* Local templates */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t("agents.agentsTabs.yourOrg", { count: local.length })}
          </p>
          <p className="text-xs text-muted-foreground ml-auto">
            {t("agents.agentsTabs.yourOrgHint")}
          </p>
        </div>
        {local.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {(() => {
              const [before, after] = t("agents.agentsTabs.localEmpty", { button: "\u0000" }).split("\u0000");
              return <>{before}<strong>{t("agents.agentsTabs.saveAsTemplate")}</strong>{after}</>;
            })()}
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: editingId ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {local.map((tpl) => (
              editingId === tpl.id && editDraft ? (
                <div key={tpl.id} className="rounded-lg border border-primary/40 bg-primary/5 p-5 space-y-3">
                  <p className="text-sm font-semibold">{t("agents.agentsTabs.editTemplate")}</p>
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.name")}</label>
                    <input
                      data-testid="template-name-input"
                      type="text"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.description")}</label>
                    <input
                      data-testid="template-description-input"
                      type="text"
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.category")}</label>
                    <input
                      data-testid="template-category-input"
                      type="text"
                      value={editDraft.category}
                      onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                      placeholder={t("agents.agentsTabs.categoryPlaceholder")}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.systemPrompt")}</label>
                    <textarea
                      data-testid="template-system-prompt-textarea"
                      value={editDraft.systemPrompt}
                      onChange={(e) => setEditDraft({ ...editDraft, systemPrompt: e.target.value })}
                      rows={6}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.creativity", { value: editDraft.temperature })}</label>
                      <CustomRangeSlider min={0} max={100} value={editDraft.temperature} onChange={(v) => setEditDraft({ ...editDraft, temperature: v })} />
                    </div>
                    <div>
                      <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.formality", { value: editDraft.formality })}</label>
                      <CustomRangeSlider min={0} max={100} value={editDraft.formality} onChange={(v) => setEditDraft({ ...editDraft, formality: v })} />
                    </div>
                    <div>
                      <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.verbosity", { value: editDraft.verbosity })}</label>
                      <CustomRangeSlider min={0} max={100} value={editDraft.verbosity} onChange={(v) => setEditDraft({ ...editDraft, verbosity: v })} />
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input data-testid="template-websearch-checkbox" type="checkbox" checked={editDraft.webSearch} onChange={(e) => setEditDraft({ ...editDraft, webSearch: e.target.checked })} className="accent-primary" />
                      {t("agents.agentsTabs.webSearch")}
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input data-testid="template-internal-db-checkbox" type="checkbox" checked={editDraft.internalDatabase} onChange={(e) => setEditDraft({ ...editDraft, internalDatabase: e.target.checked })} className="accent-primary" />
                      {t("agents.agentsTabs.internalDatabase")}
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input data-testid="template-imggen-checkbox" type="checkbox" checked={editDraft.imageGeneration} onChange={(e) => setEditDraft({ ...editDraft, imageGeneration: e.target.checked })} className="accent-primary" />
                      {t("agents.agentsTabs.imageGeneration")}
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      data-testid="template-save-button"
                      type="button"
                      onClick={() => handleSaveEdit(tpl)}
                      disabled={saving || !editDraft.name.trim()}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? t("agents.agentsTabs.saving") : t("agents.agentsTabs.saveChanges")}
                    </button>
                    <button
                      data-testid="template-cancel-button"
                      type="button"
                      onClick={cancelEdit}
                      className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
                    >
                      {t("agents.agentsTabs.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
              <div
                key={tpl.id}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {tpl.icon ? `${tpl.icon} ` : ""}{tpl.name}
                    </p>
                    {tpl.category && (
                      <span className="inline-block mt-1 text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                        {tpl.category}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    confirming === tpl.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>{t("agents.agentsTabs.removeConfirm")}</span>
                        <button
                          data-testid="template-confirm-delete"
                          type="button"
                          onClick={() => handleDelete(tpl.id)}
                          disabled={deleting === tpl.id}
                          style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                        >
                          {t("agents.agentsTabs.yes")}
                        </button>
                        <button
                          data-testid="template-cancel-delete"
                          type="button"
                          onClick={() => setConfirming(null)}
                          style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                        >
                          {t("agents.agentsTabs.no")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          data-testid="template-edit-button"
                          type="button"
                          onClick={() => startEditTemplate(tpl)}
                          title={t("agents.agentsTabs.editTemplate")}
                          className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          data-testid="template-delete-button"
                          type="button"
                          onClick={() => setConfirming(tpl.id)}
                          title={t("agents.agentsTabs.deleteTemplate")}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {tpl.description || <em>{t("agents.agentsTabs.noDescription")}</em>}
                </p>
                <p className="text-[0.65rem] font-mono text-muted-foreground/70 mt-auto">
                  {t("agents.agentsTabs.savedOn", { date: fmt.date(tpl.createdAt) })}
                </p>
              </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Marketplace templates */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {t("agents.agentsTabs.marketplace", { count: marketplace.length })}
          </p>
          <p className="text-xs text-muted-foreground ml-auto">
            {t("agents.agentsTabs.marketplaceHint")}
          </p>
        </div>
        {marketplace.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {marketplaceError
              ? <>{t("agents.agentsTabs.marketplaceUnreachable")}<span className="italic">{marketplaceError}</span></>
              : (() => {
                  const [before, after] = t("agents.agentsTabs.marketplaceEmpty", { repo: "\u0000" }).split("\u0000");
                  return <>{before}<code className="text-xs">webhousecode/cms-agents</code>{after}</>;
                })()
            }
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {marketplace.map((tpl) => (
              <Link
                key={tpl.id}
                href={`/admin/agents/new?template=${tpl.id}`}
                className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <p className="font-semibold text-sm truncate">
                  {tpl.icon ? `${tpl.icon} ` : ""}{tpl.name}
                </p>
                {tpl.category && (
                  <span className="inline-block self-start text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {tpl.category}
                  </span>
                )}
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {tpl.description || <em>{t("agents.agentsTabs.noDescription")}</em>}
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
  const t = useT();
  const fmt = useFormat();
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
    // Command Palette can request the create form pre-opened by setting
    // a one-shot localStorage flag before navigating here.
    try {
      if (localStorage.getItem("cms:agents-workflows-create") === "1") {
        localStorage.removeItem("cms:agents-workflows-create");
        setCreating(true);
      }
    } catch { /* ignore */ }
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
        if (typeof parsed.name !== "string") throw new Error(t("agents.agentsTabs.nameMustBeString"));
        if (!Array.isArray(parsed.steps)) throw new Error(t("agents.agentsTabs.stepsMustBeArray"));
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
        setJsonError(err instanceof Error ? err.message : t("agents.agentsTabs.invalidJson"));
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
        setJsonError(err instanceof Error ? err.message : t("agents.agentsTabs.invalidJson"));
        return;
      }
    } else {
      body = currentBody();
    }
    if (!body.name?.trim() || !Array.isArray(body.steps) || body.steps.length === 0) {
      setError(t("agents.agentsTabs.nameAndStepRequired"));
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
        setError(data.error ?? (isEdit ? t("agents.agentsTabs.failedUpdateWorkflow") : t("agents.agentsTabs.failedCreateWorkflow")));
        return;
      }
      resetForm();
      await load();
    } catch {
      setError(t("agents.agentsTabs.networkError"));
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
        setError(data.error ?? t("agents.agentsTabs.workflowFailed"));
        return;
      }
      setRunning(id);
      setRunPrompt((p) => ({ ...p, [id]: "" }));
      await load();
      setTimeout(() => setRunning(null), 3000);
    } catch {
      setError(t("agents.agentsTabs.networkError"));
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

  if (loading) return <p className="text-sm text-muted-foreground">{t("agents.agentsTabs.loadingWorkflows")}</p>;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {t("agents.agentsTabs.pipelines", { count: workflows.length })}
        </p>
        {!readOnly && !creating && (
          <button
            data-testid="workflow-create-button"
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("agents.agentsTabs.newWorkflow")}
          </button>
        )}
      </div>

      {creating && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{editingId ? t("agents.agentsTabs.editWorkflow") : t("agents.agentsTabs.newWorkflow")}</p>
            <ModeToggle mode={formMode} onToggle={switchMode} />
          </div>

          {formMode === "json" ? (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">{t("agents.agentsTabs.workflowJson")}</label>
              <textarea
                data-testid="workflow-json-textarea"
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
                {t("agents.agentsTabs.jsonHint", { button: editingId ? t("agents.agentsTabs.saveChanges") : t("agents.agentsTabs.create") })}
              </p>
            </div>
          ) : (
            <>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">{t("agents.agentsTabs.name")}</label>
            <input
              data-testid="workflow-name-input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("agents.agentsTabs.workflowNamePlaceholder")}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">{t("agents.agentsTabs.steps")}</label>
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
            <p className="text-[0.65rem] uppercase font-mono text-muted-foreground mb-1">{t("agents.agentsTabs.addAgent")}</p>
            <div className="flex flex-wrap gap-1.5">
              {agents.filter((a) => a.active).map((a) => (
                <button
                  data-testid={`workflow-add-agent-${a.id}`}
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
                data-testid="workflow-schedule-checkbox"
                type="checkbox"
                checked={newScheduleEnabled}
                onChange={(e) => setNewScheduleEnabled(e.target.checked)}
                className="accent-primary"
              />
              {t("agents.agentsTabs.runOnSchedule")}
            </label>
            {newScheduleEnabled && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.frequency")}</label>
                    <select
                      data-testid="workflow-frequency-select"
                      value={newFrequency}
                      onChange={(e) => setNewFrequency(e.target.value as "daily" | "weekly" | "manual" | "cron")}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
                    >
                      <option value="daily">{t("agents.agentsTabs.daily")}</option>
                      <option value="weekly">{t("agents.agentsTabs.weeklyMon")}</option>
                      <option value="manual">{t("agents.agentsTabs.manual")}</option>
                      <option value="cron">{t("agents.agentsTabs.cronAdvanced")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.time")}</label>
                    <CustomTimeInput
                      value={newTime}
                      onChange={setNewTime}
                      disabled={newFrequency === "cron"}
                    />
                  </div>
                  <div>
                    <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">{t("agents.agentsTabs.maxPerRun")}</label>
                    <input
                      data-testid="workflow-maxperrun-input"
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
                      {t("agents.agentsTabs.cronExpression")}
                    </label>
                    <input
                      data-testid="workflow-cron-input"
                      type="text"
                      value={newCron}
                      onChange={(e) => setNewCron(e.target.value)}
                      placeholder="0 9 * * 1-5"
                      spellCheck={false}
                      className="w-full px-2 py-1 rounded border border-border bg-background text-xs font-mono"
                    />
                    <p className="text-[0.65rem] text-muted-foreground mt-1 leading-snug">
                      {t("agents.agentsTabs.cronSyntax")} <code>min hour dom month dow</code>. {t("agents.agentsTabs.cronHelp")}
                      <br />
                      <code>0 9 * * 1-5</code> {t("agents.agentsTabs.cronExWeekdays")}
                      {"\u00a0·\u00a0"}
                      <code>0 */6 * * *</code> {t("agents.agentsTabs.cronExEvery6h")}
                      {"\u00a0·\u00a0"}
                      <code>0 8 1 * *</code> {t("agents.agentsTabs.cronExMonthly")}
                    </p>
                  </div>
                )}
                <div>
                  <label className="text-[0.65rem] font-mono uppercase text-muted-foreground block mb-0.5">
                    {t("agents.agentsTabs.defaultPrompt")}
                  </label>
                  <textarea
                    data-testid="workflow-defaultprompt-textarea"
                    value={newDefaultPrompt}
                    onChange={(e) => setNewDefaultPrompt(e.target.value)}
                    rows={2}
                    placeholder={t("agents.agentsTabs.defaultPromptPlaceholder")}
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
              data-testid="workflow-save-button"
              type="button"
              onClick={handleSave}
              disabled={formMode === "ui" ? (!newName.trim() || newSteps.length === 0) : !jsonDraft.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {editingId ? t("agents.agentsTabs.saveChanges") : t("agents.agentsTabs.create")}
            </button>
            <button
              data-testid="workflow-cancel-button"
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
            >
              {t("agents.agentsTabs.cancel")}
            </button>
          </div>
        </div>
      )}

      {workflows.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Workflow className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground mb-1">{t("agents.agentsTabs.noWorkflows")}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {t("agents.agentsTabs.noWorkflowsHint")}
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
                    <span>{t("agents.agentsTabs.runs", { count: wf.stats.totalRuns })}</span>
                    <span>{t("agents.agentsTabs.totalCost", { cost: wf.stats.totalCostUsd.toFixed(4) })}</span>
                    {wf.stats.lastRunAt && <span>{t("agents.agentsTabs.lastRun", { date: fmt.dateTime(wf.stats.lastRunAt) })}</span>}
                  </div>
                </div>
                {!readOnly && (
                  confirming === wf.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>{t("agents.agentsTabs.removeConfirm")}</span>
                      <button data-testid="workflow-confirm-delete" type="button" onClick={() => handleDelete(wf.id)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>
                        {t("agents.agentsTabs.yes")}
                      </button>
                      <button data-testid="workflow-cancel-delete" type="button" onClick={() => setConfirming(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>
                        {t("agents.agentsTabs.no")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        data-testid="workflow-edit-button"
                        type="button"
                        onClick={() => startEdit(wf)}
                        title={t("agents.agentsTabs.editWorkflow")}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        data-testid="workflow-delete-button"
                        type="button"
                        onClick={() => setConfirming(wf.id)}
                        title={t("agents.agentsTabs.deleteWorkflow")}
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
                      data-testid={`workflow-run-prompt-${wf.id}`}
                      value={runPrompt[wf.id] ?? ""}
                      onChange={(e) => setRunPrompt((p) => ({ ...p, [wf.id]: e.target.value }))}
                      rows={2}
                      placeholder={t("agents.agentsTabs.runPromptPlaceholder")}
                      className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs resize-none"
                      disabled={runningId === wf.id}
                    />
                  </div>
                  <button
                    data-testid="workflow-run-button"
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
                    {runningId === wf.id ? t("agents.agentsTabs.running") : running === wf.id ? t("agents.agentsTabs.done") : t("agents.agentsTabs.run")}
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
