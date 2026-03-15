"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, Sparkles, Trash2, Zap } from "lucide-react";

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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InteractiveMeta | null>(null);
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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await fetch("/api/interactives", { method: "POST", body: fd });
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    await loadItems();
    setUploading(false);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    setConfirmDelete(null);
    try {
      await fetch(`/api/interactives/${confirmDelete.id}`, { method: "DELETE" });
      await loadItems();
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleting(null);
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          Interactives
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 className="text-2xl font-bold text-foreground">Interactives</h1>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.45rem 0.875rem",
                borderRadius: "6px",
                border: "none",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: uploading ? "wait" : "pointer",
                opacity: uploading ? 0.7 : 1,
              }}
            >
              <Upload style={{ width: "0.875rem", height: "0.875rem" }} />
              {uploading ? "Uploading..." : "+ Upload HTML"}
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.45rem 0.875rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--muted-foreground)",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "not-allowed",
                opacity: 0.5,
              }}
            >
              <Sparkles style={{ width: "0.875rem", height: "0.875rem" }} />
              + Create with AI
            </button>
          </div>
        </div>
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
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          Loading...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "4rem 2rem",
            color: "var(--muted-foreground)",
            border: "1px dashed var(--border)",
            borderRadius: "12px",
          }}
        >
          <Zap style={{ width: "2.5rem", height: "2.5rem", opacity: 0.3 }} />
          <p style={{ fontSize: "0.875rem" }}>No interactives yet</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              fontSize: "0.8rem",
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "transparent",
              cursor: "pointer",
              color: "var(--foreground)",
            }}
          >
            Upload an HTML file to get started
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "1rem",
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              className="group"
              style={{
                position: "relative",
                borderRadius: "10px",
                border: "1px solid var(--border)",
                background: "var(--card)",
                overflow: "hidden",
                cursor: "pointer",
                transition: "border-color 150ms",
              }}
              onClick={() => router.push(`/admin/interactives/${item.id}`)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              }}
            >
              {/* Thumbnail iframe */}
              <div
                style={{
                  width: "100%",
                  height: "150px",
                  background: "var(--muted)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <iframe
                  src={`/api/interactives/${item.id}/preview`}
                  title={item.name}
                  sandbox="allow-scripts"
                  style={{
                    width: "200%",
                    height: "300px",
                    border: "none",
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                    pointerEvents: "none",
                  }}
                />
              </div>

              {/* Info */}
              <div style={{ padding: "0.625rem 0.75rem" }}>
                <p
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginBottom: "0.25rem",
                  }}
                  title={item.name}
                >
                  {item.name}
                </p>
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--muted-foreground)",
                    fontFamily: "monospace",
                  }}
                >
                  {formatSize(item.size)} &middot; {formatDate(item.createdAt)}
                  {item.status && (
                    <span style={{
                      marginLeft: "0.375rem",
                      fontSize: "0.6rem",
                      fontWeight: 600,
                      padding: "0.1rem 0.35rem",
                      borderRadius: "3px",
                      background: item.status === "published" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                      color: item.status === "published" ? "#22c55e" : "#eab308",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}>
                      {item.status}
                    </span>
                  )}
                </p>
              </div>

              {/* Delete button (hover) */}
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(item);
                }}
                disabled={deleting === item.id}
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  width: "1.75rem",
                  height: "1.75rem",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(4px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--destructive)",
                  opacity: 0,
                  transition: "opacity 150ms",
                  pointerEvents: deleting === item.id ? "none" : "auto",
                }}
                className="group-hover:!opacity-100"
              >
                <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.5rem",
              maxWidth: "380px",
              width: "90%",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>
              Delete interactive?
            </p>
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--muted-foreground)",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {confirmDelete.name}
            </p>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  color: "var(--foreground)",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  background: "var(--destructive)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
