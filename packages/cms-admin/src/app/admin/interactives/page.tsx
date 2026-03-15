"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Sparkles, Trash2, Zap, MoreHorizontal, Pencil, Globe, Copy, FileText, LayoutGrid, List, Search, X, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      try { await fetch("/api/interactives", { method: "POST", body: fd }); } catch { /* */ }
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

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar — matches Media Manager */}
      <div
        className="sticky flex items-center gap-3 px-4 border-b border-border shrink-0"
        style={{ top: 84, height: "48px", zIndex: 30, backgroundColor: "var(--card)" }}
      >
        <span className="text-sm font-mono text-foreground">interactives</span>
        <span className="text-xs text-muted-foreground">({filtered.length}/{items.length})</span>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search interactives…"
            style={{
              paddingLeft: "1.75rem", paddingRight: query ? "1.75rem" : "0.5rem",
              paddingTop: "0.25rem", paddingBottom: "0.25rem",
              borderRadius: "6px", border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: "0.8rem", width: "200px",
            }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}>
              <X style={{ width: "0.75rem", height: "0.75rem" }} />
            </button>
          )}
        </div>

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

        {/* Upload button */}
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
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".html,.htm"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleUpload(e.target.files)}
      />

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
              className="group relative rounded-lg border border-border bg-card overflow-hidden"
              style={{ cursor: "pointer", transition: "border-color 150ms" }}
              onClick={() => router.push(`/admin/interactives/${item.id}`)}
            >
              {/* Thumbnail */}
              <div style={{ width: "100%", height: "150px", background: "var(--muted)", overflow: "hidden", position: "relative" }}>
                <iframe
                  src={`/api/interactives/${item.id}/preview`}
                  title={item.name}
                  sandbox="allow-scripts"
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
                  sandbox="allow-scripts"
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
    </div>
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
