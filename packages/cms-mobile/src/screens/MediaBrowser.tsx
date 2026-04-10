import { useCallback, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { motion, useMotionValue, animate } from "framer-motion";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getMedia, getMe, uploadFile, analyzeMedia } from "@/api/client";
import type { MediaFile } from "@/api/types";

// ─── Fullscreen Image Viewer (iOS Photos style) ─────

function ImageViewer({
  images,
  initialIndex,
  onClose,
  orgId,
  siteId,
}: {
  images: MediaFile[];
  initialIndex: number;
  onClose: () => void;
  orgId: string;
  siteId: string;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const file = images[index];
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const dragX = useMotionValue(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const decided = useRef(false);
  const isHorizontal = useRef(false);

  const W = typeof window !== "undefined" ? window.innerWidth : 390;
  const THRESHOLD = W * 0.25;

  // Scroll thumbnail strip to keep active thumb centered
  useEffect(() => {
    const el = thumbStripRef.current;
    if (!el) return;
    const thumb = el.children[index] as HTMLElement | undefined;
    if (thumb) thumb.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [index]);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
    decided.current = false;
    isHorizontal.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX.current;
    const dy = Math.abs(t.clientY - startY.current);
    if (!decided.current && (Math.abs(dx) > 8 || dy > 8)) {
      decided.current = true;
      isHorizontal.current = Math.abs(dx) > dy;
    }
    if (!isHorizontal.current) return;
    if (dx > 0 && index === 0) { dragX.set(dx * 0.2); return; }
    if (dx < 0 && index === images.length - 1) { dragX.set(dx * 0.2); return; }
    dragX.set(dx);
  }

  function handleTouchEnd() {
    if (!isHorizontal.current) return;
    const current = dragX.get();
    if (current < -THRESHOLD && index < images.length - 1) {
      void animate(dragX, -W, { type: "spring", stiffness: 400, damping: 35 }).then(() => {
        setIndex((i) => i + 1);
        dragX.set(0);
      });
    } else if (current > THRESHOLD && index > 0) {
      void animate(dragX, W, { type: "spring", stiffness: 400, damping: 35 }).then(() => {
        setIndex((i) => i - 1);
        dragX.set(0);
      });
    } else {
      void animate(dragX, 0, { type: "spring", stiffness: 400, damping: 35 });
    }
  }

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* ── Top bar: back + date + counter ── */}
      <div className="flex items-center px-4 pt-safe-top py-2 shrink-0 z-10">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-90 transition-transform"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
            <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex-1 text-center">
          <p className="text-xs font-medium text-white">{file.name}</p>
          <p className="text-[10px] text-white/40">{formatDate(file.createdAt)} · {formatSize(file.size)}</p>
        </div>
        <span className="text-[10px] text-white/30 tabular-nums w-10 text-right">
          {index + 1}/{images.length}
        </span>
      </div>

      {/* ── Full-bleed image with swipe ── */}
      <div
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => setDrawerOpen((v) => !v)}
      >
        <motion.div className="absolute inset-0" style={{ x: dragX }}>
          {index > 0 && (
            <div className="absolute inset-y-0 flex items-center justify-center" style={{ left: -W, width: W }}>
              <img src={images[index - 1].thumbUrl || images[index - 1].url} alt="" className="max-w-full max-h-full object-contain" />
            </div>
          )}
          <div className="absolute inset-y-0 left-0 flex items-center justify-center" style={{ width: W }}>
            <ViewerImage thumbSrc={file.thumbUrl || file.url} fullSrc={file.url} alt={file.name} />
          </div>
          {index < images.length - 1 && (
            <div className="absolute inset-y-0 flex items-center justify-center" style={{ left: W, width: W }}>
              <img src={images[index + 1].thumbUrl || images[index + 1].url} alt="" className="max-w-full max-h-full object-contain" />
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Thumbnail strip (iOS Photos style) ── */}
      <div
        ref={thumbStripRef}
        className="flex gap-1 px-2 py-2 overflow-x-auto shrink-0 scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {images.map((img, i) => (
          <button
            key={img.name}
            type="button"
            onClick={() => setIndex(i)}
            className={`shrink-0 w-10 h-10 rounded overflow-hidden transition-all ${
              i === index ? "ring-2 ring-brand-gold scale-110" : "opacity-50"
            }`}
          >
            <img src={img.thumbUrl || img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        ))}
      </div>

      {/* ── Bottom drawer: AI + metadata ── */}
      <div
        className={`shrink-0 bg-brand-dark border-t border-white/10 transition-all duration-300 safe-bottom overflow-hidden`}
        style={{ maxHeight: drawerOpen ? "50vh" : "3.5rem" }}
      >
        {/* Drawer handle — always visible, tall touch target */}
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="w-full flex flex-col items-center py-3 active:bg-white/5"
        >
          <div className="w-8 h-1 rounded-full bg-white/20 mb-1.5" />
          <p className="text-xs text-white/50">
            {drawerOpen ? "Hide details" : file.aiCaption ? "Show image analysis" : "Tap for details"}
          </p>
        </button>

        {/* Drawer content — only rendered when open */}
        {drawerOpen && (
          <div className="px-5 pb-4 overflow-y-auto" style={{ maxHeight: "calc(50vh - 3.5rem)" }}>
            <ViewerDrawerContent file={file} orgId={orgId} siteId={siteId} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows thumbnail immediately, swaps to full-size when loaded */
function ViewerImage({ thumbSrc, fullSrc, alt }: { thumbSrc: string; fullSrc: string; alt: string }) {
  const [loaded, setLoaded] = useState(thumbSrc === fullSrc);
  return (
    <>
      {!loaded && <img src={thumbSrc} alt={alt} className="max-w-full max-h-full object-contain absolute" />}
      <img
        src={fullSrc}
        alt={alt}
        className={`max-w-full max-h-full object-contain ${loaded ? "" : "opacity-0 absolute"}`}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

/** Drawer content: AI analysis + file info + analyze button */
function ViewerDrawerContent({ file, orgId, siteId }: { file: MediaFile; orgId: string; siteId: string }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [aiData, setAiData] = useState<{ caption?: string | null; alt?: string | null; tags?: string[] | null }>({
    caption: file.aiCaption, alt: file.aiAlt, tags: file.aiTags,
  });

  useEffect(() => {
    setAiData({ caption: file.aiCaption, alt: file.aiAlt, tags: file.aiTags });
    setAnalyzing(false);
  }, [file.name, file.aiCaption, file.aiAlt, file.aiTags]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const result = await analyzeMedia(orgId, siteId, file.name, file.folder || undefined);
      setAiData({ caption: result.caption, alt: result.alt, tags: result.tags });
    } catch (err) {
      console.error("Analyze failed:", err);
    } finally {
      setAnalyzing(false);
    }
  }

  const hasAi = !!(aiData.caption || aiData.alt);

  return (
    <div className="space-y-3">
      {/* AI Analysis */}
      {hasAi ? (
        <>
          {aiData.caption && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Caption</p>
              <p className="text-xs text-white/70">{aiData.caption}</p>
            </div>
          )}
          {aiData.alt && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-0.5">Alt text</p>
              <p className="text-xs text-white/70 font-mono">{aiData.alt}</p>
            </div>
          )}
          {aiData.tags && aiData.tags.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {aiData.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-2">
          <p className="text-xs text-white/30 mb-2">No AI analysis yet.</p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-medium text-brand-dark active:scale-95 transition-transform disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
                Analyzing...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z" fill="currentColor" />
                </svg>
                Analyze
              </>
            )}
          </button>
        </div>
      )}

      {/* File info */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">File info</p>
        <div className="grid grid-cols-2 gap-y-1 text-xs">
          <span className="text-white/30">Name</span>
          <span className="text-white/60 truncate">{file.name}</span>
          <span className="text-white/30">Size</span>
          <span className="text-white/60">{formatSize(file.size)}</span>
          <span className="text-white/30">Created</span>
          <span className="text-white/60">{formatDate(file.createdAt)}</span>
          {file.folder && (
            <>
              <span className="text-white/30">Folder</span>
              <span className="text-white/60">{file.folder}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function MediaBrowser() {
  const [, params] = useRoute<{ orgId: string; siteId: string }>(
    "/site/:orgId/:siteId/media",
  );
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const site = meQuery.data?.sites.find(
    (s) => s.orgId === params?.orgId && s.siteId === params?.siteId,
  );

  const mediaQuery = useQuery({
    queryKey: ["media", params?.orgId, params?.siteId, search],
    queryFn: () => getMedia(params!.orgId, params!.siteId, search || undefined),
    enabled: !!params,
  });

  const goBack = useCallback(
    () => setLocation(`/site/${params?.orgId}/${params?.siteId}`),
    [setLocation, params],
  );

  async function handleUpload(file: File) {
    if (!params || uploading) return;
    setUploading(true);
    try {
      await uploadFile(params.orgId, params.siteId, file);
      await queryClient.invalidateQueries({ queryKey: ["media", params.orgId, params.siteId] });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  async function pickImage() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
      });
      if (photo.webPath) {
        const res = await fetch(photo.webPath);
        const blob = await res.blob();
        const ext = photo.format === "png" ? "png" : "jpg";
        const file = new File([blob], `photo-${Date.now()}.${ext}`, { type: `image/${ext}` });
        await handleUpload(file);
      }
    } catch {
      fileRef.current?.click();
    }
  }

  if (!params) {
    setLocation("/home");
    return null;
  }

  const files = mediaQuery.data?.files ?? [];
  const images = files.filter((f) => f.isImage);

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title="Media"
        subtitle={site?.siteName ?? params.siteId}
        right={
          <button
            type="button"
            onClick={pickImage}
            disabled={uploading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold text-brand-dark active:scale-90 transition-transform disabled:opacity-50"
            aria-label="Upload"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v7M5 6l3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 11v2h10v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        }
      />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Search */}
        <div className="px-6 pb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media..."
            className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-brand-gold transition-colors"
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto px-6 pb-24">
          {mediaQuery.isLoading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-white/40">
                {search ? "No matches" : "No media files yet"}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={pickImage}
                  disabled={uploading}
                  className="text-sm text-brand-gold active:opacity-70"
                >
                  Upload first image
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {images.map((file, idx) => (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => setViewerIndex(idx)}
                  className="relative aspect-square rounded-lg overflow-hidden active:scale-95 transition-transform"
                >
                  <img
                    src={file.thumbUrl || file.url}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Non-image files */}
          {files.filter((f) => !f.isImage).length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Other files</p>
              <div className="flex flex-col gap-1">
                {files.filter((f) => !f.isImage).map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5"
                  >
                    <span className="text-lg">
                      {file.mediaType === "audio" ? "🎵" : file.mediaType === "video" ? "🎬" : "📄"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs truncate">{file.name}</p>
                      <p className="text-[10px] text-white/30">{formatSize(file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen image viewer with swipe */}
      {viewerIndex !== null && images[viewerIndex] && (
        <ImageViewer
          images={images}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          orgId={params!.orgId}
          siteId={params!.siteId}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
    </Screen>
  );
}
