"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Sparkles, Trash2, Zap, MoreHorizontal, Pencil, Globe, Copy, FileText, LayoutGrid, List, Search, X, AlertTriangle, Loader2 } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSiteRole } from "@/hooks/use-site-role";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────── */
interface InteractiveMeta {
  id: string;
  name: string;
  filename: string;
  size: number;
  status?: "draft" | "published" | "trashed";
  createdAt: string;
  updatedAt: string;
}

type ViewMode = "grid" | "list";

/* ─── Helpers ────────────────────────────────────────────────── */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function InteractivesPage() {
  const router = useRouter();
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [items, setItems] = useState<InteractiveMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState<InteractiveMeta | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch("/api/interactives");
      const data = await res.json();
      setItems(Array.isArray(data) ? data.filter((d: InteractiveMeta) => d.status !== "trashed") : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    if (!confirmTrash) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmTrash(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmTrash]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await fetch("/api/interactives", { method: "POST", body: fd });
        toast.success("Interactive uploaded", { description: file.name });
      } catch {
        toast.error("Upload failed");
      }
    }
    await loadItems();
    setUploading(false);
  }

  async function trashItem() {
    if (!confirmTrash) return;
    setConfirmTrash(null);
    await fetch(`/api/interactives/${confirmTrash.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "trashed" }),
    });
    await loadItems();
  }

  async function togglePublish(item: InteractiveMeta) {
    await fetch(`/api/interactives/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: item.status === "published" ? "draft" : "published" }),
    });
    loadItems();
  }

  async function cloneItem(item: InteractiveMeta) {
    const res = await fetch(`/api/interactives/${item.id}`);
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([data.content], { type: "text/html" });
    const file = new File([blob], `${item.name}-copy.html`, { type: "text/html" });
    const fd = new FormData();
    fd.append("file", file);
    await fetch("/api/interactives", { method: "POST", body: fd });
    loadItems();
  }

  const filtered = query
    ? items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()) || i.id.toLowerCase().includes(query.toLowerCase()))
    : items;

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [generateSystemPrompt, setGenerateSystemPrompt] = useState<string | null>(null);
  const aiTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (aiModalOpen) setTimeout(() => aiTextareaRef.current?.focus(), 50);
  }, [aiModalOpen]);

  // Fetch editable system prompt
  useEffect(() => {
    fetch("/api/cms/ai/prompts")
      .then((r) => r.json())
      .then((data: { prompts: Array<{ id: string; value: string }> }) => {
        const p = data.prompts.find((pp) => pp.id === "interactives.generate");
        if (p) setGenerateSystemPrompt(p.value);
      })
      .catch(() => { /* use fallback */ });
  }, []);

  /** Extract HTML from code fences */
  function extractHtml(text: string): string | null {
    const fenced = text.match(/```(?:html)?\s*\n([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const openFence = text.match(/```(?:html)?\s*\n([\s\S]+)$/);
    if (openFence) {
      const c = openFence[1].trim();
      if (c.startsWith("<") || c.startsWith("<!")) return c;
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) return trimmed;
    return null;
  }

  async function handleAiGenerate() {
    const prompt = aiPrompt.trim();
    if (!prompt || aiGenerating) return;
    setAiGenerating(true);

    try {
      const res = await fetch("/api/cms/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          purpose: "interactives",
          systemPrompt: generateSystemPrompt ?? "",
        }),
      });

      if (!res.ok || !res.body) {
        setAiGenerating(false);
        return;
      }

      // Read streaming response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
      }

      const html = extractHtml(full);
      if (!html) {
        setAiGenerating(false);
        return;
      }

      // Create interactive via POST
      const blob = new Blob([html], { type: "text/html" });
      // Derive filename from first few words of prompt
      const safeName = prompt.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).slice(0, 4).join("-").toLowerCase() || "ai-generated";
      const file = new File([blob], `${safeName}.html`, { type: "text/html" });
      const fd = new FormData();
      fd.append("file", file);
      const createRes = await fetch("/api/interactives", { method: "POST", body: fd });
      if (createRes.ok) {
        const created = await createRes.json();
        setAiModalOpen(false);
        setAiPrompt("");
        router.push(`/admin/interactives/${created.id}`);
      }
    } catch {
      /* ignore */
    }

    setAiGenerating(false);
  }

  const [dragging, setDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleUpload(e.dataTransfer.files);
  }

  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <div
      className="flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={dragging ? { outline: "2px dashed var(--primary)", outlineOffset: "-4px" } : undefined}
    >
      <ActionBar
        actions={<>
          {/* View toggle */}
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
            {(["grid", "list"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  padding: "0.25rem 0.5rem", background: view === v ? "var(--accent)" : "transparent",
                  border: "none", cursor: "pointer", color: view === v ? "var(--foreground)" : "var(--muted-foreground)",
                  display: "flex", alignItems: "center",
                }}
              >
                {v === "grid" ? <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} /> : <List style={{ width: "0.875rem", height: "0.875rem" }} />}
              </button>
            ))}
          </div>

          {/* Create with AI button */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setAiModalOpen(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors"
            >
              <Sparkles style={{ width: "0.875rem", height: "0.875rem" }} />
              Create with AI
            </button>
          )}

          {/* Upload button */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md",
                "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
                uploading && "opacity-70 cursor-wait"
              )}
            >
              <Upload style={{ width: "0.875rem", height: "0.875rem" }} />
              {uploading ? "Uploading…" : "Upload"}
            </button>
          )}
        </>}
      >
        <ActionBarBreadcrumb items={["Interactives"]} />
      </ActionBar>

      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleUpload(e.target.files)}
      />

      {/* Search — in content area, same pattern as collections */}
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: "180px" }}>
            <Search style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", width: "0.8rem", height: "0.8rem", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{ width: "100%", paddingLeft: "2rem", paddingRight: "0.75rem", paddingTop: "0.375rem", paddingBottom: "0.375rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", fontSize: "0.8rem", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
            {filtered.length}/{items.length}
          </span>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "4rem 2rem", color: "var(--muted-foreground)" }}>
          <Zap style={{ width: "2.5rem", height: "2.5rem", opacity: 0.3 }} />
          <p style={{ fontSize: "0.875rem" }}>{query ? `No interactives matching "${query}"` : "No interactives yet"}</p>
          {!query && (
            <button type="button" onClick={() => inputRef.current?.click()} style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}>
              Upload HTML files or drag &amp; drop
            </button>
          )}
        </div>
      ) : view === "grid" ? (
        /* ─── Grid View ─── */
        <div style={{ padding: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-lg border border-border bg-card"
              style={{ cursor: "pointer", transition: "border-color 150ms" }}
              onClick={() => router.push(`/admin/interactives/${item.id}`)}
            >
              {/* Thumbnail */}
              <div style={{ width: "100%", height: "150px", background: "var(--muted)", overflow: "hidden", position: "relative", borderRadius: "0.5rem 0.5rem 0 0" }}>
                <iframe
                  src={`/api/interactives/${item.id}/preview`}
                  title={item.name}
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: "200%", height: "300px", border: "none", transform: "scale(0.5)", transformOrigin: "top left", pointerEvents: "none" }}
                />
              </div>

              {/* Info */}
              <div style={{ padding: "0.625rem 0.75rem" }}>
                <p className="text-xs font-semibold text-foreground truncate mb-1" title={item.name}>{item.name}</p>
                <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                  {formatSize(item.size)} &middot; {formatDate(item.updatedAt)}
                  <StatusBadge status={item.status} />
                </p>
              </div>

              {/* Actions menu */}
              <ActionsMenu item={item} onEdit={() => router.push(`/admin/interactives/${item.id}`)} onTogglePublish={() => togglePublish(item)} onClone={() => cloneItem(item)} onTrash={() => setConfirmTrash(item)} />
            </div>
          ))}
        </div>
      ) : (
        /* ─── List View — Pitch Vault style with thumbnails ─── */
        <div style={{ display: "flex", flexDirection: "column" }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group hover:bg-accent/30 cursor-pointer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "0.625rem 1rem",
                borderBottom: "1px solid var(--border)",
                transition: "background 150ms",
              }}
              onClick={() => router.push(`/admin/interactives/${item.id}`)}
            >
              {/* Thumbnail */}
              <div style={{
                width: "72px", height: "48px", borderRadius: "6px",
                overflow: "hidden", background: "var(--muted)", flexShrink: 0,
                border: "1px solid var(--border)",
              }}>
                <iframe
                  src={`/api/interactives/${item.id}/preview`}
                  title={item.name}
                  sandbox="allow-scripts allow-same-origin"
                  style={{ width: "360px", height: "240px", border: "none", transform: "scale(0.2)", transformOrigin: "top left", pointerEvents: "none" }}
                />
              </div>

              {/* Name + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="text-sm font-semibold text-foreground truncate">{item.name}</span>
                  <StatusBadge status={item.status} />
                  <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)" }}>HTML</span>
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", marginTop: "0.15rem" }}>
                  {formatSize(item.size)} &middot; {formatDate(item.updatedAt)}
                </p>
              </div>

              {/* Actions */}
              <div onClick={(e) => e.stopPropagation()}>
                <ItemDropdown item={item} onEdit={() => router.push(`/admin/interactives/${item.id}`)} onTogglePublish={() => togglePublish(item)} onClone={() => cloneItem(item)} onTrash={() => setConfirmTrash(item)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trash confirm dialog */}
      {confirmTrash && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--card)", border: "1px solid rgb(239 68 68 / 0.3)", borderRadius: "12px", padding: "1.5rem", maxWidth: "420px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <AlertTriangle style={{ width: "1.25rem", height: "1.25rem", color: "rgb(239 68 68)", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>Move to trash?</p>
                <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace", wordBreak: "break-all", marginTop: "0.2rem" }}>{confirmTrash.name}</p>
              </div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
              This interactive will be moved to trash. You can restore it later.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button variant="outline" size="sm" onClick={() => setConfirmTrash(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={trashItem}>Move to trash</Button>
            </div>
          </div>
        </div>
      )}

      {/* Create with AI modal */}
      {aiModalOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !aiGenerating) setAiModalOpen(false); }}
        >
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", maxWidth: "520px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles style={{ width: "1.125rem", height: "1.125rem", color: "var(--primary)" }} />
              <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Create Interactive with AI</span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: 0 }}>
              Describe the interactive component you want. AI will generate a complete standalone HTML file.
            </p>
            <textarea
              ref={aiTextareaRef}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiGenerate(); }}
              placeholder="e.g. A bar chart showing monthly sales data with animated bars and hover tooltips..."
              disabled={aiGenerating}
              rows={4}
              style={{
                resize: "vertical", padding: "0.625rem 0.75rem", borderRadius: "8px",
                border: "1px solid var(--border)", background: "var(--background)",
                color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
                fontFamily: "inherit", lineHeight: 1.5,
              }}
            />
            {/* Suggestion chips */}
            {!aiGenerating && !aiPrompt && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {[
                  "Animated pie chart with 4 categories",
                  "Interactive quiz with 5 questions",
                  "Pricing calculator with sliders",
                  "Timeline of events with scroll animation",
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setAiPrompt(s); aiTextareaRef.current?.focus(); }}
                    style={{
                      fontSize: "0.7rem", padding: "0.3rem 0.5rem", borderRadius: "6px",
                      border: "1px solid var(--border)", background: "var(--background)",
                      color: "var(--muted-foreground)", cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button variant="outline" size="sm" onClick={() => { setAiModalOpen(false); setAiPrompt(""); }} disabled={aiGenerating}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAiGenerate} disabled={!aiPrompt.trim() || aiGenerating}>
                {aiGenerating ? (
                  <><Loader2 style={{ width: "0.75rem", height: "0.75rem", marginRight: "0.375rem" }} className="animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles style={{ width: "0.75rem", height: "0.75rem", marginRight: "0.375rem" }} /> Generate</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </fieldset>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <span style={{
      marginLeft: "0.375rem",
      fontSize: "0.6rem",
      fontWeight: 600,
      padding: "0.1rem 0.35rem",
      borderRadius: "3px",
      background: status === "published" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
      color: status === "published" ? "#22c55e" : "#eab308",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
    }}>
      {status}
    </span>
  );
}

