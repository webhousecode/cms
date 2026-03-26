"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Copy, Check, Upload, LayoutGrid, List, FolderOpen, Folder, ChevronLeft, ChevronRight, Search, X, ZoomIn, ExternalLink, FileWarning, Music, Video, FileText, Code, File, Pencil, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb, ActionButton } from "@/components/action-bar";
import type { UsageRef } from "@/app/api/cms/media/usage/route";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useSiteRole } from "@/hooks/use-site-role";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────── */
type MediaType = "image" | "audio" | "video" | "document" | "interactive" | "other";

type MediaFile = {
  name: string;
  folder: string;
  url: string;
  size: number;
  isImage: boolean;
  mediaType: MediaType;
  createdAt: string;
  sha?: string;
  repoPath?: string;
};

type ViewMode = "grid" | "list";

const PAGE_SIZE_GRID = 48;
const PAGE_SIZE_LIST = 100;

/* ─── Helpers ────────────────────────────────────────────────── */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/* ─── Upload progress ────────────────────────────────────────── */
type UploadJob = { name: string; done: boolean; error?: boolean };

/* ─── Main component ─────────────────────────────────────────── */
export default function MediaPage() {
  const siteRole = useSiteRole();
  const readOnly = siteRole === null || siteRole === "viewer";
  const [allFiles, setAllFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");
  const [folder, setFolder] = useState<string>(""); // "" = all / root
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MediaFile | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, UsageRef[]>>({});
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState<MediaFile | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(""); // "" = all
  const [aiAnalyzedSet, setAiAnalyzedSet] = useState<Set<string>>(new Set());
  const [showBatchAnalyze, setShowBatchAnalyze] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  /* ── Load ─────────────────────────────────────────────────── */
  const loadUsage = useCallback(async () => {
    const res = await fetch("/api/cms/media/usage");
    if (res.ok) setUsageMap(await res.json());
  }, []);

  const loadFiles = useCallback(async () => {
    const res = await fetch("/api/media");
    const data = await res.json();
    setAllFiles(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  const loadAiAnalyzed = useCallback(async () => {
    try {
      const res = await fetch("/api/media/ai-analyzed");
      const keys: string[] = await res.json();
      setAiAnalyzedSet(new Set(keys));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadFiles();
    loadUsage();
    loadAiAnalyzed();
  }, [loadFiles, loadUsage, loadAiAnalyzed]);

  /* ── Derived state ────────────────────────────────────────── */
  const folders = Array.from(new Set(allFiles.map((f) => f.folder).filter(Boolean))).sort();

  const filtered = allFiles.filter((f) => {
    if (folder !== "" && f.folder !== folder) return false;
    if (typeFilter && f.mediaType !== typeFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q);
    }
    return true;
  });

  const pageSize = view === "grid" ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /* Reset page when filters change */
  useEffect(() => { setPage(1); }, [folder, query, view]);

  /* ── Upload ───────────────────────────────────────────────── */
  async function uploadFiles(fileList: FileList | null | File[]) {
    const files = fileList instanceof FileList ? Array.from(fileList) : (fileList ?? []);
    if (files.length === 0) return;

    const initialJobs: UploadJob[] = files.map((f) => ({ name: f.name, done: false }));
    setJobs(initialJobs);

    const targetFolder = folder || newFolder.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

    await Promise.all(
      files.map(async (file, i) => {
        const fd = new FormData();
        fd.append("file", file);
        if (targetFolder) fd.append("folder", targetFolder);
        try {
          await fetch("/api/upload", { method: "POST", body: fd });
          setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, done: true } : j));
          toast.success("Media uploaded", { description: file.name });
        } catch {
          setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, done: true, error: true } : j));
          toast.error("Upload failed");
        }
      })
    );

    await loadFiles();
    loadUsage();
    setTimeout(() => setJobs([]), 1500);
    if (targetFolder && !folder) setFolder(targetFolder);
  }

  /* ── Drag and drop ────────────────────────────────────────── */
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDragOver(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, newFolder]);

  /* ── Delete ───────────────────────────────────────────────── */
  async function handleDelete(file: MediaFile) {
    if (readOnly) return;
    setConfirmDelete(file);
  }

  async function confirmDeleteFile() {
    const file = confirmDelete;
    if (!file) return;
    setConfirmDelete(null);
    setLightboxIndex(null);
    setDeleting(file.url);
    const pathSegments = file.folder ? `${file.folder}/${file.name}` : file.name;
    await fetch(`/api/media/${encodeURIComponent(pathSegments)}`, { method: "DELETE" });
    setDeleting(null);
    setAllFiles((prev) => prev.filter((f) => f.url !== file.url));
    loadUsage();
  }

  /* ── Rename ─────────────────────────────────────────────── */
  async function handleRename(file: MediaFile, newName: string) {
    if (readOnly) return;
    if (!newName || newName === file.name) { setRenaming(null); return; }
    const res = await fetch("/api/media/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: file.folder, oldName: file.name, newName }),
    });
    if (res.ok) {
      const { url } = await res.json();
      setAllFiles((prev) => prev.map((f) =>
        f.url === file.url ? { ...f, name: newName, url } : f
      ));
      loadUsage();
    }
    setRenaming(null);
  }

  /* ── Lightbox ─────────────────────────────────────────────── */
  const imageFiles = filtered.filter((f) => f.isImage);
  function openLightbox(file: MediaFile) {
    const idx = imageFiles.findIndex((f) => f.url === file.url);
    if (idx >= 0) setLightboxIndex(idx);
  }

  /* ── Copy URL ─────────────────────────────────────────────── */
  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  }

  /* ── Uploading in progress count ──────────────────────────── */
  const pendingJobs = jobs.filter((j) => !j.done).length;
  const uploadLabel = pendingJobs > 0
    ? `Uploading ${pendingJobs}/${jobs.length}…`
    : jobs.length > 0
    ? `Done (${jobs.length} files)`
    : "Upload";

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0 }}>
    <TooltipProvider>
    <div
      ref={pageRef}
      className="flex flex-col min-h-screen relative"
      onDragEnter={!readOnly ? onDragEnter : undefined}
      onDragLeave={!readOnly ? onDragLeave : undefined}
      onDragOver={!readOnly ? onDragOver : undefined}
      onDrop={!readOnly ? onDrop : undefined}
    >
      {/* ── Drag overlay ── */}
      {dragOver && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <Upload style={{ width: "3rem", height: "3rem", color: "var(--primary)", marginBottom: "1rem" }} />
          <p style={{ fontSize: "1.25rem", fontWeight: 600, color: "white" }}>
            Drop files to upload
            {(folder || newFolder) && <span style={{ color: "var(--primary)" }}> → {folder || newFolder}</span>}
          </p>
          <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.5)", marginTop: "0.5rem" }}>
            Multiple files supported
          </p>
        </div>
      )}

      {/* ── Action bar ── */}
      <ActionBar
        actions={<>
          {/* AI Batch Analyze */}
          {!readOnly && (
            <ActionButton
              variant="secondary"
              onClick={() => setShowBatchAnalyze(true)}
              icon={<Sparkles style={{ width: 14, height: 14 }} />}
            >
              Analyze All
            </ActionButton>
          )}

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
                title={v === "grid" ? "Grid view" : "List view"}
              >
                {v === "grid" ? <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} /> : <List style={{ width: "0.875rem", height: "0.875rem" }} />}
              </button>
            ))}
          </div>

          {/* Upload button */}
          {!readOnly && (
            <>
              <ActionButton
                variant="primary"
                onClick={() => inputRef.current?.click()}
                disabled={pendingJobs > 0}
                icon={<Upload style={{ width: 14, height: 14 }} />}
              >
                {uploadLabel}
              </ActionButton>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="*/*"
                style={{ display: "none" }}
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </>
          )}
        </>}
      >
        <ActionBarBreadcrumb items={["Media"]} />
      </ActionBar>

      {/* ── Body: sidebar + content ── */}
      <div style={{ display: "flex", flex: 1 }}>

        {/* ── Folder sidebar ── */}
        <div style={{
          width: "200px", flexShrink: 0, borderRight: "1px solid var(--border)",
          padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem",
        }}>
          <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.5rem", paddingLeft: "0.25rem" }}>
            Folders
          </p>

          {/* All */}
          <FolderBtn
            label="All files"
            count={allFiles.length}
            active={folder === ""}
            icon={<LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} />}
            onClick={() => setFolder("")}
          />
          {/* Root (unfiled) */}
          {allFiles.some((f) => f.folder === "") && (
            <FolderBtn
              label="Unfiled"
              count={allFiles.filter((f) => f.folder === "").length}
              active={folder === "__root__"}
              icon={<Folder style={{ width: "0.875rem", height: "0.875rem" }} />}
              onClick={() => setFolder("__root__")}
            />
          )}
          {folders.map((f) => (
            <FolderBtn
              key={f}
              label={f}
              count={allFiles.filter((fi) => fi.folder === f).length}
              active={folder === f}
              icon={<FolderOpen style={{ width: "0.875rem", height: "0.875rem" }} />}
              onClick={() => setFolder(folder === f ? "" : f)}
            />
          ))}

          {/* Type filter */}
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.375rem", paddingLeft: "0.25rem" }}>
              Type
            </p>
            {(() => {
              // Build type list dynamically from actual files
              const typeCounts = new Map<string, number>();
              for (const f of allFiles) {
                const mt = f.mediaType ?? "other";
                typeCounts.set(mt, (typeCounts.get(mt) ?? 0) + 1);
              }
              const TYPE_LABELS: Record<string, string> = {
                image: "Images", svg: "SVG", audio: "Audio", video: "Video",
                document: "Documents", interactive: "Interactives", other: "Other",
              };
              const typeList = [
                { value: "", label: "All types" },
                ...Array.from(typeCounts.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([value]) => ({ value, label: TYPE_LABELS[value] ?? value })),
              ];
              return typeList;
            })().map((t) => {
              const count = t.value ? allFiles.filter((f) => f.mediaType === t.value).length : allFiles.length;
              if (t.value && count === 0) return null;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTypeFilter(t.value)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", cursor: "pointer",
                    background: typeFilter === t.value ? "var(--secondary)" : "transparent",
                    color: typeFilter === t.value ? "var(--foreground)" : "var(--muted-foreground)",
                    fontSize: "0.8rem", marginBottom: "0.125rem",
                  }}
                  className="hover:bg-secondary/50"
                >
                  <span>{t.label}</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* New folder input */}
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.375rem" }}>
              Upload to folder
            </p>
            <input
              type="text"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              placeholder="folder-name"
              style={{
                width: "100%", padding: "0.3rem 0.5rem",
                borderRadius: "5px", border: "1px solid var(--border)",
                background: "var(--background)", color: "var(--foreground)",
                fontSize: "0.75rem", fontFamily: "monospace",
              }}
            />
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
              New files go here
            </p>
          </div>
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Search — in content area, same pattern as collections */}
          <div style={{ padding: "1rem 1.25rem 0" }}>
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
                {filtered.length}/{allFiles.length}
              </span>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: "2rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState query={query} onUpload={() => inputRef.current?.click()} />
          ) : (
            <>
              {view === "grid" ? (
                <GridView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={readOnly ? () => {} : handleDelete} onOpen={openLightbox} onRename={readOnly ? () => {} : setRenaming} usageMap={usageMap} aiAnalyzedSet={aiAnalyzedSet} />
              ) : (
                <ListView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={readOnly ? () => {} : handleDelete} onOpen={openLightbox} onRename={readOnly ? () => {} : setRenaming} usageMap={usageMap} aiAnalyzedSet={aiAnalyzedSet} />
              )}

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "1.25rem", borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    <ChevronLeft style={{ width: "0.875rem", height: "0.875rem" }} />
                  </button>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                    {currentPage} / {totalPages} &nbsp;·&nbsp; {filtered.length} files
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    <ChevronRight style={{ width: "0.875rem", height: "0.875rem" }} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* ── Lightbox ── */}
      {lightboxIndex !== null && imageFiles[lightboxIndex] && (
        <Lightbox
          files={imageFiles}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onCopy={copyUrl}
          copied={copied}
          onDelete={readOnly ? () => {} : handleDelete}
        />
      )}

      {/* ── Rename dialog ── */}
      {renaming && (
        <RenameDialog
          file={renaming}
          onConfirm={(newName) => handleRename(renaming, newName)}
          onCancel={() => setRenaming(null)}
        />
      )}

      {/* ── Batch AI Analyze dialog ── */}
      {showBatchAnalyze && (
        <BatchAnalyzeDialog
          onClose={() => { setShowBatchAnalyze(false); loadAiAnalyzed(); }}
        />
      )}

      {/* ── Delete confirm dialog ── */}
      {confirmDelete && (
        <DeleteConfirmDialog
          file={confirmDelete}
          usages={usageMap[confirmDelete.url] ?? []}
          onConfirm={confirmDeleteFile}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
    </TooltipProvider>
    </fieldset>
  );
}

