"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Check, X, Pencil, Volume2, StopCircle, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TabTitle } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";

interface QueueItem {
  id: string;
  agentId: string;
  agentName: string;
  collection: string;
  slug: string;
  title: string;
  status: "ready" | "in_review" | "approved" | "rejected" | "published";
  generatedAt: string;
  contentData: Record<string, unknown>;
  seoScore?: number;
  costUsd: number;
  rejectionFeedback?: string;
}

type TabId = "ready" | "in_review" | "approved" | "rejected";

const TABS: { id: TabId; label: string }[] = [
  { id: "ready", label: "Ready" },
  { id: "in_review", label: "In review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const VALID_TABS: TabId[] = ["ready", "in_review", "approved", "rejected"];
const STORAGE_KEY = "cms:curation-tab";

function getSavedTab(): TabId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as TabId | null;
    return v && VALID_TABS.includes(v) ? v : "ready";
  } catch { return "ready"; }
}

export default function CurationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [tab, setTab] = useState<TabId>(() => {
    // URL param wins (e.g. coming back from editor), otherwise localStorage
    const urlTab = searchParams.get("tab") as TabId | null;
    if (urlTab && VALID_TABS.includes(urlTab)) return urlTab;
    return getSavedTab();
  });

  function switchTab(t: TabId) {
    setTab(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    router.replace(`/admin/curation?tab=${t}`, { scroll: false });
  }
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [schemas, setSchemas] = useState<Record<string, { name: string; type: string; options?: { label: string; value: string }[] }[]>>({});

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/cms/curation?status=${tab}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [tab]);

  const loadCounts = useCallback(async () => {
    const res = await fetch("/api/cms/curation?stats=true");
    if (res.ok) setCounts(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  async function handleApprove(id: string) {
    await fetch(`/api/cms/curation/${id}/approve`, { method: "POST" });
    loadItems();
    loadCounts();
  }

  async function handleEditFirst(item: QueueItem) {
    // Create the document as a draft so the editor can open it
    const res = await fetch(`/api/cms/curation/${item.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asDraft: true }),
    });
    if (res.ok) {
      router.push(`/admin/${item.collection}/${item.slug}?from=curation`);
    }
  }

  async function handleReject(id: string) {
    if (!rejectFeedback.trim()) return;
    await fetch(`/api/cms/curation/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: rejectFeedback }),
    });
    setRejectingId(null);
    setRejectFeedback("");
    loadItems();
    loadCounts();
  }

  const [speakingId, setSpeakingId] = useState<string | null>(null);

  function handleSpeak(item: QueueItem) {
    if (speakingId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      if (speakingId === item.id) return; // toggle off
    }
    const text = `${item.title}. ${
      typeof item.contentData.content === "string"
        ? item.contentData.content.slice(0, 300)
        : ""
    }`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
    setSpeakingId(item.id);
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }

  async function loadSchema(collection: string) {
    if (schemas[collection]) return;
    const res = await fetch(`/api/cms/collections/${collection}/schema`);
    if (res.ok) {
      const data = await res.json();
      setSchemas((prev) => ({ ...prev, [collection]: data.fields }));
    }
  }

  async function handleEditFields(item: QueueItem) {
    if (editingId === item.id) {
      setEditingId(null);
      return;
    }
    await loadSchema(item.collection);
    setEditDraft({ ...item.contentData });
    setEditingId(item.id);
  }

  async function handleSaveFields(item: QueueItem) {
    const res = await fetch(`/api/cms/curation/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "update-fields", fields: editDraft }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, contentData: editDraft, title: (editDraft.title as string) ?? i.title }
            : i
        )
      );
      setEditingId(null);
    }
  }

  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div className="p-8 max-w-5xl">
      <TabTitle value="Curation Queue" />
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          AI
        </p>
        <h1 className="text-2xl font-bold text-foreground">Curation Queue</h1>
      </div>

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
            {(counts[t.id] ?? 0) > 0 && (
              <span className="ml-1.5 text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No items in this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />
                    <p className="font-semibold text-foreground truncate">
                      {item.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">draft</Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.agentName}
                    </span>
                    <Badge variant="secondary">{item.collection}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(item.generatedAt)}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ${item.costUsd.toFixed(3)}
                    </span>
                    {item.seoScore != null && (
                      <Badge
                        variant={item.seoScore >= 80 ? "default" : "secondary"}
                      >
                        SEO {item.seoScore}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={speakingId === item.id ? "Stop" : "Read aloud"}
                    onClick={() => speakingId === item.id ? handleStop() : handleSpeak(item)}
                    className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${speakingId === item.id ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                  >
                    {speakingId === item.id ? <StopCircle className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  {!readOnly && (tab === "ready" || tab === "in_review") && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleEditFields(item)}
                        title="Edit fields before approving"
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${editingId === item.id ? "border-primary text-primary bg-primary/10" : "border-border hover:bg-secondary"}`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Fields
                      </button>
                      <button
                        type="button"
                        title="Approve & Publish"
                        onClick={() => handleApprove(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      {tab === "ready" && (
                        <button
                          type="button"
                          onClick={() => handleEditFirst(item)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      )}
                      {tab === "in_review" && (
                        <button
                          type="button"
                          onClick={() => handleEditFirst(item)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Open in editor
                        </button>
                      )}
                      <button
                        type="button"
                        title="Reject"
                        onClick={() => setRejectingId(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Reject feedback inline */}
              {rejectingId === item.id && (
                <div className="mt-3 flex gap-2">
                  <textarea
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="Feedback for the agent..."
                    rows={2}
                    className="flex-1 text-sm p-2 rounded-md border border-border bg-background resize-none"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleReject(item.id)}
                      disabled={!rejectFeedback.trim()}
                      className="px-3 py-1.5 rounded-md text-xs bg-destructive text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectFeedback("");
                      }}
                      className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Inline field editor */}
              {editingId === item.id && (
                <div className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit fields</p>
                  {(schemas[item.collection] ?? [])
                    .filter((f) => !["content", "body", "richtext"].includes(f.type) && f.name !== "relatedPosts")
                    .map((field) => (
                      <div key={field.name} className="flex items-center gap-2">
                        <label style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--muted-foreground)", width: "7rem", flexShrink: 0, fontFamily: "monospace" }}>
                          {field.name}
                        </label>
                        {field.type === "select" && field.options ? (
                          <select
                            value={String(editDraft[field.name] ?? "")}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.name]: e.target.value }))}
                            style={{ flex: 1, padding: "0.25rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem" }}
                          >
                            <option value="">— none —</option>
                            {field.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : field.type === "tags" ? (
                          <input
                            type="text"
                            value={((editDraft[field.name] as string[]) ?? []).join(", ")}
                            onChange={(e) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                [field.name]: e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              }))
                            }
                            placeholder="tag1, tag2, tag3"
                            style={{ flex: 1, padding: "0.25rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem" }}
                          />
                        ) : field.type === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(editDraft[field.name])}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.name]: e.target.checked }))}
                          />
                        ) : (
                          <input
                            type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                            value={String(editDraft[field.name] ?? "")}
                            onChange={(e) => setEditDraft((prev) => ({ ...prev, [field.name]: e.target.value }))}
                            style={{ flex: 1, padding: "0.25rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem" }}
                          />
                        )}
                      </div>
                    ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveFields(item)}
                      className="px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90"
                    >
                      Save fields
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Show rejection feedback for rejected items */}
              {item.status === "rejected" && item.rejectionFeedback && (
                <p className="mt-2 text-xs text-destructive bg-destructive/5 p-2 rounded">
                  Feedback: {item.rejectionFeedback}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </fieldset>
  );
}
