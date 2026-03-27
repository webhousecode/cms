"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Trash2, Copy, Check, Upload, LayoutGrid, List, FolderOpen, Folder, ChevronLeft, ChevronRight, Search, X, ZoomIn, ExternalLink, FileWarning, Music, Video, FileText, Code, File, Pencil, Sparkles, RefreshCw, Loader2, CheckSquare, Zap } from "lucide-react";
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
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q") ?? "";
    // Clear ?q= from URL after reading it
    if (q) {
      url.searchParams.delete("q");
      window.history.replaceState({}, "", url.pathname);
    }
    return q;
  });
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
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "size">("newest");
  const [aiFilter, setAiFilter] = useState<"" | "analyzed" | "not-analyzed">("");
  const [aiAnalyzedSet, setAiAnalyzedSet] = useState<Set<string>>(new Set());
  const [aiMetaMap, setAiMetaMap] = useState<Record<string, { caption?: string; alt?: string; aiTags?: string[]; userTags?: string[] }>>({});
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [showBatchAnalyze, setShowBatchAnalyze] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    // Filter out generated WebP variants + dotfiles (.gitignore etc.)
    const files = Array.isArray(data) ? data.filter((f: { name: string }) =>
      !/-\d+w\.webp$/i.test(f.name) && !f.name.startsWith(".")
    ) : [];
    setAllFiles(files);
    setLoading(false);
  }, []);

  const loadAiAnalyzed = useCallback(async () => {
    try {
      const res = await fetch("/api/media/ai-analyzed?meta=1");
      const data = await res.json();
      if (data && data.keys) {
        setAiAnalyzedSet(new Set(data.keys as string[]));
        setAiMetaMap(data.meta ?? {});
      } else {
        // Fallback for old response format (plain array)
        setAiAnalyzedSet(new Set(data as string[]));
      }
    } catch { /* ignore */ }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/media/tags");
      const data = await res.json();
      setAllTags(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadFiles();
    loadUsage();
    loadAiAnalyzed();
    loadTags();
  }, [loadFiles, loadUsage, loadAiAnalyzed, loadTags]);

  /* ── Derived state ────────────────────────────────────────── */
  const folders = Array.from(new Set(allFiles.map((f) => f.folder).filter(Boolean))).sort();

  const filtered = allFiles.filter((f) => {
    if (folder !== "" && f.folder !== folder) return false;
    if (typeFilter && f.mediaType !== typeFilter) return false;
    const aiKey = f.folder ? `${f.folder}/${f.name}` : f.name;
    if (aiFilter) {
      const isAnalyzed = aiAnalyzedSet.has(aiKey);
      if (aiFilter === "analyzed" && !isAnalyzed) return false;
      if (aiFilter === "not-analyzed" && isAnalyzed) return false;
    }
    if (tagFilter) {
      const ai = aiMetaMap[aiKey];
      if (!ai?.userTags?.includes(tagFilter)) return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const qNoExt = q.replace(/\.[^.]+$/, "");
      const fLower = f.name.toLowerCase();
      if (fLower.includes(q) || fLower.includes(qNoExt) || f.folder.toLowerCase().includes(q)) return true;
      // Search in AI + user metadata
      const ai = aiMetaMap[aiKey];
      if (ai) {
        if (ai.caption?.toLowerCase().includes(q)) return true;
        if (ai.alt?.toLowerCase().includes(q)) return true;
        if (ai.aiTags?.some((t) => t.toLowerCase().includes(q))) return true;
        if (ai.userTags?.some((t) => t.toLowerCase().includes(q))) return true;
      }
      return false;
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "name": return a.name.localeCompare(b.name);
      case "size": return b.size - a.size;
      default: return 0;
    }
  });

  const pageSize = view === "grid" ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /* Reset page when filters change */
  useEffect(() => { setPage(1); }, [folder, query, view, sortBy, tagFilter]);

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
    setSortBy("newest");
    setPage(1);
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

  /* ── Bulk delete ────────────────────────────────────────── */
  const [confirmBulk, setConfirmBulk] = useState(false);
  async function bulkDelete() {
    if (readOnly || selected.size === 0) return;
    const urls = Array.from(selected);
    setConfirmBulk(false);
    for (const url of urls) {
      const file = allFiles.find((f) => f.url === url);
      if (!file) continue;
      const pathSegments = file.folder ? `${file.folder}/${file.name}` : file.name;
      await fetch(`/api/media/${encodeURIComponent(pathSegments)}`, { method: "DELETE" });
    }
    setAllFiles((prev) => prev.filter((f) => !selected.has(f.url)));
    setSelected(new Set());
    setSelecting(false);
    loadUsage();
  }

  function toggleSelect(file: MediaFile) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file.url)) next.delete(file.url);
      else next.add(file.url);
      return next;
    });
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
  const imageFiles = filtered.filter((f) => f.isImage || f.mediaType === "video");
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
          {/* Multi-select toggle + bulk actions */}
          {!readOnly && selecting ? (
            <>
              <span style={{ fontSize: "0.75rem", color: "var(--foreground)", fontWeight: 500 }}>
                {selected.size} selected
              </span>
              {selected.size > 0 && !confirmBulk && (
                <>
                  <ActionButton variant="secondary" onClick={() => setConfirmBulk(true)} icon={<Trash2 style={{ width: 14, height: 14, color: "var(--destructive)" }} />}>
                    Delete
                  </ActionButton>

                  {/* Analyze selected */}
                  <ActionButton
                    variant="secondary"
                    onClick={() => setShowBatchAnalyze(true)}
                    icon={<Sparkles style={{ width: 14, height: 14 }} />}
                  >
                    Analyze
                  </ActionButton>

                  {/* Optimize selected */}
                  <ActionButton
                    variant="secondary"
                    onClick={async () => {
                      const urls = Array.from(selected);
                      const res = await fetch("/api/media/optimize-batch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ files: urls }),
                      });
                      if (res.ok) {
                        const d = await res.json() as { processed: number; skipped: number; errors: number; savedMB: number };
                        const { toast } = await import("sonner");
                        toast.success(`Optimized ${d.processed} of ${selected.size} selected (${d.savedMB} MB saved)`);
                      }
                    }}
                    icon={<Zap style={{ width: 14, height: 14 }} />}
                  >
                    Optimize
                  </ActionButton>
                </>
              )}
              {confirmBulk && (
                <>
                  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                  <button onClick={bulkDelete}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                      border: "none", background: "var(--destructive)", color: "#fff",
                      cursor: "pointer", lineHeight: 1 }}>Yes</button>
                  <button onClick={() => setConfirmBulk(false)}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                </>
              )}
              <ActionButton variant="secondary" onClick={() => {
                // Select all visible files
                setSelected(new Set(filtered.map((f) => f.url)));
              }}>
                All
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => { setSelecting(false); setSelected(new Set()); setConfirmBulk(false); }}>
                Cancel
              </ActionButton>
            </>
          ) : !readOnly ? (
            <>
              <ActionButton variant="secondary" onClick={() => setSelecting(true)} icon={<CheckSquare style={{ width: 14, height: 14 }} />}>
                Select
              </ActionButton>

              {/* AI Batch Analyze */}
              <ActionButton
                variant="secondary"
                onClick={() => setShowBatchAnalyze(true)}
                icon={<Sparkles style={{ width: 14, height: 14 }} />}
              >
                Analyze All
              </ActionButton>

              {/* F44: Batch optimize (WebP variants) */}
              <ActionButton
                variant="secondary"
                onClick={async () => {
                  const res = await fetch("/api/media/optimize-batch", { method: "POST" });
                  if (res.ok) {
                    const d = await res.json() as { processed: number; skipped: number; errors: number; savedMB: number };
                    const { toast } = await import("sonner");
                    toast.success(`Optimized ${d.processed} images (${d.savedMB} MB saved)${d.skipped ? `, ${d.skipped} skipped` : ""}${d.errors ? `, ${d.errors} errors` : ""}`);
                  }
                }}
                icon={<Zap style={{ width: 14, height: 14 }} />}
              >
                Optimize All
              </ActionButton>
            </>
          ) : null}

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
          position: "sticky", top: 0, alignSelf: "flex-start", maxHeight: "100vh", overflowY: "auto",
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
              // Pre-filter by folder + AI (but NOT type) so counts reflect active filters
              const baseFiltered = allFiles.filter((f) => {
                if (folder !== "" && f.folder !== folder) return false;
                if (aiFilter) {
                  const aiKey = f.folder ? `${f.folder}/${f.name}` : f.name;
                  const isAnalyzed = aiAnalyzedSet.has(aiKey);
                  if (aiFilter === "analyzed" && !isAnalyzed) return false;
                  if (aiFilter === "not-analyzed" && isAnalyzed) return false;
                }
                if (query) {
                  const q = query.toLowerCase();
                  if (!f.name.toLowerCase().includes(q) && !f.folder.toLowerCase().includes(q)) return false;
                }
                return true;
              });
              const typeCounts = new Map<string, number>();
              for (const f of baseFiltered) {
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
              const count = t.value ? filtered.filter((f) => f.mediaType === t.value).length : filtered.length;
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

          {/* AI filter */}
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.375rem" }}>
              AI Analysis
            </p>
            {([
              { value: "" as const, label: "All" },
              { value: "analyzed" as const, label: "Analyzed" },
              { value: "not-analyzed" as const, label: "Not analyzed" },
            ]).map((t) => {
              const count = t.value === ""
                ? allFiles.filter((f) => f.isImage).length
                : t.value === "analyzed"
                  ? allFiles.filter((f) => f.isImage && aiAnalyzedSet.has(f.folder ? `${f.folder}/${f.name}` : f.name)).length
                  : allFiles.filter((f) => f.isImage && !aiAnalyzedSet.has(f.folder ? `${f.folder}/${f.name}` : f.name)).length;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setAiFilter(t.value)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", cursor: "pointer",
                    background: aiFilter === t.value ? "var(--secondary)" : "transparent",
                    color: aiFilter === t.value ? "var(--foreground)" : "var(--muted-foreground)",
                    fontSize: "0.8rem", marginBottom: "0.125rem",
                  }}
                  className="hover:bg-secondary/50"
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    {t.value === "analyzed" && <Sparkles style={{ width: 10, height: 10, color: "#F7BB2E" }} />}
                    {t.label}
                  </span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Tags filter */}
          {allTags.length > 0 && (
            <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
              <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.375rem" }}>
                Tags
              </p>
              <button
                type="button"
                onClick={() => setTagFilter("")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                  padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", cursor: "pointer",
                  background: tagFilter === "" ? "var(--secondary)" : "transparent",
                  color: tagFilter === "" ? "var(--foreground)" : "var(--muted-foreground)",
                  fontSize: "0.8rem", marginBottom: "0.125rem",
                }}
                className="hover:bg-secondary/50"
              >
                <span>All</span>
              </button>
              {allTags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === t.tag ? "" : t.tag)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                    padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", cursor: "pointer",
                    background: tagFilter === t.tag ? "var(--secondary)" : "transparent",
                    color: tagFilter === t.tag ? "var(--foreground)" : "var(--muted-foreground)",
                    fontSize: "0.8rem", marginBottom: "0.125rem",
                  }}
                  className="hover:bg-secondary/50"
                >
                  <span>{t.tag}</span>
                  <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{t.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Sort */}
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
            <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "0.375rem" }}>
              Sort by
            </p>
            {([
              { value: "newest" as const, label: "Newest first" },
              { value: "oldest" as const, label: "Oldest first" },
              { value: "name" as const, label: "Name" },
              { value: "size" as const, label: "Size" },
            ]).map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSortBy(t.value)}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", cursor: "pointer",
                  background: sortBy === t.value ? "var(--secondary)" : "transparent",
                  color: sortBy === t.value ? "var(--foreground)" : "var(--muted-foreground)",
                  fontSize: "0.8rem", marginBottom: "0.125rem",
                }}
                className="hover:bg-secondary/50"
              >
                {t.label}
              </button>
            ))}
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
                  style={{ width: "100%", paddingLeft: "2rem", paddingRight: query ? "2rem" : "0.75rem", paddingTop: "0.375rem", paddingBottom: "0.375rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", fontSize: "0.8rem", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}
                  >
                    <X style={{ width: "0.8rem", height: "0.8rem" }} />
                  </button>
                )}
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
                <GridView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={readOnly ? () => {} : handleDelete} onOpen={openLightbox} onRename={readOnly ? () => {} : setRenaming} usageMap={usageMap} aiAnalyzedSet={aiAnalyzedSet} selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />
              ) : (
                <ListView files={paginated} copied={copied} deleting={deleting} onCopy={copyUrl} onDelete={readOnly ? () => {} : handleDelete} onOpen={openLightbox} onRename={readOnly ? () => {} : setRenaming} usageMap={usageMap} aiAnalyzedSet={aiAnalyzedSet} selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />
              )}

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "1.25rem", borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    disabled={currentPage === 1}
                    title="First page"
                    style={{ padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.4 : 1, fontSize: "0.7rem", fontFamily: "monospace" }}
                  >
                    1
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    <ChevronLeft style={{ width: "0.875rem", height: "0.875rem" }} />
                  </button>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
                    {currentPage} / {totalPages} &nbsp;·&nbsp; {sorted.length} files
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: "0.35rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    <ChevronRight style={{ width: "0.875rem", height: "0.875rem" }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    disabled={currentPage === totalPages}
                    title="Last page"
                    style={{ padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.4 : 1, fontSize: "0.7rem", fontFamily: "monospace" }}
                  >
                    {totalPages}
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
          onClose={() => { setLightboxIndex(null); loadAiAnalyzed(); loadTags(); }}
          onCopy={copyUrl}
          copied={copied}
          onDelete={readOnly ? () => {} : handleDelete}
          onTagsChanged={loadTags}
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
          selectedFiles={selecting && selected.size > 0 ? Array.from(selected).map((url) => {
            const file = allFiles.find((f) => f.url === url);
            if (!file) return "";
            return file.folder ? `${file.folder}/${file.name}` : file.name;
          }).filter(Boolean) : undefined}
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