function MediaIcon({ mediaType, size = "1.5rem" }: { mediaType: string; size?: string }) {
  const s = { width: size, height: size, color: "var(--muted-foreground)" };
  switch (mediaType) {
    case "audio": return <Music style={s} />;
    case "video": return <Video style={s} />;
    case "document": return <FileText style={s} />;
    case "interactive": return <Code style={s} />;
    default: return <File style={s} />;
  }
}

/* ─── Sub-components ─────────────────────────────────────────── */

function FolderBtn({ label, count, active, icon, onClick }: {
  label: string; count: number; active: boolean; icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.35rem 0.5rem", borderRadius: "6px", border: "none", cursor: "pointer",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        fontSize: "0.8rem",
      }}
    >
      {icon}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{count}</span>
    </button>
  );
}

function EmptyState({ query, onUpload }: { query: string; onUpload: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "4rem 2rem", color: "var(--muted-foreground)" }}>
      <Upload style={{ width: "2.5rem", height: "2.5rem", opacity: 0.3 }} />
      <p style={{ fontSize: "0.875rem" }}>{query ? `No files matching "${query}"` : "No files yet"}</p>
      {!query && (
        <button
          type="button"
          onClick={onUpload}
          style={{ fontSize: "0.8rem", padding: "0.5rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
        >
          Upload files or drag &amp; drop
        </button>
      )}
    </div>
  );
}

