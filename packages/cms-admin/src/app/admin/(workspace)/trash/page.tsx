"use client";

import { useEffect, useState, useRef } from "react";
import { Trash2, RotateCcw, X, Search, AlertTriangle } from "lucide-react";
import { useTabs } from "@/lib/tabs-context";
import { useSiteRole } from "@/hooks/use-site-role";
import { HelpCard } from "@/components/ui/help-card";

const RETENTION_DAYS = parseInt(process.env.NEXT_PUBLIC_TRASH_RETENTION_DAYS ?? "30");

interface TrashedItem {
  collection: string;
  collectionLabel: string;
  doc: {
    id: string;
    slug: string;
    status: string;
    data: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
}

function ConfirmDialog({ message, confirmLabel = "Confirm", onConfirm, onCancel }: {
  message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.5rem", minWidth: "320px", maxWidth: "420px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <AlertTriangle style={{ width: "18px", height: "18px", color: "var(--destructive)", flexShrink: 0, marginTop: "1px" }} />
          <p style={{ fontSize: "0.9rem", color: "var(--foreground)", margin: 0 }}>{message}</p>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" onClick={onCancel} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.8rem", cursor: "pointer" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const confirmDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [working, setWorking] = useState<string | null>(null); // item id being acted on
  const { tabs, closeTab } = useTabs();
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";

  function closeTabsForPaths(paths: string[]) {
    const pathSet = new Set(paths);
    tabs.filter(t => pathSet.has(t.path.split("?")[0])).forEach(t => closeTab(t.id));
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/trash");
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function restore(item: TrashedItem) {
    setWorking(item.doc.id);
    if (item.collection === "_media") {
      // Restore media file — key is "folder/name" or just "name"
      const parts = item.doc.slug.split("/");
      const name = parts.pop()!;
      const folder = parts.join("/");
      await fetch(`/api/media/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, name }),
      });
    } else if (item.collection === "_interactives") {
      await fetch(`/api/interactives/${item.doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
    } else {
      await fetch(`/api/cms/${item.collection}/${item.doc.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
    }
    await load();
    setWorking(null);
  }

  async function deletePermanently(item: TrashedItem) {
    setWorking(item.doc.id);
    if (item.collection === "_media") {
      const parts = item.doc.slug.split("/");
      const name = parts.pop()!;
      const folder = parts.join("/");
      await fetch(`/api/media/${encodeURIComponent(item.doc.slug)}?permanent=true`, { method: "DELETE" });
    } else if (item.collection === "_interactives") {
      await fetch(`/api/interactives/${item.doc.id}`, { method: "DELETE" });
      closeTabsForPaths([`/admin/interactives/${item.doc.id}`]);
    } else {
      await fetch(`/api/cms/${item.collection}/${item.doc.slug}?permanent=true`, { method: "DELETE" });
      closeTabsForPaths([`/admin/${item.collection}/${item.doc.slug}`]);
    }
    await load();
    setWorking(null);
  }

  async function emptyTrash() {
    setConfirmEmpty(false);
    // Collect all paths before deleting so we can close their tabs
    const pathsToClose = items.map(i => `/admin/${i.collection}/${i.doc.slug}`);
    setLoading(true);
    await fetch("/api/trash", { method: "DELETE" });
    closeTabsForPaths(pathsToClose);
    await load();
  }

  const filtered = items.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const title = String(item.doc.data?.title ?? item.doc.data?.name ?? item.doc.slug).toLowerCase();
    return title.includes(q) || item.doc.slug.includes(q) || item.collection.includes(q);
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", position: "sticky", top: 84, zIndex: 30, backgroundColor: "var(--card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <Trash2 style={{ width: "16px", height: "16px", color: "var(--muted-foreground)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Trash</span>
          {!loading && items.length > 0 && (
            <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", background: "var(--muted)", borderRadius: "999px", padding: "0.1rem 0.5rem" }}>
              {items.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
            Auto-deleted after {RETENTION_DAYS} days
          </span>
          {!readOnly && items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmEmpty(true)}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid color-mix(in oklch, var(--destructive) 40%, transparent)", background: "transparent", color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer" }}
            >
              <Trash2 style={{ width: "12px", height: "12px" }} />
              Empty Trash
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: "1.5rem" }}>
        <HelpCard articleId="trash-intro" variant="compact" />
        {/* Search */}
        {items.length > 0 && (
          <div style={{ position: "relative", marginBottom: "1.25rem", maxWidth: "400px" }}>
            <Search style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search trash…"
              style={{ width: "100%", padding: "0.4rem 0.75rem 0.4rem 2rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--input)", color: "var(--foreground)", fontSize: "0.85rem", outline: "none" }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
                <X style={{ width: "13px", height: "13px" }} />
              </button>
            )}
          </div>
        )}

        {loading && (
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading…</p>
        )}

        {!loading && items.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "4rem 0", color: "var(--muted-foreground)" }}>
            <Trash2 style={{ width: "40px", height: "40px", opacity: 0.2 }} />
            <p style={{ fontSize: "0.9rem" }}>Trash is empty</p>
          </div>
        )}

        {!loading && filtered.length === 0 && items.length > 0 && (
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>No results for &ldquo;{search}&rdquo;</p>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {filtered.map((item) => {
              const title = String(item.doc.data?.title ?? item.doc.data?.name ?? item.doc.slug);
              const trashedAt = item.doc.data._trashedAt ? new Date(item.doc.data._trashedAt as string) : null;
              const isWorking = working === item.doc.id;
              return (
                <div
                  key={`${item.collection}/${item.doc.slug}`}
                  style={{ display: "flex", alignItems: "center", gap: "0.875rem", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", opacity: isWorking ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)", background: "var(--muted)", borderRadius: "4px", padding: "0.15rem 0.4rem", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {item.collectionLabel}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                    <p style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", margin: 0 }}>{item.doc.slug}</p>
                  </div>
                  {trashedAt && (
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {trashedAt.toLocaleDateString()}
                    </span>
                  )}
                  {!readOnly && (
                    <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => restore(item)}
                        title="Restore"
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.3rem 0.625rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.75rem", cursor: isWorking ? "wait" : "pointer" }}
                      >
                        <RotateCcw style={{ width: "11px", height: "11px" }} />
                        Restore
                      </button>
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => {
                          if (confirmDeleteId === item.doc.id) {
                            if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
                            setConfirmDeleteId(null);
                            deletePermanently(item);
                          } else {
                            if (confirmDeleteTimer.current) clearTimeout(confirmDeleteTimer.current);
                            setConfirmDeleteId(item.doc.id);
                            confirmDeleteTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
                          }
                        }}
                        title="Delete permanently"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          minWidth: confirmDeleteId === item.doc.id ? "auto" : "28px",
                          height: "28px", borderRadius: "5px",
                          border: confirmDeleteId === item.doc.id ? "1px solid color-mix(in oklch, var(--destructive) 30%, transparent)" : "1px solid transparent",
                          background: "transparent",
                          color: confirmDeleteId === item.doc.id ? "var(--destructive)" : "var(--muted-foreground)",
                          cursor: isWorking ? "wait" : "pointer",
                          fontSize: confirmDeleteId === item.doc.id ? "0.65rem" : undefined,
                          fontWeight: confirmDeleteId === item.doc.id ? 600 : undefined,
                          padding: confirmDeleteId === item.doc.id ? "0 8px" : undefined,
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={e => { if (confirmDeleteId !== item.doc.id) { (e.currentTarget as HTMLButtonElement).style.color = "var(--destructive)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "color-mix(in oklch, var(--destructive) 30%, transparent)"; } }}
                        onMouseLeave={e => { if (confirmDeleteId !== item.doc.id) { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; } }}
                      >
                        {confirmDeleteId === item.doc.id ? "OK" : <X style={{ width: "13px", height: "13px" }} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmEmpty && (
        <ConfirmDialog
          message={`Permanently delete all ${items.length} item${items.length !== 1 ? "s" : ""} in trash? This cannot be undone.`}
          confirmLabel="Empty Trash"
          onConfirm={emptyTrash}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}
    </div>
  );
}