function VideoThumb({ file }: { file: MediaFile }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/media/video-thumb?file=${encodeURIComponent(file.url)}`)
      .then((r) => r.ok ? r.blob() : null)
      .then((blob) => {
        if (blob) setSrc(URL.createObjectURL(blob));
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [file.url]);

  if (failed || !src) {
    return <MediaIcon mediaType="video" size="2rem" />;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <Video style={{ position: "absolute", top: "0.375rem", right: "0.375rem", width: "1rem", height: "1rem", color: "white", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
    </>
  );
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
  selecting?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (file: MediaFile) => void;
};

function GridView({ files, copied, deleting, usageMap, aiAnalyzedSet, onCopy, onDelete, onOpen, onRename, selecting, selected, onToggleSelect }: ViewProps) {
  return (
    <div style={{ padding: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.875rem" }}>
      {files.map((file) => {
        const usages = usageMap[file.url] ?? [];
        const aiKey = file.folder ? `${file.folder}/${file.name}` : file.name;
        const isAiAnalyzed = aiAnalyzedSet.has(aiKey);
        const isSelected = selecting && selected?.has(file.url);
        return (
          <div
            key={file.url}
            className="group relative rounded-lg border bg-card"
            style={{ aspectRatio: "1 / 1.15", borderColor: isSelected ? "var(--primary)" : "var(--border)", boxShadow: isSelected ? "0 0 0 1px var(--primary)" : "none" }}
            onClick={selecting ? () => onToggleSelect?.(file) : undefined}
          >
            {/* Selection checkbox */}
            {selecting && (
              <div style={{
                position: "absolute", top: "0.375rem", left: "0.375rem", zIndex: 5,
                width: "1.25rem", height: "1.25rem", borderRadius: "4px",
                border: isSelected ? "none" : "2px solid rgba(255,255,255,0.6)",
                background: isSelected ? "var(--primary)" : "rgba(0,0,0,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}>
                {isSelected && <Check style={{ width: "0.75rem", height: "0.75rem", color: "var(--primary-foreground)" }} />}
              </div>
            )}
            {/* Thumbnail */}
            <div
              style={{ width: "100%", height: "72%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "0.5rem 0.5rem 0 0", cursor: selecting ? "pointer" : (file.isImage || file.mediaType === "video") ? "pointer" : "default", position: "relative" }}
              onClick={!selecting ? () => (file.isImage || file.mediaType === "video") && onOpen(file) : undefined}
            >
              {file.isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : file.mediaType === "video" ? (
                <VideoThumb file={file} />
              ) : (
                <MediaIcon mediaType={file.mediaType} size="2rem" />
              )}
            </div>

            {/* AI analyzed badge */}
            {isAiAnalyzed && (file.isImage || file.mediaType === "video") && (
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

function ListView({ files, copied, deleting, usageMap, aiAnalyzedSet, onCopy, onDelete, onOpen, onRename, selecting, selected, onToggleSelect }: ViewProps) {
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {selecting && <th style={{ padding: "0.5rem 0.5rem 0.5rem 1rem", width: "2rem" }} />}
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
              <tr key={file.url} className="group" style={{ borderBottom: "1px solid var(--border)", cursor: selecting ? "pointer" : undefined }} onClick={selecting ? () => onToggleSelect?.(file) : undefined}>
                {selecting && (
                  <td style={{ padding: "0.5rem 0.5rem 0.5rem 1rem", width: "2rem" }}>
                    <div style={{
                      width: "1.1rem", height: "1.1rem", borderRadius: "3px",
                      border: selected?.has(file.url) ? "none" : "2px solid var(--border)",
                      background: selected?.has(file.url) ? "var(--primary)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected?.has(file.url) && <Check style={{ width: "0.7rem", height: "0.7rem", color: "var(--primary-foreground)" }} />}
                    </div>
                  </td>
                )}
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
                  {isAiAnalyzed && (file.isImage || file.mediaType === "video") ? (
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
function Lightbox({ files, index, onNavigate, onClose, onCopy, copied, onDelete, onTagsChanged }: {
  files: MediaFile[];
  index: number;
  onNavigate: (i: number) => void;
  onClose: () => void;
  onCopy: (url: string) => void;
  copied: string | null;
  onDelete: (file: MediaFile) => void;
  onTagsChanged?: () => void;
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

          {file.mediaType === "video" ? (
            <video
              src={file.url}
              controls
              autoPlay
              style={{ maxWidth: "calc(100% - 8rem)", maxHeight: "100%", borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name}
              style={{ maxWidth: "calc(100% - 8rem)", maxHeight: "100%", objectFit: "contain", borderRadius: "4px", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {hasNext && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
              style={{ position: "absolute", right: "1rem", zIndex: 2, width: "2.5rem", height: "2.5rem", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}
              className="hover:bg-white/20 transition-colors"
            >
              <ChevronRight style={{ width: "1.25rem", height: "1.25rem" }} />
            </button>
          )}
        </div>

        {/* Metadata panel — right side */}
        {(file.isImage || file.mediaType === "video") && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "300px", flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", overflowY: "auto" }}
          >
            <LightboxAIPanel imageUrl={file.url} />
            <LightboxTagPanel fileKey={file.folder ? `${file.folder}/${file.name}` : file.name} onTagsChanged={onTagsChanged} />
            {file.isImage && <LightboxExifPanel imageUrl={file.url} />}
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

/* ─── Lightbox Tag Panel ─────────────────────────────────────── */
function LightboxTagPanel({ fileKey, onTagsChanged }: { fileKey: string; onTagsChanged?: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setInput("");
    setConfirmRemove(null);
    // Fetch current tags from media meta
    fetch(`/api/media/ai-meta?file=/uploads/${encodeURIComponent(fileKey)}`)
      .then((r) => r.json())
      .then((data) => {
        // userTags are stored as "tags" in media-meta
        setTags(data?.userTags ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileKey]);

  async function saveTags(newTags: string[]) {
    setTags(newTags);
    await fetch("/api/media/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: fileKey, tags: newTags }),
    });
    onTagsChanged?.();
  }

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (!tag || tags.includes(tag)) { setInput(""); return; }
    saveTags([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
    setConfirmRemove(null);
  }

  return (
    <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
        Tags
      </p>
      {loading ? null : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: tags.length > 0 ? "0.625rem" : 0 }}>
            {tags.map((tag) => (
              <span key={tag} style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "9999px", background: "rgba(247,187,46,0.12)", border: "1px solid rgba(247,187,46,0.25)", color: "rgba(255,255,255,0.85)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                {tag}
                {confirmRemove === tag ? (
                  <>
                    <span style={{ fontSize: "0.6rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                    <button onClick={() => removeTag(tag)}
                      style={{ fontSize: "0.55rem", padding: "0.05rem 0.25rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                    <button onClick={() => setConfirmRemove(null)}
                      style={{ fontSize: "0.55rem", padding: "0.05rem 0.25rem", borderRadius: "3px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", lineHeight: 1 }}>No</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmRemove(tag)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: 0, fontSize: "0.75rem", lineHeight: 1 }}>&times;</button>
                )}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^a-zA-Z0-9æøåÆØÅäöüÄÖÜ_ -]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Add tag…"
              style={{
                flex: 1, padding: "0.25rem 0.4rem", borderRadius: "5px",
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.85)", fontSize: "0.75rem", outline: "none",
              }}
            />
            {input.trim() && (
              <button onClick={addTag}
                style={{ padding: "0.25rem 0.5rem", borderRadius: "5px", border: "none", background: "#F7BB2E", color: "#0D0D0D", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer" }}>
                +
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Lightbox EXIF Panel ────────────────────────────────────── */
function LightboxExifPanel({ imageUrl }: { imageUrl: string }) {
  const [exif, setExif] = useState<{
    make?: string; model?: string; date?: string;
    gpsLat?: number; gpsLon?: number; gpsAlt?: number;
    iso?: number; fNumber?: number; exposureTime?: number;
    focalLength?: number; lens?: string; width?: number; height?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setExif(null);
    fetch(`/api/media/exif?file=${encodeURIComponent(imageUrl)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exif) setExif(d.exif); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [imageUrl]);

  if (loading) return null;
  if (!exif) return null;

  const lbl: React.CSSProperties = { fontSize: "0.65rem", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.05em" };
  const val: React.CSSProperties = { fontSize: "0.75rem", color: "rgba(255,255,255,0.8)", fontFamily: "monospace" };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "baseline" };

  return (
    <div style={{ padding: "1rem 1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
        EXIF Data
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {exif.make && exif.model && (
          <div style={row}><span style={lbl}>Camera</span><span style={val}>{exif.make} {exif.model}</span></div>
        )}
        {exif.date && (
          <div style={row}><span style={lbl}>Date</span><span style={val}>{new Date(exif.date).toLocaleDateString("da-DK", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
        )}
        {exif.width && exif.height && (
          <div style={row}><span style={lbl}>Size</span><span style={val}>{exif.width} × {exif.height}</span></div>
        )}
        {exif.lens && (
          <div style={row}><span style={lbl}>Lens</span><span style={{ ...val, fontSize: "0.68rem" }}>{exif.lens}</span></div>
        )}
        {exif.fNumber && (
          <div style={row}><span style={lbl}>Aperture</span><span style={val}>f/{exif.fNumber}</span></div>
        )}
        {exif.exposureTime && (
          <div style={row}><span style={lbl}>Shutter</span><span style={val}>{exif.exposureTime < 1 ? `1/${Math.round(1 / exif.exposureTime)}` : `${exif.exposureTime}s`}</span></div>
        )}
        {exif.iso && (
          <div style={row}><span style={lbl}>ISO</span><span style={val}>{exif.iso}</span></div>
        )}
        {exif.focalLength && (
          <div style={row}><span style={lbl}>Focal length</span><span style={val}>{exif.focalLength}mm</span></div>
        )}
        {exif.gpsLat != null && exif.gpsLon != null && (
          <div style={row}>
            <span style={lbl}>GPS</span>
            <a
              href={`https://maps.google.com/?q=${exif.gpsLat},${exif.gpsLon}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...val, color: "var(--primary)", textDecoration: "none", fontSize: "0.68rem" }}
            >
              {exif.gpsLat.toFixed(4)}°, {exif.gpsLon.toFixed(4)}°
              {exif.gpsAlt != null ? ` (${Math.round(exif.gpsAlt)}m)` : ""}
            </a>
          </div>
        )}
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

/* ─── Batch AI Analyze Dialog ─────────────────────────────── */
type BatchState = "idle" | "running" | "done";
type BatchLogEntry = { kind: "result" | "error"; filename: string; message: string };

function BatchAnalyzeDialog({ onClose, selectedFiles }: { onClose: () => void; selectedFiles?: string[] }) {
  const [state, setState] = useState<BatchState>("idle");
  const [overwriteSetting, setOverwriteSetting] = useState<"ask" | "skip" | "overwrite">("ask");
  const [overwriteChoice, setOverwriteChoice] = useState<boolean>(false);
  const [total, setTotal] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [analyzed, setAnalyzed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<BatchLogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Fetch site setting on mount
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((cfg) => {
        const setting = cfg.aiImageOverwrite ?? "ask";
        setOverwriteSetting(setting);
        if (setting === "overwrite") setOverwriteChoice(true);
      })
      .catch(() => {});
  }, []);

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
        body: JSON.stringify({ language: "da", overwrite: overwriteChoice, files: selectedFiles }),
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
          <p style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1 }}>
            {selectedFiles && selectedFiles.length > 0
              ? `AI Analyze ${selectedFiles.length} Selected`
              : "AI Analyze All Images"}
          </p>
          <button type="button" onClick={onClose} style={{ display: "flex", alignItems: "center", border: "none", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
            <X style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* Stats */}
        {state === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
              Analyzes all images using AI vision. Each image gets a caption, alt-text, and tags.
              Uses a 2-second delay between calls to respect rate limits.
            </p>
            {overwriteSetting === "ask" && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", color: "var(--foreground)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={overwriteChoice}
                  onChange={(e) => setOverwriteChoice(e.target.checked)}
                  style={{ accentColor: "#F7BB2E" }}
                />
                Re-analyze images that already have AI data
              </label>
            )}
            {overwriteSetting === "skip" && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                Already-analyzed images will be skipped (configured in Site Settings).
              </p>
            )}
            {overwriteSetting === "overwrite" && (
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                All images will be re-analyzed, including existing (configured in Site Settings).
              </p>
            )}
          </div>
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