type ViewProps = {
  files: MediaFile[];
  copied: string | null;
  deleting: string | null;
  usageMap: Record<string, UsageRef[]>;
  aiAnalyzedSet: Set<string>;
  onCopy: (url: string) => void;
  onDelete: (file: MediaFile) => void;
  onOpen: (file: MediaFile) => void;
  onRename: (file: MediaFile) => void;
};

function GridView({ files, copied, deleting, usageMap, aiAnalyzedSet, onCopy, onDelete, onOpen, onRename }: ViewProps) {
  return (
    <div style={{ padding: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.875rem" }}>
      {files.map((file) => {
        const usages = usageMap[file.url] ?? [];
        const aiKey = file.folder ? `${file.folder}/${file.name}` : file.name;
        const isAiAnalyzed = aiAnalyzedSet.has(aiKey);
        return (
          <div
            key={file.url}
            className="group relative rounded-lg border border-border bg-card"
            style={{ aspectRatio: "1 / 1.15" }}
          >
            {/* Thumbnail */}
            <div
              style={{ width: "100%", height: "72%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "0.5rem 0.5rem 0 0", cursor: file.isImage ? "zoom-in" : "default" }}
              onClick={() => file.isImage && onOpen(file)}
            >
              {file.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <MediaIcon mediaType={file.mediaType} size="2rem" />
              )}
            </div>

            {/* AI analyzed badge */}
            {isAiAnalyzed && file.isImage && (
              <span title="AI analyzed" style={{
                position: "absolute", bottom: "calc(28% + 0.375rem)", right: "0.375rem",
                background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                color: "#F7BB2E", display: "flex", alignItems: "center", justifyContent: "center",
                width: "1.25rem", height: "1.25rem", borderRadius: "9999px", pointerEvents: "none",
              }}>
                <Sparkles style={{ width: "0.6rem", height: "0.6rem" }} />
              </span>
            )}

            {/* Usage badge */}
            {usages.length > 0 && (
              <span title={usages.map((u) => `${u.collection}/${u.slug}`).join("\n")} style={{
                position: "absolute", top: "0.375rem", left: "0.375rem",
                background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
                color: "white", fontSize: "0.6rem", fontFamily: "monospace",
                padding: "1px 5px", borderRadius: "9999px", pointerEvents: "none",
              }}>
                {usages.length} {usages.length === 1 ? "use" : "uses"}
              </span>
            )}

            {/* Info */}
            <div style={{ padding: "0.375rem 0.5rem" }}>
              <p className="text-xs font-mono truncate text-foreground" title={file.name}>{file.name}</p>
              <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>
                {formatSize(file.size)}{file.folder ? ` · ${file.folder}` : ""}
              </p>
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
              style={{ pointerEvents: "none" }}
            >
              <div style={{ pointerEvents: "auto", display: "flex", gap: "0.5rem" }}>
                {file.isImage && (
                  <ActionBtn title="View full size" onClick={() => onOpen(file)}>
                    <ZoomIn style={{ width: "0.875rem", height: "0.875rem" }} />
                  </ActionBtn>
                )}
                <ActionBtn title="Rename" onClick={() => onRename(file)}>
                  <Pencil style={{ width: "0.875rem", height: "0.875rem" }} />
                </ActionBtn>
                <ActionBtn title="Copy URL" onClick={() => onCopy(file.url)}>
                  {copied === file.url ? <Check style={{ width: "0.875rem", height: "0.875rem", color: "#4ade80" }} /> : <Copy style={{ width: "0.875rem", height: "0.875rem" }} />}
                </ActionBtn>
                <ActionBtn title="Delete" onClick={() => onDelete(file)} disabled={deleting === file.url} destructive>
                  <Trash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                </ActionBtn>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ files, copied, deleting, usageMap, aiAnalyzedSet, onCopy, onDelete, onOpen, onRename }: ViewProps) {
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["File", "Folder", "Size", "Date", "AI", "Used in", ""].map((h) => (
              <th key={h} style={{ padding: "0.5rem 1rem", textAlign: "left", fontFamily: "monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const usages = usageMap[file.url] ?? [];
            const aiKey = file.folder ? `${file.folder}/${file.name}` : file.name;
            const isAiAnalyzed = aiAnalyzedSet.has(aiKey);
            return (
              <tr key={file.url} className="group" style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  {file.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt="" onClick={() => onOpen(file)} style={{ width: "2rem", height: "2rem", objectFit: "cover", borderRadius: "4px", flexShrink: 0, background: "var(--muted)", cursor: "zoom-in" }} />
                  ) : (
                    <span style={{ width: "2rem", height: "2rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MediaIcon mediaType={file.mediaType} size="1.25rem" />
                    </span>
                  )}
                  <span className="font-mono truncate" style={{ maxWidth: "260px" }} title={file.name}>{file.name}</span>
                </td>
                <td style={{ padding: "0.5rem 1rem", color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {file.folder || <span style={{ opacity: 0.4 }}>—</span>}
                </td>
                <td style={{ padding: "0.5rem 1rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{formatSize(file.size)}</td>
                <td style={{ padding: "0.5rem 1rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{formatDate(file.createdAt)}</td>
                <td style={{ padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
                  {isAiAnalyzed && file.isImage ? (
                    <span title="AI analyzed"><Sparkles style={{ width: "0.75rem", height: "0.75rem", color: "#F7BB2E" }} /></span>
                  ) : (
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.4 }}>—</span>
                  )}
                </td>
                <td style={{ padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
                  {usages.length > 0 ? (
                    <span title={usages.map((u) => `${u.collection}/${u.slug}`).join("\n")} style={{
                      fontSize: "0.7rem", fontFamily: "monospace",
                      color: "var(--foreground)", opacity: 0.7,
                    }}>
                      {usages.length} {usages.length === 1 ? "doc" : "docs"}
                    </span>
                  ) : (
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.4 }}>—</span>
                  )}
                </td>
                <td style={{ padding: "0.5rem 1rem" }}>
                  <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end" }}>
                    {file.isImage && (
                      <ActionBtn title="View full size" onClick={() => onOpen(file)} small>
                        <ZoomIn style={{ width: "0.75rem", height: "0.75rem" }} />
                      </ActionBtn>
                    )}
                    <ActionBtn title="Rename" onClick={() => onRename(file)} small>
                      <Pencil style={{ width: "0.75rem", height: "0.75rem" }} />
                    </ActionBtn>
                    <ActionBtn title="Copy URL" onClick={() => onCopy(file.url)} small>
                      {copied === file.url ? <Check style={{ width: "0.75rem", height: "0.75rem", color: "#4ade80" }} /> : <Copy style={{ width: "0.75rem", height: "0.75rem" }} />}
                    </ActionBtn>
                    <ActionBtn title="Delete" onClick={() => onDelete(file)} disabled={deleting === file.url} destructive small>
                      <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                    </ActionBtn>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Lightbox ───────────────────────────────────────────────── */
function Lightbox({ files, index, onNavigate, onClose, onCopy, copied, onDelete }: {
  files: MediaFile[];
  index: number;
  onNavigate: (i: number) => void;
  onClose: () => void;
  onCopy: (url: string) => void;
  copied: string | null;
  onDelete: (file: MediaFile) => void;
}) {
  const file = files[index];
  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
      if (e.key === "ArrowRight" && hasNext) onNavigate(index + 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onNavigate]);

  if (!file) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.folder ? `${file.folder}/` : ""}{file.name}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>
          {index + 1} / {files.length}
        </span>
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original"
          style={{ display: "flex", alignItems: "center", padding: "0.3rem", borderRadius: "6px", color: "rgba(255,255,255,0.5)", border: "none", background: "transparent", cursor: "pointer", textDecoration: "none" }}
          className="hover:text-white hover:bg-white/10 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink style={{ width: "0.875rem", height: "0.875rem" }} />
        </a>
        <button type="button" title="Copy URL" onClick={(e) => { e.stopPropagation(); onCopy(file.url); }}
          style={{ display: "flex", alignItems: "center", padding: "0.3rem", borderRadius: "6px", color: copied === file.url ? "#4ade80" : "rgba(255,255,255,0.5)", border: "none", background: "transparent", cursor: "pointer" }}
          className="hover:text-white hover:bg-white/10 transition-colors"
        >
          {copied === file.url ? <Check style={{ width: "0.875rem", height: "0.875rem" }} /> : <Copy style={{ width: "0.875rem", height: "0.875rem" }} />}
        </button>
        <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(file); }}
          style={{ display: "flex", alignItems: "center", padding: "0.3rem", borderRadius: "6px", color: "rgba(255,255,255,0.4)", border: "none", background: "transparent", cursor: "pointer" }}
          className="hover:text-red-400 hover:bg-white/10 transition-colors"
        >
          <Trash2 style={{ width: "0.875rem", height: "0.875rem" }} />
        </button>
        <button type="button" title="Close (Esc)" onClick={onClose}
          style={{ display: "flex", alignItems: "center", padding: "0.3rem", borderRadius: "6px", color: "rgba(255,255,255,0.5)", border: "none", background: "transparent", cursor: "pointer" }}
          className="hover:text-white hover:bg-white/10 transition-colors"
        >
          <X style={{ width: "1rem", height: "1rem" }} />
        </button>
      </div>

      {/* Image area + AI panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }} onClick={onClose}>
        {/* Image */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {hasPrev && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
              style={{ position: "absolute", left: "1rem", zIndex: 2, width: "2.5rem", height: "2.5rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}
              className="hover:bg-white/20 transition-colors"
            >
              <ChevronLeft style={{ width: "1.25rem", height: "1.25rem" }} />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.name}
            style={{ maxWidth: "calc(100% - 8rem)", maxHeight: "100%", objectFit: "contain", borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
            onClick={(e) => e.stopPropagation()}
          />

          {hasNext && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
              style={{ position: "absolute", right: "1rem", zIndex: 2, width: "2.5rem", height: "2.5rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}
              className="hover:bg-white/20 transition-colors"
            >
              <ChevronRight style={{ width: "1.25rem", height: "1.25rem" }} />
            </button>
          )}
        </div>

        {/* AI Metadata panel — right side */}
        {file.isImage && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "300px", flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <LightboxAIPanel imageUrl={file.url} />
          </div>
        )}
      </div>

      {/* Bottom info */}
      <div
        style={{ padding: "0.625rem 1rem", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "1.5rem", flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{formatSize(file.size)}</span>
        <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{formatDate(file.createdAt)}</span>
        {file.folder && <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>/{file.folder}</span>}
      </div>
    </div>
  );
}

/* ─── Lightbox AI Panel ──────────────────────────────────────── */
function LightboxAIPanel({ imageUrl }: { imageUrl: string }) {
  const [meta, setMeta] = useState<{ caption: string | null; alt: string | null; tags: string[]; analyzedAt: string; provider: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setMeta(null);
    setError(null);
    fetch(`/api/media/ai-meta?file=${encodeURIComponent(imageUrl)}`)
      .then((r) => r.json())
      .then((data) => { setMeta(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [imageUrl]);

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    try {
      const filename = imageUrl.replace(/^\/(api\/)?uploads\//, "");
      const parts = filename.split("/");
      const name = parts.pop()!;
      const folder = parts.join("/");
      const res = await fetch("/api/media/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name, folder }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Analysis failed");
        setAnalyzing(false);
        return;
      }
      const result = await res.json();
      setMeta({ caption: result.caption, alt: result.alt, tags: result.tags, analyzedAt: new Date().toISOString(), provider: result.provider ?? "unknown" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setAnalyzing(false);
  }

  function copyText(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  const CopyIcon = ({ text, field }: { text: string; field: string }) => (
    <button type="button" title={`Copy ${field}`} onClick={() => copyText(text, field)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", color: copiedField === field ? "#4ade80" : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
      {copiedField === field ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "1rem", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <Sparkles style={{ width: 14, height: 14 }} /> AI Analysis
        </span>
        {meta && !analyzing && (
          <button type="button" title="Re-analyze" onClick={runAnalysis}
            style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.4)" }}>
            <RefreshCw style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Loading…
        </div>
      )}

      {!loading && !meta && !analyzing && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", paddingTop: "2rem" }}>
          <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)" }}>No AI analysis yet.</p>
          <button type="button" onClick={runAnalysis}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 }}>
            <Sparkles style={{ width: 14, height: 14 }} /> Analyze
          </button>
        </div>
      )}

      {analyzing && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", justifyContent: "center", paddingTop: "2rem" }}>
          <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> Analyzing…
        </div>
      )}

      {error && <p style={{ fontSize: "0.75rem", color: "#f87171", marginBottom: "0.5rem" }}>{error}</p>}

      {meta && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Caption */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)" }}>Caption</span>
              {meta.caption && <CopyIcon text={meta.caption} field="caption" />}
            </div>
            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.5 }}>{meta.caption ?? "—"}</p>
          </div>

          {/* Alt-text */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)" }}>Alt-text</span>
              {meta.alt && <CopyIcon text={meta.alt} field="alt" />}
            </div>
            <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.85)", margin: 0, fontFamily: "monospace", lineHeight: 1.5 }}>{meta.alt ?? "—"}</p>
          </div>

          {/* Tags */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)" }}>Tags</span>
              {meta.tags.length > 0 && <CopyIcon text={meta.tags.join(", ")} field="tags" />}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {meta.tags.length > 0 ? meta.tags.map((tag) => (
                <span key={tag} style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "9999px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>{tag}</span>
              )) : <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>—</span>}
            </div>
          </div>

          {/* Timestamp */}
          {meta.analyzedAt && (
            <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.25)", margin: 0, fontFamily: "monospace" }}>
              {new Date(meta.analyzedAt).toLocaleString()} · {meta.provider}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Delete confirm dialog ──────────────────────────────────── */
function DeleteConfirmDialog({ file, usages, onConfirm, onCancel }: {
  file: MediaFile;
  usages: UsageRef[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const inUse = usages.length > 0;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--card)", border: `1px solid ${inUse ? "rgb(239 68 68 / 0.4)" : "var(--border)"}`, borderRadius: "12px", padding: "1.5rem", maxWidth: "420px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <FileWarning style={{ width: "1.25rem", height: "1.25rem", color: inUse ? "rgb(239 68 68)" : "var(--muted-foreground)", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>{inUse ? "Image is in use" : "Delete file?"}</p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace", wordBreak: "break-all", marginTop: "0.2rem" }}>{file.name}</p>
          </div>
        </div>

        {/* Usage warning */}
        {inUse && (
          <div style={{ background: "rgb(239 68 68 / 0.07)", border: "1px solid rgb(239 68 68 / 0.2)", borderRadius: "8px", padding: "0.75rem" }}>
            <p style={{ fontSize: "0.8rem", color: "rgb(239 68 68)", marginBottom: "0.5rem" }}>
              This file is referenced in <strong>{usages.length}</strong> {usages.length === 1 ? "document" : "documents"}. Deleting it will break those pages.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {usages.map((u) => (
                <li key={`${u.collection}/${u.slug}`}>
                  <a
                    href={`/admin/${u.collection}/${u.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "rgb(239 68 68)", textDecoration: "underline", textUnderlineOffset: "2px", opacity: 0.85 }}
                  >
                    {u.collection}/{u.slug}
                    {u.title !== u.slug ? <span style={{ opacity: 0.6 }}> — {u.title}</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!inUse && (
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>This file will be moved to trash. You can restore it later.</p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: "0.875rem" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--destructive)", color: "white", cursor: "pointer", fontSize: "0.875rem" }}>
            {inUse ? "Trash anyway" : "Move to trash"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Rename dialog ──────────────────────────────────────── */
function RenameDialog({ file, onConfirm, onCancel }: {
  file: MediaFile;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}) {
  // Split into base name and extension
  const lastDot = file.name.lastIndexOf(".");
  const baseName = lastDot > 0 ? file.name.slice(0, lastDot) : file.name;
  const ext = lastDot > 0 ? file.name.slice(lastDot) : "";
  const [value, setValue] = useState(baseName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  const newName = sanitized + ext;
  const isValid = sanitized.length > 0 && newName !== file.name;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", maxWidth: "420px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Pencil style={{ width: "1.25rem", height: "1.25rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
          <p style={{ fontWeight: 600, fontSize: "0.9rem" }}>Rename file</p>
        </div>

        <div>
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "0.375rem", fontFamily: "monospace" }}>
            {file.folder ? `${file.folder}/` : ""}<span style={{ opacity: 0.5 }}>*{ext}</span>
          </p>
          <form onSubmit={(e) => { e.preventDefault(); if (isValid) onConfirm(newName); }}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              style={{
                width: "100%", padding: "0.5rem 0.625rem",
                borderRadius: "6px", border: "1px solid var(--border)",
                background: "var(--background)", color: "var(--foreground)",
                fontSize: "0.85rem", fontFamily: "monospace",
              }}
            />
          </form>
          {value !== sanitized && (
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
              → {sanitized}{ext}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: "0.875rem" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => isValid && onConfirm(newName)}
            disabled={!isValid}
            style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", cursor: isValid ? "pointer" : "not-allowed", fontSize: "0.875rem", opacity: isValid ? 1 : 0.5 }}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Batch AI Analyze Dialog ─────────────────────────────── */
type BatchState = "idle" | "running" | "done";
type BatchLogEntry = { kind: "result" | "error"; filename: string; message: string };

function BatchAnalyzeDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<BatchState>("idle");
  const [total, setTotal] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [analyzed, setAnalyzed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<BatchLogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runBatch() {
    setState("running");
    setLog([]);
    setProcessed(0);
    setAnalyzed(0);
    setFailed(0);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/media/analyze-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "da" }),
        signal: ctrl.signal,
      });
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.kind === "start") {
              setTotal(evt.total);
              setSkipped(evt.skipped);
            } else if (evt.kind === "result") {
              setProcessed((n) => n + 1);
              setAnalyzed((n) => n + 1);
              setLog((prev) => [...prev, { kind: "result", filename: evt.filename, message: evt.caption }]);
            } else if (evt.kind === "error") {
              setProcessed((n) => n + 1);
              setFailed((n) => n + 1);
              setLog((prev) => [...prev, { kind: "error", filename: evt.filename, message: evt.error }]);
            } else if (evt.kind === "done") {
              setState("done");
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") setState("done");
    }
  }

  function stop() {
    abortRef.current?.abort();
    setState("done");
  }

  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.5rem", maxWidth: "560px", width: "90%", display: "flex", flexDirection: "column", gap: "1rem", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Sparkles style={{ width: "1.25rem", height: "1.25rem", color: "#F7BB2E", flexShrink: 0 }} />
          <p style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>AI Analyze All Images</p>
          <button type="button" onClick={onClose} style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* Stats */}
        {state === "idle" && (
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            Analyzes all unprocessed images using AI vision. Each image gets a caption, alt-text, and tags.
            This uses a 2-second delay between calls to respect rate limits.
          </p>
        )}

        {(state === "running" || state === "done") && (
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>
            <span>Total: {total}</span>
            <span>Skipped: {skipped}</span>
            <span style={{ color: "#4ade80" }}>Analyzed: {analyzed}</span>
            {failed > 0 && <span style={{ color: "#f87171" }}>Failed: {failed}</span>}
          </div>
        )}

        {/* Progress bar */}
        {state === "running" && total > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
              <Loader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite", color: "var(--primary)" }} />
              <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                {processed} / {total} ({progress}%)
              </span>
            </div>
            <div style={{ height: "4px", background: "var(--muted)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#F7BB2E", transition: "width 200ms" }} />
            </div>
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div style={{
            flex: 1, minHeight: 0, maxHeight: "300px", overflowY: "auto",
            border: "1px solid var(--border)", borderRadius: "8px",
            padding: "0.5rem", fontFamily: "monospace", fontSize: "0.7rem",
            background: "var(--background)",
          }}>
            {log.map((entry, i) => (
              <div key={i} style={{ padding: "0.2rem 0", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                {entry.kind === "result" ? (
                  <Check style={{ width: "0.7rem", height: "0.7rem", color: "#4ade80", flexShrink: 0, marginTop: "2px" }} />
                ) : (
                  <X style={{ width: "0.7rem", height: "0.7rem", color: "#f87171", flexShrink: 0, marginTop: "2px" }} />
                )}
                <span style={{ color: "var(--muted-foreground)" }}>{entry.filename}</span>
                <span style={{ color: "var(--foreground)", opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Done message */}
        {state === "done" && (
          <p style={{ fontSize: "0.8rem", color: "#4ade80", fontWeight: 500 }}>
            Done. {analyzed} images analyzed{failed > 0 ? `, ${failed} failed` : ""}.
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          {state === "idle" && (
            <>
              <button type="button" onClick={onClose} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: "0.875rem" }}>
                Cancel
              </button>
              <button type="button" onClick={runBatch} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Sparkles style={{ width: 14, height: 14 }} /> Start Analysis
              </button>
            </>
          )}
          {state === "running" && (
            <button type="button" onClick={stop} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", fontSize: "0.875rem" }}>
              Stop
            </button>
          )}
          {state === "done" && (
            <button type="button" onClick={onClose} style={{ padding: "0.4rem 1rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontSize: "0.875rem" }}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ title, onClick, disabled, destructive, small, children }: {
  title: string; onClick: () => void; disabled?: boolean;
  destructive?: boolean; small?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        onClick={onClick}
        disabled={disabled}
        style={{
          width: small ? "1.75rem" : "2rem",
          height: small ? "1.75rem" : "2rem",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "var(--background)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          color: destructive ? "var(--destructive)" : "var(--foreground)",
          opacity: disabled ? 0.5 : 1,
          transition: "background 150ms",
        }}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
