import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getDocument, getDocuments, getCollections, saveDocument, deleteDocument, uploadFile } from "@/api/client";
import type { FieldConfig } from "@/api/types";

// ─── Field Editors ───────────────────────────────────

function FieldLabel({ field }: { field: FieldConfig }) {
  return (
    <label className="block text-xs font-medium text-white/50 mb-1.5">
      {field.label}
      {field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function TextField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function TextareaField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <textarea
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        rows={4}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors resize-y"
      />
    </div>
  );
}

function NumberField({ field, value, onChange }: FieldEditorProps) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type="number"
        value={value != null ? String(value) : ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
        placeholder={field.placeholder ?? ""}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function BooleanField({ field, value, onChange }: FieldEditorProps) {
  const checked = !!value;
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-3 active:bg-white/5"
    >
      <span className="text-sm">{field.label}</span>
      <div
        className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
          checked ? "bg-brand-gold" : "bg-white/20"
        }`}
      >
        <div
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}

function DateField({ field, value, onChange }: FieldEditorProps) {
  const raw = (value as string) ?? "";

  const display = raw
    ? new Date(raw + "T00:00:00").toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <div>
      <FieldLabel field={field} />
      {/* Native date input overlaid with opacity-0, display div underneath */}
      <div className="relative w-full min-w-0">
        {/* Visual display */}
        <div className="flex w-full items-center justify-between rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 pointer-events-none">
          <span className={`text-sm ${display ? "text-white" : "text-white/30"}`}>
            {display || "Select date..."}
          </span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/40 shrink-0">
            <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 6.5h12M5.5 2v2M10.5 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {/* Invisible native input on top — tapping it opens the iOS date wheel */}
        <input
          type="date"
          value={raw}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="absolute inset-0 w-full h-full opacity-0"
        />
      </div>
    </div>
  );
}

function SelectField({ field, value, onChange }: FieldEditorProps) {
  const options = field.options ?? [];
  return (
    <div>
      <FieldLabel field={field} />
      <div className="flex flex-wrap gap-2 overflow-hidden">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(selected ? undefined : opt.value)}
              className={`rounded-lg px-3 py-2 text-sm border transition-colors active:scale-95 ${
                selected
                  ? "bg-brand-gold/20 border-brand-gold text-brand-gold"
                  : "bg-brand-darkPanel border-white/10 text-white/70"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TagsField({ field, value, onChange }: FieldEditorProps) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div>
      <FieldLabel field={field} />
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 overflow-hidden mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 px-2.5 py-1 text-xs text-brand-gold"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-brand-gold/60 active:text-red-400"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Input for new tag */}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(input);
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder="Add tag..."
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
      />
    </div>
  );
}

