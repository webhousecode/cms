"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Download, Trash2, RotateCcw, Plus, Clock, FileArchive, Cloud } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";

interface Snapshot {
  id: string;
  timestamp: string;
  trigger: "manual" | "scheduled";
  sizeBytes: number;
  documentCount: number;
  collections: Record<string, number>;
  fileName: string;
  status: "creating" | "complete" | "failed";
  error?: string;
  cloudProvider?: string;
  cloudError?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function BackupPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backups");
      if (res.ok) {
        const data = await res.json() as { snapshots: Snapshot[] };
        setSnapshots(data.snapshots);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      if (res.ok) {
        await fetchSnapshots();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await fetch(`/api/admin/backups/${id}`, { method: "DELETE" });
      await fetchSnapshots();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  async function handleRestore(id: string) {
    setRestoring(id);
    try {
      const res = await fetch(`/api/admin/backups/${id}`, { method: "POST" });
      const data = await res.json() as { restored: number; error?: string };
      if (data.error) {
        alert(`Restore failed: ${data.error}`);
      }
      await fetchSnapshots();
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  }

  return (
    <>
      <TabTitle value="Backup" />
      <ActionBar helpArticleId="backup-intro"
        actions={
          <ActionButton
            variant="primary"
            onClick={handleCreate}
            disabled={creating}
            icon={<Plus style={{ width: 14, height: 14 }} />}
          >
            {creating ? "Creating..." : "Create Backup"}
          </ActionButton>
        }
      >
        <ActionBarBreadcrumb items={["Tools", "Backup"]} /></ActionBar>

      <div style={{ padding: "2rem 2.5rem", maxWidth: 900 }}>

      {loading ? (
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem" }}>Loading...</p>
      ) : snapshots.length === 0 ? (
        <div style={{
          border: "1px dashed var(--border)", borderRadius: "0.5rem",
          padding: "3rem", textAlign: "center",
        }}>
          <HardDrive style={{ width: 40, height: 40, margin: "0 auto 1rem", color: "var(--muted-foreground)", opacity: 0.5 }} />
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.875rem", margin: 0 }}>
            No backups yet. Create your first backup to protect your content.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              style={{
                border: "1px solid var(--border)", borderRadius: "0.5rem",
                padding: "1rem 1.25rem",
                background: "var(--card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <FileArchive style={{ width: 20, height: 20, color: "var(--muted-foreground)", flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                      {formatDate(snap.timestamp)}
                    </span>
                    <span style={{
                      fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                      background: snap.trigger === "scheduled"
                        ? "color-mix(in srgb, rgb(96 165 250) 15%, transparent)"
                        : "color-mix(in srgb, rgb(74 222 128) 15%, transparent)",
                      color: snap.trigger === "scheduled" ? "rgb(96 165 250)" : "rgb(74 222 128)",
                    }}>
                      {snap.trigger}
                    </span>
                    {snap.cloudProvider && (
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                        background: "color-mix(in srgb, rgb(147 130 220) 15%, transparent)",
                        color: "rgb(167 150 240)",
                        display: "flex", alignItems: "center", gap: "0.2rem",
                      }}>
                        <Cloud style={{ width: 10, height: 10 }} />
                        {snap.cloudProvider}
                      </span>
                    )}
                    {!snap.cloudProvider && (
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                        background: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)",
                        color: "var(--muted-foreground)",
                      }}>
                        local
                      </span>
                    )}
                    {snap.cloudError && (
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                        background: "color-mix(in srgb, rgb(251 191 36) 15%, transparent)",
                        color: "rgb(251 191 36)",
                      }} title={snap.cloudError}>
                        cloud failed
                      </span>
                    )}
                    {snap.status === "failed" && (
                      <span style={{
                        fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                        background: "color-mix(in srgb, var(--destructive) 15%, transparent)",
                        color: "var(--destructive)",
                      }}>
                        failed
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      {timeAgo(snap.timestamp)}
                    </span>
                    <span>{snap.documentCount} documents</span>
                    <span>{formatBytes(snap.sizeBytes)}</span>
                    <span>{Object.keys(snap.collections).length} collections</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {/* Download */}
                  <a
                    href={`/api/admin/backups/${snap.id}`}
                    download
                    title="Download zip"
                    style={{
                      display: "flex", alignItems: "center", padding: "0.35rem",
                      borderRadius: "0.25rem", color: "var(--muted-foreground)",
                      transition: "color 0.2s",
                    }}
                    className="hover:text-foreground"
                  >
                    <Download style={{ width: 16, height: 16 }} />
                  </a>

                  {/* Restore */}
                  {confirmRestore === snap.id ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>
                        {restoring === snap.id ? "Restoring..." : "Restore?"}
                      </span>
                      <button type="button" onClick={() => handleRestore(snap.id)} disabled={restoring === snap.id}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                          border: "none", background: "var(--destructive)", color: "#fff",
                          cursor: "pointer", lineHeight: 1 }}>Yes</button>
                      <button type="button" onClick={() => setConfirmRestore(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                          border: "1px solid var(--border)", background: "transparent",
                          color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRestore(snap.id)}
                      title="Restore from this backup"
                      style={{
                        display: "flex", alignItems: "center", padding: "0.35rem",
                        background: "none", border: "none", borderRadius: "0.25rem",
                        color: "var(--muted-foreground)", cursor: "pointer",
                        transition: "color 0.2s",
                      }}
                      className="hover:text-foreground"
                    >
                      <RotateCcw style={{ width: 16, height: 16 }} />
                    </button>
                  )}

                  {/* Delete */}
                  {confirmDelete === snap.id ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                      <button type="button" onClick={() => handleDelete(snap.id)} disabled={deleting === snap.id}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                          border: "none", background: "var(--destructive)", color: "#fff",
                          cursor: "pointer", lineHeight: 1 }}>Yes</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                          border: "1px solid var(--border)", background: "transparent",
                          color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(snap.id)}
                      title="Delete this backup"
                      style={{
                        display: "flex", alignItems: "center", padding: "0.35rem",
                        background: "none", border: "none", borderRadius: "0.25rem",
                        color: "var(--muted-foreground)", cursor: "pointer",
                        transition: "color 0.2s",
                      }}
                      className="hover:text-destructive"
                    >
                      <Trash2 style={{ width: 16, height: 16 }} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
