"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Plus, ImageIcon, Loader2, X } from "lucide-react";

type FileCategory = "image" | "document" | "html" | "data";

interface UploadedFile {
  name: string;
  url: string;
  category: FileCategory;
  textContent?: string;  // For text-based files (CSV, MD, HTML, etc.)
}

const ACCEPT_TYPES = "image/*,.csv,.md,.markdown,.txt,.doc,.docx,.ppt,.pptx,.pdf,.html,.htm";

function categorizeFile(file: File): FileCategory {
  if (file.type.startsWith("image/")) return "image";
  if (file.name.endsWith(".html") || file.name.endsWith(".htm")) return "html";
  if (file.name.endsWith(".csv") || file.name.endsWith(".json")) return "data";
  return "document";
}

const FILE_ICONS: Record<FileCategory, string> = {
  image: "🖼️",
  document: "📄",
  html: "🌐",
  data: "📊",
};

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  visible?: boolean;
}

export function ChatInput({ onSend, disabled, placeholder, visible }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus whenever the chat becomes visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [visible]);

  // Re-focus when AI finishes (disabled goes from true → false)
  useEffect(() => {
    if (!disabled && visible) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [disabled, visible]);

  async function uploadFile(file: File): Promise<UploadedFile | null> {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) return null;
      const data = await res.json() as { url: string; name: string; extractedText?: string };
      return {
        name: data.name,
        url: data.url,
        category: categorizeFile(file),
        textContent: data.extractedText ?? undefined,
      };
    } catch {
      return null;
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setUploading(true);
    const results: UploadedFile[] = [];

    for (const file of fileList) {
      const category = categorizeFile(file);

      if (category === "image") {
        // Images: upload to media library
        const uploaded = await uploadFile(file);
        if (uploaded) results.push({ ...uploaded, category });
      } else if (category === "html") {
        // HTML: upload to media (will be available for Interactives)
        const uploaded = await uploadFile(file);
        const text = await file.text().catch(() => null);
        if (uploaded) results.push({ ...uploaded, category, textContent: text ?? undefined });
      } else if (file.name.match(/\.(csv|md|markdown|txt)$/i)) {
        // Plain text files: read content client-side
        const text = await file.text().catch(() => "");
        results.push({
          name: file.name,
          url: "",
          category,
          textContent: text.slice(0, 50000),
        });
      } else {
        // Binary documents (PDF, DOCX, PPTX): upload and let server extract text
        const uploaded = await uploadFile(file);
        if (uploaded) results.push(uploaded);
      }
    }

    setUploads((prev) => [...prev, ...results]);
    setUploading(false);
    textareaRef.current?.focus();
  }

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && uploads.length === 0) || disabled) return;

    // Build message with uploaded files referenced
    let message = trimmed;
    if (uploads.length > 0) {
      const refs = uploads.map((u) => {
        if (u.textContent) {
          return `[File: ${u.name} (${u.category})]\n\`\`\`\n${u.textContent.slice(0, 10000)}\n\`\`\``;
        }
        return `[Uploaded ${u.category}: ${u.name} → ${u.url}]`;
      }).join("\n\n");
      message = message
        ? `${message}\n\n${refs}`
        : `I uploaded ${uploads.length} file(s):\n\n${refs}`;
    }

    onSend(message);
    setValue("");
    setUploads([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, uploads, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = ta.scrollHeight;
    if (value.includes("\n") || h > 40) {
      ta.style.height = Math.min(h, 200) + "px";
    }
    ta.scrollTop = 0;
  }, [value]);

  // Focus on "/" shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      textareaRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  function removeUpload(idx: number) {
    setUploads((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div
      style={{ flexShrink: 0, padding: "12px 16px 16px", backgroundColor: "var(--background)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <style>{`.chat-textarea::placeholder { color: #888 !important; opacity: 1 !important; }`}</style>

      {/* Upload thumbnails */}
      {uploads.length > 0 && (
        <div style={{ maxWidth: "768px", margin: "0 auto 8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {uploads.map((u, i) => (
            <div
              key={i}
              style={{
                position: "relative",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid var(--border)",
                ...(u.category === "image"
                  ? { width: "64px", height: "64px" }
                  : { display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", backgroundColor: "var(--muted)" }),
              }}
            >
              {u.category === "image" ? (
                <img src={u.url} alt={u.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <>
                  <span style={{ fontSize: "1.1rem" }}>{FILE_ICONS[u.category]}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--foreground)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                </>
              )}
              <button
                onClick={() => removeUpload(i)}
                style={{
                  position: "absolute",
                  top: "2px",
                  right: "2px",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "none",
                  backgroundColor: "rgba(0,0,0,0.7)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <X style={{ width: "10px", height: "10px" }} />
              </button>
            </div>
          ))}
          {uploading && (
            <div style={{
              width: "64px", height: "64px", borderRadius: "8px",
              border: "1px dashed var(--border)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <Loader2 style={{ width: "16px", height: "16px", color: "var(--muted-foreground)" }} className="animate-spin" />
            </div>
          )}
        </div>
      )}

      <div
        style={{
          maxWidth: "768px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--card)",
          border: dragOver ? "1px solid var(--primary)" : "1px solid var(--border)",
          borderRadius: "16px",
          padding: "14px 16px 10px",
          transition: "border-color 150ms",
        }}
      >
        {/* Textarea — full width top row */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? "How can I help you today?"}
          rows={2}
          className="chat-textarea"
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            color: "#fafafa",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            padding: 0,
            fontFamily: "inherit",
            maxHeight: "200px",
            overflowY: value.includes("\n") ? "auto" : "hidden",
          }}
        />

        {/* Bottom row: + on left, send on right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            title="Upload files"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backgroundColor: "transparent",
              color: "var(--muted-foreground)",
              flexShrink: 0,
              transition: "color 150ms",
            }}
            className="hover:text-foreground hover:border-foreground"
          >
            {uploading ? (
              <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
            ) : (
              <Plus style={{ width: "14px", height: "14px" }} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_TYPES}
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <button
            onClick={handleSend}
            disabled={disabled || (!value.trim() && uploads.length === 0)}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              opacity: disabled || (!value.trim() && uploads.length === 0) ? 0.3 : 1,
              transition: "all 150ms",
              flexShrink: 0,
            }}
          >
            <Send style={{ width: "18px", height: "18px" }} />
          </button>
        </div>
      </div>
      <div
        style={{
          maxWidth: "768px",
          margin: "4px auto 0",
          textAlign: "center",
          fontSize: "0.65rem",
          color: "var(--muted-foreground)",
          opacity: 0.6,
        }}
      >
        Press Enter to send, Shift+Enter for new line{dragOver ? " — Drop to upload" : ""}
      </div>
    </div>
  );
}