function RichtextField({ field, value, onChange }: FieldEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const text = (value as string) ?? "";

  /** Wrap selection with prefix/suffix, or insert at cursor */
  function wrapSelection(prefix: string, suffix: string = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.slice(start, end);
    const before = text.slice(0, start);
    const after = text.slice(end);

    if (selected) {
      // Wrap selection
      const newText = before + prefix + selected + suffix + after;
      onChange(newText);
      // Restore cursor after React re-renders
      requestAnimationFrame(() => {
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = end + prefix.length;
        ta.focus();
      });
    } else {
      // Insert at cursor
      const placeholder = "text";
      const newText = before + prefix + placeholder + suffix + after;
      onChange(newText);
      requestAnimationFrame(() => {
        ta.selectionStart = start + prefix.length;
        ta.selectionEnd = start + prefix.length + placeholder.length;
        ta.focus();
      });
    }
  }

  /** Insert prefix at start of current line */
  function linePrefix(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    // Find start of current line
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    const before = text.slice(0, lineStart);
    const after = text.slice(lineStart);
    // Check if line already has this prefix
    if (after.startsWith(prefix)) {
      // Remove it (toggle off)
      onChange(before + after.slice(prefix.length));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = pos - prefix.length;
        ta.focus();
      });
    } else {
      onChange(before + prefix + after);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = pos + prefix.length;
        ta.focus();
      });
    }
  }

  const TB = "flex items-center justify-center h-9 w-9 rounded-md text-white/60 active:bg-white/10 active:text-white active:scale-90 transition-all";

  return (
    <div>
      <FieldLabel field={field} />
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 mb-1.5 overflow-x-auto">
        <button type="button" className={TB} onClick={() => wrapSelection("**")} aria-label="Bold">
          <span className="text-sm font-bold">B</span>
        </button>
        <button type="button" className={TB} onClick={() => wrapSelection("*")} aria-label="Italic">
          <span className="text-sm italic">I</span>
        </button>
        <button type="button" className={TB} onClick={() => linePrefix("## ")} aria-label="Heading">
          <span className="text-xs font-bold">H2</span>
        </button>
        <button type="button" className={TB} onClick={() => linePrefix("### ")} aria-label="Heading 3">
          <span className="text-xs font-bold">H3</span>
        </button>
        <button type="button" className={TB} onClick={() => linePrefix("- ")} aria-label="Bullet list">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="3" cy="4" r="1.25" fill="currentColor" />
            <circle cx="3" cy="8" r="1.25" fill="currentColor" />
            <circle cx="3" cy="12" r="1.25" fill="currentColor" />
            <path d="M6.5 4h7M6.5 8h7M6.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={TB} onClick={() => linePrefix("> ")} aria-label="Quote">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4v8M6 6h7M6 10h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={TB} onClick={() => wrapSelection("[", "](url)")} aria-label="Link">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 9.5a3 3 0 004-4.5l-1-1a3 3 0 00-4.24 0l-.76.76a3 3 0 000 4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9.5 6.5a3 3 0 00-4 4.5l1 1a3 3 0 004.24 0l.76-.76a3 3 0 000-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={TB} onClick={() => wrapSelection("`")} aria-label="Code">
          <span className="text-xs font-mono">&lt;/&gt;</span>
        </button>
      </div>
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write in Markdown..."
        rows={10}
        className="w-full min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white font-mono leading-relaxed outline-none focus:border-brand-gold transition-colors resize-y"
      />
    </div>
  );
}

/** Check if a URL is already absolute (http/data/signed) — no client-side resolution needed */
function isAbsoluteUrl(url: string): boolean {
  return !url || url.startsWith("http") || url.startsWith("data:") || url.includes("/api/mobile/uploads");
}

function ImageField({ field, value, onChange }: FieldEditorProps) {
  const rawUrl = (value as string) ?? "";
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Server signs all /uploads/ URLs in the document response — URLs are ready to use
  const url = rawUrl;
  const imageReady = !rawUrl || isAbsoluteUrl(rawUrl);

  async function handleFile(file: File) {
    // Get orgId/siteId from the URL params
    const match = location.pathname.match(/\/site\/([^/]+)\/([^/]+)/);
    if (!match) return;
    setUploading(true);
    try {
      const result = await uploadFile(match[1], match[2], file);
      onChange(result.url);
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
        await handleFile(file);
      }
    } catch {
      // User cancelled or native not available — fall back to file input
      fileRef.current?.click();
    }
  }

  return (
    <div>
      <FieldLabel field={field} />
      {url && imageReady ? (
        <div className="relative rounded-lg overflow-hidden border border-white/10">
          <img src={url} alt="" className="w-full max-h-48 object-cover" />
          <div className="absolute bottom-0 inset-x-0 flex gap-2 p-2 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={pickImage}
              disabled={uploading}
              className="text-xs text-white/80 bg-white/10 backdrop-blur rounded-md px-2.5 py-1.5 active:scale-95"
            >
              {uploading ? "Uploading..." : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-xs text-red-400 bg-white/10 backdrop-blur rounded-md px-2.5 py-1.5 active:scale-95"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickImage}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-brand-darkPanel px-4 py-6 text-sm text-white/40 active:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {uploading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
              Uploading...
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                <circle cx="5.5" cy="6.5" r="1.25" stroke="currentColor" strokeWidth="1" />
                <path d="M2 11l3.5-3 2.5 2 3-3.5L14 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Add image
            </>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface GalleryImage {
  url: string;
  alt: string;
}

function ImageGalleryField({ field, value, onChange }: FieldEditorProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Normalize: legacy plain strings → { url, alt }
  const images: GalleryImage[] = Array.isArray(value)
    ? (value as unknown[]).map((item) =>
        typeof item === "string" ? { url: item, alt: "" } : (item as GalleryImage),
      )
    : [];

  function updateImage(idx: number, patch: Partial<GalleryImage>) {
    const next = [...images];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function removeImage(idx: number) {
    onChange(images.filter((_, i) => i !== idx));
  }

  async function handleFile(file: File) {
    const match = location.pathname.match(/\/site\/([^/]+)\/([^/]+)/);
    if (!match) return;
    setUploading(true);
    try {
      const result = await uploadFile(match[1], match[2], file);
      onChange([...images, { url: result.url, alt: "" }]);
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
        await handleFile(file);
      }
    } catch {
      fileRef.current?.click();
    }
  }

  return (
    <div>
      <FieldLabel field={field} />
      {images.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          {images.map((img, idx) => {
            const displayUrl = img.url;
            return (
            <div key={idx} className="flex gap-2 items-start rounded-lg border border-white/10 p-2 bg-brand-darkPanel">
              <img src={displayUrl} alt={img.alt} className="w-16 h-16 rounded object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={img.alt}
                  onChange={(e) => updateImage(idx, { alt: e.target.value })}
                  placeholder="Alt text..."
                  className="w-full min-w-0 text-xs bg-transparent border-b border-white/10 pb-1 text-white outline-none focus:border-brand-gold"
                />
              </div>
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="text-white/30 active:text-red-400 shrink-0 p-1"
                aria-label="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={pickImage}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-brand-darkPanel px-3 py-3 text-xs text-white/40 active:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {uploading ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
            Uploading...
          </>
        ) : (
          `+ Add image (${images.length})`
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Relation Picker ─────────────────────────────────

function RelationField({ field, value, onChange }: FieldEditorProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<{ slug: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const isMultiple = !!field.multiple;
  const selected = isMultiple
    ? (Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [])
    : value ? [String(value)] : [];

  async function loadOptions() {
    if (!field.collection || options.length > 0) return;
    setLoading(true);
    try {
      const match = location.pathname.match(/\/site\/([^/]+)\/([^/]+)/);
      if (!match) return;
      const result = await getDocuments(match[1], match[2], field.collection);
      setOptions(
        result.documents.map((d) => ({
          slug: d.slug,
          label: (d.data.title as string) || (d.data.name as string) || (d.data.label as string) || d.slug,
        })),
      );
    } catch (err) {
      console.error("Failed to load relation options:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggle(slug: string) {
    if (isMultiple) {
      const arr = selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug];
      onChange(arr);
    } else {
      onChange(selected.includes(slug) ? undefined : slug);
    }
  }

  return (
    <div>
      <FieldLabel field={field} />
      {/* Selected items */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((slug) => (
            <span key={slug} className="flex items-center gap-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 px-2.5 py-1 text-xs text-brand-gold">
              {options.find((o) => o.slug === slug)?.label || slug}
              <button type="button" onClick={() => toggle(slug)} className="text-brand-gold/60 active:text-red-400">×</button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => { setOpen(!open); loadOptions(); }}
        className="w-full rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-left text-white/50 active:bg-white/5 transition-colors"
      >
        {open ? "Close" : `Select from ${field.collection}...`}
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-white/10 bg-brand-darkPanel max-h-48 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-white/30 p-3 text-center">Loading...</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-white/30 p-3 text-center">No documents</p>
          ) : (
            options.map((opt) => {
              const isSelected = selected.includes(opt.slug);
              return (
                <button
                  key={opt.slug}
                  type="button"
                  onClick={() => toggle(opt.slug)}
                  className={`w-full text-left px-3 py-2.5 text-sm border-b border-white/5 last:border-0 active:bg-white/5 ${
                    isSelected ? "text-brand-gold" : "text-white/70"
                  }`}
                >
                  {isSelected && <span className="mr-1.5">✓</span>}
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Array Editor ────────────────────────────────────

function ArrayField({ field, value, onChange }: FieldEditorProps) {
  const rawItems = Array.isArray(value) ? value : [];
  const subFields = field.fields ?? [];
  const isSimple = subFields.length === 0; // Simple string array vs structured object array

  // Simple array: ["a", "b", "c"]
  if (isSimple) {
    const items = rawItems as string[];
    return (
      <div>
        <FieldLabel field={field} />
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={String(item ?? "")}
                onChange={(e) => {
                  const next = [...items];
                  next[idx] = e.target.value;
                  onChange(next);
                }}
                className="flex-1 min-w-0 rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-brand-gold transition-colors"
              />
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="shrink-0 text-white/30 active:text-red-400 p-1"
                aria-label="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="mt-2 w-full rounded-lg border border-dashed border-white/20 bg-brand-darkPanel px-3 py-2.5 text-xs text-white/40 active:bg-white/5 active:scale-[0.98] transition-all"
        >
          + Add item ({items.length})
        </button>
      </div>
    );
  }

  // Structured array: [{ title: "...", url: "..." }, ...]
  const items = rawItems as Record<string, unknown>[];

  function updateItem(idx: number, fieldName: string, val: unknown) {
    const next = [...items];
    next[idx] = { ...next[idx], [fieldName]: val };
    onChange(next);
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-lg border border-white/10 bg-brand-darkPanel p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/30 uppercase">#{idx + 1}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="text-white/30 active:text-red-400 p-0.5"
                aria-label="Remove item"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {subFields.map((sf) => (
              <FieldEditor
                key={sf.name}
                field={sf}
                value={item[sf.name]}
                onChange={(v) => updateItem(idx, sf.name, v)}
              />
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const empty: Record<string, unknown> = {};
          subFields.forEach((f) => { empty[f.name] = undefined; });
          onChange([...items, empty]);
        }}
        className="mt-2 w-full rounded-lg border border-dashed border-white/20 bg-brand-darkPanel px-3 py-2.5 text-xs text-white/40 active:bg-white/5 active:scale-[0.98] transition-all"
      >
        + Add item ({items.length})
      </button>
    </div>
  );
}

// ─── Object Editor ───────────────────────────────────

function ObjectField({ field, value, onChange }: FieldEditorProps) {
  const obj = (typeof value === "object" && value !== null && !Array.isArray(value))
    ? (value as Record<string, unknown>) : {};
  const subFields = field.fields ?? [];

  function updateField(name: string, val: unknown) {
    onChange({ ...obj, [name]: val });
  }

  if (subFields.length === 0) {
    return <UnsupportedField field={field} />;
  }

  return (
    <div>
      <FieldLabel field={field} />
      <div className="rounded-lg border border-white/10 bg-brand-darkPanel p-3 space-y-3">
        {subFields.map((sf) => (
          <FieldEditor
            key={sf.name}
            field={sf}
            value={obj[sf.name]}
            onChange={(v) => updateField(sf.name, v)}
          />
        ))}
      </div>
    </div>
  );
}

function UnsupportedField({ field }: { field: FieldConfig }) {
  return (
    <div className="rounded-lg bg-brand-darkPanel border border-white/10 px-3 py-3">
      <p className="text-xs text-white/30">
        {field.label} — <span className="italic">{field.type}</span> (desktop only)
      </p>
    </div>
  );
}

// ─── Field Editor Dispatch ───────────────────────────

interface FieldEditorProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}

const FIELD_EDITORS: Record<string, React.FC<FieldEditorProps>> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  boolean: BooleanField,
  date: DateField,
  select: SelectField,
  tags: TagsField,
  richtext: RichtextField,
  image: ImageField,
  "image-gallery": ImageGalleryField,
  relation: RelationField,
  array: ArrayField,
  object: ObjectField,
};

function FieldEditor({ field, value, onChange }: FieldEditorProps) {
  const Editor = FIELD_EDITORS[field.type];
  if (!Editor) return <UnsupportedField field={field} />;
  return <Editor field={field} value={value} onChange={onChange} />;
}

// ─── Document Editor Screen ──────────────────────────

export function DocumentEditor() {
  const [, params] = useRoute<{
    orgId: string;
    siteId: string;
    collection: string;
    slug: string;
  }>("/site/:orgId/:siteId/edit/:collection/:slug");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "error" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const collectionsQuery = useQuery({
    queryKey: ["collections", params?.orgId, params?.siteId],
    queryFn: () => getCollections(params!.orgId, params!.siteId),
    enabled: !!params,
  });

  const docQuery = useQuery({
    queryKey: ["document", params?.orgId, params?.siteId, params?.collection, params?.slug],
    queryFn: () => getDocument(params!.orgId, params!.siteId, params!.collection, params!.slug),
    enabled: !!params,
  });

  const colConfig = collectionsQuery.data?.collections.find(
    (c) => c.name === params?.collection,
  );

  // Initialize form data from loaded document
  useEffect(() => {
    if (docQuery.data && !formData) {
      setFormData({ ...docQuery.data.data });
    }
  }, [docQuery.data, formData]);

  // Filter out internal fields
  const editableFields = useMemo(() => {
    if (!colConfig) return [];
    return colConfig.fields.filter((f) => !f.name.startsWith("_"));
  }, [colConfig]);

  const goBack = useCallback(() => {
    setLocation(
      `/site/${params?.orgId}/${params?.siteId}/collections/${params?.collection}`,
    );
  }, [setLocation, params]);

  function updateField(name: string, value: unknown) {
    setFormData((prev) => (prev ? { ...prev, [name]: value } : prev));
    setDirty(true);
    setSaveResult(null);
  }

  async function handleSave(newStatus?: string) {
    if (!params || !formData || saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      await saveDocument(params.orgId, params.siteId, params.collection, params.slug, {
        data: formData,
        ...(newStatus ? { status: newStatus } : {}),
      });
      setDirty(false);
      setSaveResult("ok");
      // Invalidate queries so lists update
      await queryClient.invalidateQueries({
        queryKey: ["documents", params.orgId, params.siteId, params.collection],
      });
      await queryClient.invalidateQueries({
        queryKey: ["document", params.orgId, params.siteId, params.collection, params.slug],
      });
      // Clear save feedback after 2s
      setTimeout(() => setSaveResult(null), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveResult("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!params || deleting) return;
    setDeleting(true);
    try {
      await deleteDocument(params.orgId, params.siteId, params.collection, params.slug);
      await queryClient.invalidateQueries({
        queryKey: ["documents", params.orgId, params.siteId, params.collection],
      });
      await queryClient.invalidateQueries({
        queryKey: ["collections", params.orgId, params.siteId],
      });
      goBack();
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (!params) {
    setLocation("/home");
    return null;
  }

  const isLoading = docQuery.isLoading || collectionsQuery.isLoading;
  const doc = docQuery.data;
  const currentStatus = doc?.status ?? "draft";

  if (isLoading || !formData) {
    return (
      <Screen>
        <ScreenHeader left={<BackButton onClick={goBack} />} title="Loading..." subtitle={colConfig?.label} />
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      </Screen>
    );
  }

  const title = (formData.title as string) || (formData.name as string) || params.slug;

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title={title}
        subtitle={colConfig?.label ?? params.collection}
        right={
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            currentStatus === "published" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {currentStatus}
          </span>
        }
      />

      <div className="flex-1 flex flex-col gap-4 px-6 pb-6 overflow-y-auto" style={{ overflowX: "hidden" }}>
        {/* Field editors */}
        {editableFields.map((field) => (
          <FieldEditor
            key={field.name}
            field={field}
            value={formData[field.name]}
            onChange={(v) => updateField(field.name, v)}
          />
        ))}

        {/* Spacer before sticky actions */}
        <div className="h-2" />
      </div>

      {/* Bottom action bar — sticky */}
      <div className="shrink-0 border-t border-white/10 bg-brand-dark px-6 py-3 safe-bottom">
        <div className="flex items-center gap-2">
          {/* Save */}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving || !dirty}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition-all active:scale-95 ${
              saveResult === "ok"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : saveResult === "error"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : dirty
                    ? "bg-brand-gold text-brand-dark"
                    : "bg-white/10 text-white/40"
            }`}
          >
            {saving ? "Saving..." : saveResult === "ok" ? "Saved" : saveResult === "error" ? "Failed" : "Save"}
          </button>

          {/* Publish / Unpublish */}
          {currentStatus === "draft" ? (
            <button
              type="button"
              onClick={() => handleSave("published")}
              disabled={saving}
              className="rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white active:scale-95 transition-transform disabled:opacity-50"
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving}
              className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium text-white/70 active:scale-95 transition-transform disabled:opacity-50"
            >
              Unpublish
            </button>
          )}

          {/* Delete */}
          {confirmDelete ? (
            <span className="flex items-center gap-1 shrink-0">
              <span style={{ fontSize: "0.65rem", color: "var(--destructive, #ef4444)", fontWeight: 500, padding: "0 2px" }}>
                Remove?
              </span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "none", background: "var(--destructive, #ef4444)", color: "#fff",
                  cursor: "pointer", lineHeight: 1, opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? "..." : "Yes"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
                  color: "#fff", cursor: "pointer", lineHeight: 1,
                }}
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="rounded-xl bg-white/5 p-3 text-white/40 active:scale-95 active:text-red-400 transition-all"
              aria-label="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}