function ActionsMenu({ item, onEdit, onTogglePublish, onClone, onTrash }: {
  item: InteractiveMeta; onEdit: () => void; onTogglePublish: () => void; onClone: () => void; onTrash: () => void;
}) {
  return (
    <div
      style={{ position: "absolute", top: "0.5rem", right: "0.5rem", opacity: 0, transition: "opacity 150ms" }}
      className="group-hover:!opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <ItemDropdown item={item} onEdit={onEdit} onTogglePublish={onTogglePublish} onClone={onClone} onTrash={onTrash} />
    </div>
  );
}

function ItemDropdown({ item, onEdit, onTogglePublish, onClone, onTrash }: {
  item: InteractiveMeta; onEdit: () => void; onTogglePublish: () => void; onClone: () => void; onTrash: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center justify-center w-7 h-7 rounded-full border border-white/15 bg-black/60 backdrop-blur cursor-pointer text-white hover:bg-black/80 focus-visible:outline-none">
        <MoreHorizontal style={{ width: "0.875rem", height: "0.875rem" }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onTogglePublish}>
          {item.status === "published" ? (
            <><Globe className="mr-2 h-4 w-4 text-muted-foreground" />Unpublish</>
          ) : (
            <><Globe className="mr-2 h-4 w-4 text-muted-foreground" />Publish</>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onClone}>
          <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
          Clone
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onTrash} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
