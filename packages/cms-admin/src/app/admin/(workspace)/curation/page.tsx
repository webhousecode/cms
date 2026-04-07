"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Check, X, Pencil, Volume2, StopCircle, SlidersHorizontal, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox-styled";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TabTitle } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";

interface AlternativeOutput {
  model: string;
  contentData: Record<string, unknown>;
  costUsd?: number;
  score?: number;
}

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
  alternatives?: AlternativeOutput[];
  seoScore?: number;
  costUsd: number;
  rejectionFeedback?: string;
}

/** Tiny self-contained markdown → HTML for the curation Preview modal.
 *  Not full CommonMark — covers the things agent-generated content actually
 *  uses: headings, paragraphs, bold/italic, code, lists, links, images,
 *  blockquotes. Output is escaped before substitution so curators can't
 *  inject script tags via the AI's content. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(md: string): string {
  if (!md) return "";
  const escaped = escapeHtml(md);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let inList = false;
  let inPara = false;

  function closePara() { if (inPara) { out.push("</p>"); inPara = false; } }
  function closeList() { if (inList) { out.push("</ul>"); inList = false; } }

  function inline(s: string): string {
    return s
      // images: ![alt](url) — guard against hallucinated URLs (anything that
      // isn't an absolute http(s), a site-relative path, or a data: URI)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
        const valid = /^(https?:\/\/|\/|data:)/i.test(url);
        if (valid) {
          return `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:0.5rem 0;" />`;
        }
        return `<span style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.4rem 0.7rem;margin:0.5rem 0;border:1px dashed var(--destructive);border-radius:6px;color:var(--destructive);font-size:0.75rem;">⚠ Invalid image URL <code style="opacity:0.7;">${url.slice(0, 60)}${url.length > 60 ? "…" : ""}</code></span>`;
      })
      // links: [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--primary);text-decoration:underline;">$1</a>')
      // bold
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      // italic
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
      // inline code
      .replace(/`([^`]+)`/g, '<code style="background:var(--muted);padding:0.1rem 0.3rem;border-radius:3px;font-size:0.85em;">$1</code>');
  }

  for (const raw of lines) {
    const line = raw;
    if (line.trim() === "") { closePara(); closeList(); continue; }
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const li = line.match(/^[-*]\s+(.+)/);
    const bq = line.match(/^>\s+(.+)/);
    if (h1) { closePara(); closeList(); out.push(`<h1 style="font-size:1.75rem;font-weight:700;margin:1.5rem 0 0.75rem;">${inline(h1[1])}</h1>`); continue; }
    if (h2) { closePara(); closeList(); out.push(`<h2 style="font-size:1.35rem;font-weight:700;margin:1.5rem 0 0.5rem;">${inline(h2[1])}</h2>`); continue; }
    if (h3) { closePara(); closeList(); out.push(`<h3 style="font-size:1.1rem;font-weight:600;margin:1.25rem 0 0.5rem;">${inline(h3[1])}</h3>`); continue; }
    if (li) {
      closePara();
      if (!inList) { out.push('<ul style="padding-left:1.25rem;margin:0.5rem 0;list-style:disc;">'); inList = true; }
      out.push(`<li style="margin:0.25rem 0;">${inline(li[1])}</li>`);
      continue;
    }
    if (bq) {
      closePara(); closeList();
      out.push(`<blockquote style="border-left:3px solid var(--border);padding-left:0.75rem;margin:0.75rem 0;color:var(--muted-foreground);font-style:italic;">${inline(bq[1])}</blockquote>`);
      continue;
    }
    closeList();
    if (!inPara) { out.push('<p style="margin:0.75rem 0;line-height:1.7;">'); inPara = true; }
    else { out.push("<br />"); }
    out.push(inline(line));
  }
  closePara(); closeList();
  return out.join("\n");
}

/** Strip vendor/date suffixes so model badges fit on a chip. */
function shortModelName(model: string): string {
  return model
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-latest$/, "");
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

  // Load curation tab from server on mount
  useEffect(() => {
    fetch("/api/admin/user-state").then((r) => r.ok ? r.json() : null).then((state) => {
      if (state?.curationTab && VALID_TABS.includes(state.curationTab) && !searchParams.get("tab")) {
        setTab(state.curationTab as TabId);
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(t: TabId) {
    setTab(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ curationTab: t }) }).catch(() => {});
    router.replace(`/admin/curation?tab=${t}`, { scroll: false });
  }
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({});
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);

  // ESC closes the preview modal
  useEffect(() => {
    if (!previewItem) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewItem(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewItem]);
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

  async function handlePickAlternative(item: QueueItem, altIndex: number) {
    const res = await fetch(`/api/cms/curation/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pick-alternative", alternativeIndex: altIndex }),
    });
    if (res.ok) {
      const updated = (await res.json()) as QueueItem;
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      // If the field editor is open, refresh its draft to the swapped content
      if (editingId === item.id) setEditDraft({ ...updated.contentData });
    }
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
                  {/* Preview is available in all tabs (not just ready) so
                      curators can also see what was approved/rejected. */}
                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    title="Preview rendered content"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview
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

              {/* Multi-model alternatives (Phase 3) — chip row to swap which
                  model's output is the active one. The active output is always
                  contentData; clicking another chip calls pickAlternative which
                  swaps the picked alternative into contentData. */}
              {item.alternatives && item.alternatives.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Models
                  </span>
                  {/* Active = primary contentData (always first chip) */}
                  <button
                    type="button"
                    disabled
                    className="px-2 py-1 rounded-md text-[0.7rem] font-mono border border-primary text-primary bg-primary/10 cursor-default"
                    title="Currently selected"
                  >
                    ✓ active
                  </button>
                  {item.alternatives.map((alt, i) => (
                    <button
                      key={`${alt.model}-${i}`}
                      type="button"
                      onClick={() => handlePickAlternative(item, i)}
                      disabled={readOnly || !(tab === "ready" || tab === "in_review")}
                      title={`Swap to ${alt.model}${alt.costUsd ? ` ($${alt.costUsd.toFixed(4)})` : ""}`}
                      className="px-2 py-1 rounded-md text-[0.7rem] font-mono border border-border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {shortModelName(alt.model)}
                      {alt.costUsd != null && (
                        <span className="ml-1 text-muted-foreground">
                          ${alt.costUsd.toFixed(3)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

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
                          <Checkbox
                            checked={Boolean(editDraft[field.name])}
                            onChange={(v) => setEditDraft((prev) => ({ ...prev, [field.name]: v }))}
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

    {/* Preview modal — full rendered post for the selected queue item */}
    {previewItem && (
      <div
        onClick={() => setPreviewItem(null)}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          padding: "3rem 1rem", overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--card)", color: "var(--foreground)",
            borderRadius: "12px", border: "1px solid var(--border)",
            width: "100%", maxWidth: "780px", padding: "2rem 2.5rem",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => setPreviewItem(null)}
            title="Close preview"
            style={{
              position: "absolute", top: "0.75rem", right: "0.75rem",
              background: "transparent", border: "none", cursor: "pointer",
              padding: "0.4rem", color: "var(--muted-foreground)",
              borderRadius: "6px",
            }}
            className="hover:bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Meta header */}
          <div style={{ marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", fontFamily: "monospace", margin: 0 }}>
              {previewItem.collection} · {previewItem.agentName} · {relativeTime(previewItem.generatedAt)}
            </p>
            <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "0.5rem 0 0", lineHeight: 1.15 }}>
              {(previewItem.contentData.title as string) || previewItem.title}
            </h1>
            {typeof previewItem.contentData.excerpt === "string" && previewItem.contentData.excerpt && (
              <p style={{ fontSize: "1.05rem", color: "var(--muted-foreground)", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
                {previewItem.contentData.excerpt}
              </p>
            )}
            {Array.isArray(previewItem.contentData.tags) && (previewItem.contentData.tags as string[]).length > 0 && (
              <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {(previewItem.contentData.tags as string[]).map((t) => (
                  <span key={t} style={{
                    fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "9999px",
                    background: "var(--secondary)", color: "var(--secondary-foreground)",
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div
            style={{ fontSize: "0.95rem", lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(
                String(
                  (previewItem.contentData.content as string) ??
                  (previewItem.contentData.body as string) ??
                  "",
                ),
              ),
            }}
          />

          {/* Footer with cost / SEO chip */}
          <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", display: "flex", gap: "1rem", fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
            <span>Cost: ${previewItem.costUsd.toFixed(4)}</span>
            {previewItem.seoScore != null && <span>SEO: {previewItem.seoScore}</span>}
            <span>Slug: {previewItem.slug}</span>
          </div>
        </div>
      </div>
    )}
    </fieldset>
  );
}
