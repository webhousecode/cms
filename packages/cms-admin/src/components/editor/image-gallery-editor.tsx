"use client";

import { useCallback, useRef, useState } from "react";

export interface GalleryImage {
  url: string;
  alt: string;
}

interface Props {
  value: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  disabled?: boolean;
}

export function ImageGalleryEditor({ value = [], onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
              <div style={{ aspectRatio: "16/9", overflow: "hidden" }}>
                <img
                  src={img.url}
                  alt={img.alt}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>

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
                <button
                  type="button"
                  title="Remove"
                  onClick={() => {
                    if (confirmRemoveIdx === idx) {
                      if (confirmTimer.current) clearTimeout(confirmTimer.current);
                      setConfirmRemoveIdx(null);
                      removeImage(idx);
                    } else {
                      if (confirmTimer.current) clearTimeout(confirmTimer.current);
                      setConfirmRemoveIdx(idx);
                      confirmTimer.current = setTimeout(() => setConfirmRemoveIdx(null), 3000);
                    }
                  }}
                  style={{
                    ...iconBtn,
                    color: "var(--destructive)",
                    width: confirmRemoveIdx === idx ? "auto" : "22px",
                    minWidth: confirmRemoveIdx === idx ? "auto" : undefined,
                    padding: confirmRemoveIdx === idx ? "0 6px" : undefined,
                    fontSize: confirmRemoveIdx === idx ? "0.6rem" : "0.75rem",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >{confirmRemoveIdx === idx ? "Sure?" : "×"}</button>
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

const iconBtn: React.CSSProperties = {
  width: "22px", height: "22px",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "0.75rem", fontWeight: 700,
  backgroundColor: "rgba(0,0,0,0.65)", color: "#fff",
  border: "none", borderRadius: "4px", cursor: "pointer",
  backdropFilter: "blur(4px)",
};
