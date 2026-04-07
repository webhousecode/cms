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
import { Plus, Trash2, HardDrive, Globe, Workflow } from "lucide-react";
import { AgentsList } from "@/components/agents-list";
import type { AgentConfig } from "@/lib/agents";
import type { AgentTemplate } from "@/lib/agent-templates";

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
      {tab === "workflows" && <WorkflowsPlaceholder />}
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

function WorkflowsPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      <Workflow className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Workflows are coming next</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">
        Chain multiple agents into a pipeline (e.g. Writer → SEO → Translator) so a single prompt
        produces a fully-processed draft. Backend lands in the next chunk; this tab will become
        the workflow editor.
      </p>
    </div>
  );
}
