"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Link2, X, Image as ImageIcon } from "lucide-react";

export interface GalleryImage {
  url: string;
  alt: string;
}

interface Props {
  value: (GalleryImage | string)[];
  onChange: (images: GalleryImage[]) => void;
  disabled?: boolean;
}

export function ImageGalleryEditor({ value: rawValue = [], onChange, disabled }: Props) {
  // Normalize: accept both { url, alt } objects and plain URL strings
  const value: GalleryImage[] = rawValue.map((item: GalleryImage | string) =>
    typeof item === "string" ? { url: item, alt: "" } : item
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Media browser
  const [mediaBrowserOpen, setMediaBrowserOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<{ url: string; name: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState("");
  // URL input
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");

  useEffect(() => {
    if (!mediaBrowserOpen) return;
    setMediaLoading(true);
    fetch("/api/media")
      .then((r) => r.json())
      .then((d: { items?: { url: string; name: string }[] }) => {
        setMediaItems((d.items ?? []).filter((i) => /\.(jpe?g|png|webp|gif|avif|svg)$/i.test(i.name)));
      })
      .catch(() => {})
      .finally(() => setMediaLoading(false));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMediaBrowserOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mediaBrowserOpen]);

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploading(true);
    try {
      const uploaded: GalleryImage[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (res.ok) {
          const { url } = await res.json() as { url: string };
          uploaded.push({ url, alt: file.name.replace(/\.[^.]+$/, "") });
        }
      }
      onChange([...value, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }, [value, onChange]);

  const removeImage = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const updateAlt = (idx: number, alt: string) => {
    onChange(value.map((img, i) => i === idx ? { ...img, alt } : img));
  };

  const updateUrl = (idx: number, url: string) => {
    onChange(value.map((img, i) => i === idx ? { ...img, url } : img));
  };

  const [editingUrlIdx, setEditingUrlIdx] = useState<number | null>(null);

  const moveImage = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

      {/* Upload zone */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
          if (files.length) uploadFiles(files);
        }}
        style={{
          border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
          borderRadius: "0.625rem",
          padding: "1.5rem",
          textAlign: "center",
          cursor: disabled ? "default" : "pointer",
          transition: "border-color 150ms",
          backgroundColor: dragOver ? "rgba(255,255,255,0.03)" : "transparent",
        }}
      >
        <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
          {uploading ? "Uploading…" : "Click or drag images here"}
        </p>
        <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", opacity: 0.5, marginTop: "0.25rem" }}>
          JPEG, PNG, WebP, GIF — multiple files allowed
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) uploadFiles(files);
          e.target.value = "";
        }}
      />

      {/* Action buttons */}
      {!disabled && (
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            type="button"
            onClick={() => setMediaBrowserOpen(true)}
            style={actionBtnStyle}
            className="hover:border-primary hover:text-primary transition-colors"
          >
            <FolderOpen style={{ width: 12, height: 12 }} />
            Browse Media
          </button>
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            style={actionBtnStyle}
            className="hover:border-primary hover:text-primary transition-colors"
          >
            <Link2 style={{ width: 12, height: 12 }} />
            Add URL
          </button>
        </div>
      )}

      {/* URL input */}
      {showUrlInput && (
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <input
            type="url"
            value={urlInputValue}
            onChange={(e) => setUrlInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlInputValue.trim()) {
                onChange([...value, { url: urlInputValue.trim(), alt: "" }]);
                setUrlInputValue("");
              }
            }}
            placeholder="https://images.unsplash.com/..."
            autoFocus
            style={{
              flex: 1, padding: "0.35rem 0.5rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (urlInputValue.trim()) {
                onChange([...value, { url: urlInputValue.trim(), alt: "" }]);
                setUrlInputValue("");
              }
            }}
            style={{
              padding: "0.35rem 0.75rem", borderRadius: "6px",
              border: "none", background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
            }}
          >Add</button>
        </div>
      )}

      {/* Media browser modal */}
      {mediaBrowserOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setMediaBrowserOpen(false); }}
        >
          <div style={{
            background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)", width: "min(640px, 90vw)", maxHeight: "70vh",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                <ImageIcon style={{ width: 16, height: 16, display: "inline", verticalAlign: "text-bottom", marginRight: "0.4rem" }} />
                Media Library
              </span>
              <button type="button" onClick={() => setMediaBrowserOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
              <input type="text" value={mediaSearch} onChange={(e) => setMediaSearch(e.target.value)} placeholder="Search images…" autoFocus
                style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)", fontSize: "0.8rem", outline: "none" }} />
            </div>
            <div style={{ overflowY: "auto", padding: "0.75rem" }}>
              {mediaLoading && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading media...</div>}
              {!mediaLoading && mediaItems.length === 0 && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No images found</div>}
              {!mediaLoading && mediaItems.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "0.5rem" }}>
                  {mediaItems.filter((item) => !mediaSearch || item.name.toLowerCase().includes(mediaSearch.toLowerCase())).map((item) => (
                    <button key={item.url} type="button" onClick={() => {
                      let storedUrl = item.url;
                      try { storedUrl = new URL(item.url).pathname; } catch { /* already relative */ }
                      onChange([...value, { url: storedUrl, alt: item.name.replace(/\.[^.]+$/, "") }]);
                      setMediaBrowserOpen(false);
                    }}
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", padding: "0.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", overflow: "hidden" }}
                      className="hover:border-primary transition-colors" title={item.name}
                    >
                      <img src={item.url} alt={item.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "4px" }} loading="lazy" />
                      <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "center" }}>{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image grid */}
      {value.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
          {value.map((img, idx) => (
            <div
              key={idx}
              style={{
                position: "relative",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                overflow: "hidden",
                backgroundColor: "var(--card)",
              }}
            >
              {/* Thumbnail */}
              <div
                style={{ aspectRatio: "16/9", overflow: "hidden", cursor: disabled ? "default" : "pointer" }}
                onClick={() => !disabled && setEditingUrlIdx(editingUrlIdx === idx ? null : idx)}
                title="Click to edit URL"
              >
                <img
                  src={img.url}
                  alt={img.alt}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3"; }}
                />
              </div>

              {/* URL editor (shown when thumbnail clicked) */}
              {editingUrlIdx === idx && (
                <input
                  value={img.url}
                  onChange={(e) => updateUrl(idx, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingUrlIdx(null); }}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "0.25rem 0.4rem",
                    fontSize: "0.6rem",
                    fontFamily: "monospace",
                    border: "none",
                    borderTop: "1px solid var(--primary)",
                    backgroundColor: "var(--accent)",
                    color: "var(--foreground)",
                    outline: "none",
                  }}
                />
              )}

              {/* Alt text */}
              <input
                value={img.alt}
                onChange={(e) => updateAlt(idx, e.target.value)}
                placeholder="Alt text…"
                disabled={disabled}
                style={{
                  width: "100%",
                  padding: "0.3rem 0.5rem",
                  fontSize: "0.7rem",
                  border: "none",
                  borderTop: "1px solid var(--border)",
                  backgroundColor: "transparent",
                  color: "var(--muted-foreground)",
                  outline: "none",
                }}
              />

              {/* Controls overlay */}
              <div style={{
                position: "absolute", top: "4px", right: "4px",
                display: "flex", gap: "2px",
              }}>
                {idx > 0 && (
                  <button
                    type="button"
                    title="Move left"
                    onClick={() => moveImage(idx, idx - 1)}
                    style={iconBtn}
                  >←</button>
                )}
                {idx < value.length - 1 && (
                  <button
                    type="button"
                    title="Move right"
                    onClick={() => moveImage(idx, idx + 1)}
                    style={iconBtn}
                  >→</button>
                )}
                {confirmRemoveIdx === idx ? (
                  <>
                    <span style={{ fontSize: "0.6rem", color: "var(--destructive)", fontWeight: 500, padding: "0 1px" }}>Remove?</span>
                    <button type="button" onClick={() => { if (confirmTimer.current) clearTimeout(confirmTimer.current); setConfirmRemoveIdx(null); removeImage(idx); }}
                      style={{ ...iconBtn, fontSize: "0.55rem", padding: "0 4px", width: "auto", background: "var(--destructive)", color: "#fff", borderRadius: "3px" }}>Yes</button>
                    <button type="button" onClick={() => { if (confirmTimer.current) clearTimeout(confirmTimer.current); setConfirmRemoveIdx(null); }}
                      style={{ ...iconBtn, fontSize: "0.55rem", padding: "0 4px", width: "auto", border: "1px solid var(--border)", borderRadius: "3px" }}>No</button>
                  </>
                ) : (
                  <button type="button" title="Remove" onClick={() => { if (confirmTimer.current) clearTimeout(confirmTimer.current); setConfirmRemoveIdx(idx); confirmTimer.current = setTimeout(() => setConfirmRemoveIdx(null), 3000); }}
                    style={{ ...iconBtn, color: "var(--destructive)", fontSize: "0.75rem", fontWeight: 700 }}>×</button>
                )}
              </div>

              {/* Index badge */}
              <div style={{
                position: "absolute", top: "4px", left: "4px",
                fontSize: "0.6rem", fontFamily: "monospace",
                backgroundColor: "rgba(0,0,0,0.6)", color: "#fff",
                padding: "1px 5px", borderRadius: "4px",
              }}>
                {idx + 1}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.3rem",
  padding: "0.25rem 0.6rem", borderRadius: "6px",
  border: "1px dashed var(--border)", background: "none",
  cursor: "pointer", fontSize: "0.7rem", color: "var(--muted-foreground)",
  whiteSpace: "nowrap",
};

const iconBtn: React.CSSProperties = {
  width: "22px", height: "22px",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "0.75rem", fontWeight: 700,
  backgroundColor: "rgba(0,0,0,0.65)", color: "#fff",
  border: "none", borderRadius: "4px", cursor: "pointer",
  backdropFilter: "blur(4px)",
};
