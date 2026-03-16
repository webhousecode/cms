"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Copy, Check, Upload, LayoutGrid, List, FolderOpen, Folder, ChevronLeft, ChevronRight, Search, X, ZoomIn, ExternalLink, FileWarning, Music, Video, FileText, Code, File, Pencil } from "lucide-react";
import type { UsageRef } from "@/app/api/cms/media/usage/route";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

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

  useEffect(() => {
    loadFiles();
    loadUsage();
  }, [loadFiles, loadUsage]);

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
        } catch {
          setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, done: true, error: true } : j));
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
    <TooltipProvider>
    <div
      ref={pageRef}
      className="flex flex-col min-h-screen relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
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

      {/* ── Top bar ── */}
      <div
        className="sticky flex items-center gap-3 px-4 border-b border-border shrink-0"
        style={{ top: 84, height: "48px", zIndex: 30, backgroundColor: "var(--card)" }}
      >
        <span className="text-sm font-mono text-foreground">media</span>
        <span className="text-xs text-muted-foreground">({filtered.length}/{allFiles.length})</span>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: "0.5rem", top: "50%", transform: "translateY(-50%)", width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            style={{
              paddingLeft: "1.75rem", paddingRight: query ? "1.75rem" : "0.5rem",
              paddingTop: "0.25rem", paddingBottom: "0.25rem",
              borderRadius: "6px", border: "1px solid var(--border)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: "0.8rem", width: "180px",
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
              title={v === "grid" ? "Grid view" : "List view"}
            >
              {v === "grid" ? <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} /> : <List style={{ width: "0.875rem", height: "0.875rem" }} />}
            </button>
          ))}
        </div>

        {/* Upload button */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pendingJobs > 0}
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
            pendingJobs > 0 && "opacity-70 cursor-wait"
          )}
        >
          <Upload style={{ width: "0.875rem", height: "0.875rem" }} />
          {uploadLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="*/*"
          style={{ display: "none" }}
          onChange={(e) => uploadFiles(e.target.files)}
        />
      </div>

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
          {loading ? (
            <div style={{ padding: "2rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState query={query} onUpload={() => inputRef.current?.click()} />
          ) : (
            <>
              {view === "grid" ? (
                <GridView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={handleDelete} onOpen={openLightbox} onRename={setRenaming} usageMap={usageMap} />
              ) : (
                <ListView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={handleDelete} onOpen={openLightbox} onRename={setRenaming} usageMap={usageMap} />
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
          onDelete={handleDelete}
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
  onCopy: (url: string) => void;
  onDelete: (file: MediaFile) => void;
  onOpen: (file: MediaFile) => void;
  onRename: (file: MediaFile) => void;
};

function GridView({ files, copied, deleting, usageMap, onCopy, onDelete, onOpen, onRename }: ViewProps) {
  return (
    <div style={{ padding: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.875rem" }}>
      {files.map((file) => {
        const usages = usageMap[file.url] ?? [];
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

function ListView({ files, copied, deleting, usageMap, onCopy, onDelete, onOpen, onRename }: ViewProps) {
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["File", "Folder", "Size", "Date", "Used in", ""].map((h) => (
              <th key={h} style={{ padding: "0.5rem 1rem", textAlign: "left", fontFamily: "monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", fontWeight: 400 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const usages = usageMap[file.url] ?? [];
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

      {/* Image area */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }} onClick={onClose}>
        {/* Prev */}
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

        {/* Next */}
        {hasNext && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
            style={{ position: "absolute", right: "1rem", zIndex: 2, width: "2.5rem", height: "2.5rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}
            className="hover:bg-white/20 transition-colors"
          >
            <ChevronRight style={{ width: "1.25rem", height: "1.25rem" }} />
          </button>
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
