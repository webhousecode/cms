"use client";

import type { FieldConfig, BlockConfig } from "@webhouse/cms";
import { X, Upload, Image as ImageIcon, FolderOpen } from "lucide-react";
import { AIMetadataPopover } from "@/components/media/ai-metadata-popover";
import { RichTextEditor } from "./rich-text-editor";
import { TagsInput } from "./tags-input";
import { ImageGalleryEditor } from "./image-gallery-editor";
import { HtmlDocEditor } from "./htmldoc-editor";
import type { GalleryImage } from "./image-gallery-editor";
import { BlocksEditor } from "./blocks-editor";
import { StructuredArrayEditor } from "./structured-array-editor";
import { StructuredObjectEditor } from "./structured-object-editor";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect, useRef } from "react";
import { CustomSelect } from "@/components/ui/custom-select";

interface Props {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  locked?: boolean;
  blocksConfig?: BlockConfig[];
}

function getVideoEmbedSrc(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // YouTube: youtube.com/watch?v=ID or youtu.be/ID
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    // Vimeo: vimeo.com/ID
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    // not a valid URL yet
  }
  return null;
}

/* ─── Relation picker ───────────────────────────────────────── */
type DocOption = { slug: string; label: string };

function useRelationOptions(collection: string, open: boolean) {
  const [options, setOptions] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/cms/${collection}`)
      .then((r) => r.json())
      .then((docs: Array<{ slug: string; data?: Record<string, unknown> }>) => {
        setOptions(docs.map((d) => ({
          slug: d.slug,
          label: String(d.data?.title ?? d.data?.name ?? d.data?.label ?? d.slug),
        })));
      })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [open, collection]);
  return { options, loading };
}

function MultiRelationPicker({ collection, value, onChange, disabled }: {
  collection: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { options, loading } = useRelationOptions(collection, open);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(
    (o) => !value.includes(o.slug) &&
      (!query || o.label.toLowerCase().includes(query.toLowerCase()) || o.slug.toLowerCase().includes(query.toLowerCase()))
  );

  function addSlug(slug: string) {
    onChange([...value, slug]);
    setQuery("");
  }

  function removeSlug(slug: string) {
    onChange(value.filter((s) => s !== slug));
  }

  const labelFor = (slug: string) => options.find(o => o.slug === slug)?.label ?? slug;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* chips + open button */}
      <div
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center",
          padding: "0.4rem 0.6rem", minHeight: "38px",
          borderRadius: "6px", border: `1px solid ${open ? "var(--ring)" : "var(--border)"}`,
          background: "color-mix(in srgb, var(--input) 30%, var(--background))", cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {value.map((slug) => (
          <span
            key={slug}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.25rem",
              padding: "0.1rem 0.5rem", borderRadius: "4px",
              background: "var(--primary)/15", border: "1px solid var(--primary)/30",
              fontSize: "0.75rem", fontFamily: "monospace", color: "var(--foreground)",
            }}
          >
            {labelFor(slug)}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeSlug(slug); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--muted-foreground)" }}
              >
                <X style={{ width: "10px", height: "10px" }} />
              </button>
            )}
          </span>
        ))}
        {value.length === 0 && (
          <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>— none —</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: "0.65rem", opacity: 0.5 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          width: "max(100%, 280px)", overflow: "hidden",
        }}>
          <div style={{ padding: "0.5rem" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{
                width: "100%", padding: "0.35rem 0.6rem",
                borderRadius: "5px", border: "1px solid var(--border)",
                background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)",
                fontSize: "0.8rem",
              }}
            />
          </div>
          <div style={{ maxHeight: "220px", overflowY: "auto" }}>
            {loading && <div style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                {query ? "No results" : "All items already selected"}
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.slug}
                type="button"
                onClick={() => addSlug(opt.slug)}
                style={{
                  width: "100%", textAlign: "left", padding: "0.5rem 1rem",
                  fontSize: "0.875rem", background: "transparent",
                  border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
                }}
                className="hover:bg-accent"
              >
                <span>{opt.label}</span>
                {opt.label !== opt.slug && <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{opt.slug}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RelationPicker({ collection, value, onChange, disabled }: {
  collection: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { options, loading } = useRelationOptions(collection, open);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter(
    (o) => !query || o.label.toLowerCase().includes(query.toLowerCase()) || o.slug.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", minWidth: "200px", maxWidth: "360px" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", textAlign: "left", padding: "0.4rem 0.75rem",
          borderRadius: "6px", border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: value ? "var(--foreground)" : "var(--muted-foreground)",
          fontSize: "0.875rem", cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || "— none —"}
        </span>
        <span style={{ fontSize: "0.65rem", opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          width: "max(100%, 260px)", overflow: "hidden",
        }}>
          <div style={{ padding: "0.5rem" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              style={{
                width: "100%", padding: "0.35rem 0.6rem",
                borderRadius: "5px", border: "1px solid var(--border)",
                background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)",
                fontSize: "0.8rem",
              }}
            />
          </div>
          <div style={{ maxHeight: "220px", overflowY: "auto" }}>
            {loading && <div style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>No results</div>
            )}
            {/* Clear option */}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                style={{ width: "100%", textAlign: "left", padding: "0.5rem 1rem", fontSize: "0.8rem", color: "var(--muted-foreground)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                ✕ Clear
              </button>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.slug}
                type="button"
                onClick={() => { onChange(opt.slug); setOpen(false); setQuery(""); }}
                style={{
                  width: "100%", textAlign: "left", padding: "0.5rem 1rem",
                  fontSize: "0.875rem", background: opt.slug === value ? "var(--accent)" : "transparent",
                  border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
                }}
              >
                <span style={{ fontWeight: opt.slug === value ? 500 : 400 }}>{opt.label}</span>
                {opt.label !== opt.slug && <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{opt.slug}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Fields that are inherently short — render with constrained width
const SHORT_FIELDS = /year|sort|order|count|number|size|index|icon|code|initials|href|slug|accent|rate|score|rank/i;
const MEDIUM_FIELDS = /title|name|label|author|category|role|tag|type|status|read.?time|summary.?icon/i;

function textWidth(fieldName: string): string | undefined {
  if (SHORT_FIELDS.test(fieldName)) return "7rem";
  if (MEDIUM_FIELDS.test(fieldName)) return "24rem";
  return undefined;
}

export function FieldEditor({ field, value, onChange, locked, blocksConfig }: Props) {
  const strVal = String(value ?? "");

  switch (field.type) {
    case "text": {
      const w = textWidth(field.name);
      return (
        <Input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
          style={w ? { width: w } : undefined}
        />
      );
    }

    case "textarea":
      return (
        <Textarea
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
          rows={4}
          className="resize-y min-h-[100px]"
        />
      );

    case "richtext":
      return <RichTextEditor value={strVal} onChange={onChange} disabled={locked} features={field.features} />;

    case "relation":
      if (!field.collection) return <Input type="text" value={strVal} onChange={(e) => onChange(e.target.value)} disabled={locked} />;
      if (field.multiple) {
        const arrVal = Array.isArray(value) ? (value as string[]) : (value ? [String(value)] : []);
        return <MultiRelationPicker collection={field.collection} value={arrVal} onChange={onChange} disabled={locked} />;
      }
      return <RelationPicker collection={field.collection} value={strVal} onChange={onChange} disabled={locked} />;

    case "date":
      return (
        <Input
          type="date"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
          className="w-48"
        />
      );

    case "boolean":
      return (
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <div
            onClick={() => !locked && onChange(!value)}
            className={cn(
              "w-10 h-5 rounded-full transition-colors relative cursor-pointer",
              value ? "bg-primary" : "bg-secondary border border-border",
              locked && "opacity-40 cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                value ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </div>
          <span className="text-sm text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
        </label>
      );

    case "select":
      return (
        <CustomSelect
          options={[
            { value: "", label: "— Select —" },
            ...(field.options ?? []).map((opt) => ({ value: opt.value, label: opt.label })),
          ]}
          value={strVal || ""}
          onChange={onChange}
          disabled={locked}
        />
      );

    case "tags":
      return (
        <TagsInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={locked}
        />
      );

    case "image-gallery":
      return (
        <ImageGalleryEditor
          value={Array.isArray(value) ? (value as GalleryImage[]) : []}
          onChange={onChange}
          disabled={locked}
        />
      );

    case "image": {
      const [imgUploading, setImgUploading] = useState(false);
      const [mediaBrowserOpen, setMediaBrowserOpen] = useState(false);
      const [mediaItems, setMediaItems] = useState<Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>>([]);
      const [mediaLoading, setMediaLoading] = useState(false);
      const [mediaSearch, setMediaSearch] = useState("");
      const imgInputRef = useRef<HTMLInputElement>(null);

      useEffect(() => {
        if (!mediaBrowserOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMediaBrowserOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [mediaBrowserOpen]);

      async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImgUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "images");
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json() as { url: string };
            onChange(data.url);
          }
        } finally {
          setImgUploading(false);
          if (imgInputRef.current) imgInputRef.current.value = "";
        }
      }

      function openMediaBrowser() {
        setMediaBrowserOpen(true);
        setMediaLoading(true);
        setMediaSearch("");
        fetch("/api/media")
          .then((r) => r.json())
          .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>) => {
            setMediaItems(items.filter((item) => item.isImage));
          })
          .catch(() => setMediaItems([]))
          .finally(() => setMediaLoading(false));
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {/* Thumbnail preview */}
          {strVal && (
            <div style={{ position: "relative", width: "fit-content" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={strVal.startsWith("http") ? strVal : strVal.startsWith("/uploads/") ? strVal : `/api/site-file${strVal.startsWith("/") ? "" : "/"}${strVal}`}
                alt={strVal.split("/").pop() ?? "Preview"}
                style={{
                  maxWidth: "200px",
                  maxHeight: "120px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  objectFit: "cover",
                }}
              />
            </div>
          )}
          {/* URL input */}
          <Input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="Image URL"
            className="font-mono text-xs"
          />
          {/* Upload + Browse buttons */}
          {!locked && (
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <label
                title="Upload image"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: imgUploading ? "wait" : "pointer", fontSize: "0.7rem",
                  color: "var(--muted-foreground)", whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImageUpload} disabled={locked || imgUploading} style={{ display: "none" }} />
                <Upload style={{ width: 12, height: 12 }} />
                {imgUploading ? "..." : "Upload"}
              </label>
              <button
                type="button"
                onClick={openMediaBrowser}
                title="Browse Media"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: "pointer", fontSize: "0.7rem", color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <FolderOpen style={{ width: 12, height: 12 }} />
                Browse
              </button>
              {strVal && strVal.includes("/uploads/") && (
                <AIMetadataPopover imageUrl={strVal} />
              )}
            </div>
          )}

          {/* Media browser modal */}
          {mediaBrowserOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.5)",
              }}
              onClick={(e) => { if (e.target === e.currentTarget) setMediaBrowserOpen(false); }}
            >
              <div
                style={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
                  width: "min(640px, 90vw)",
                  maxHeight: "70vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Modal header */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                    <ImageIcon style={{ width: "16px", height: "16px", display: "inline", verticalAlign: "text-bottom", marginRight: "0.4rem" }} />
                    Media Library
                  </span>
                  <button
                    type="button"
                    onClick={() => setMediaBrowserOpen(false)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
                  >
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                {/* Search */}
                <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <input
                    type="text"
                    value={mediaSearch}
                    onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="Search images…"
                    autoFocus
                    style={{
                      width: "100%", padding: "0.35rem 0.5rem",
                      borderRadius: "6px", border: "1px solid var(--border)",
                      background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)",
                      fontSize: "0.8rem", outline: "none",
                    }}
                  />
                </div>
                {/* Modal body */}
                <div style={{ overflowY: "auto", padding: "0.75rem" }}>
                  {mediaLoading && (
                    <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                      Loading media...
                    </div>
                  )}
                  {!mediaLoading && mediaItems.length === 0 && (
                    <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                      No images found in Media library
                    </div>
                  )}
                  {!mediaLoading && mediaItems.length > 0 && (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                      gap: "0.5rem",
                    }}>
                      {mediaItems.filter((item) => !mediaSearch || item.name.toLowerCase().includes(mediaSearch.toLowerCase())).map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onClick={() => {
                            // Store relative path, not full URL (strip previewUrl host)
                            let storedUrl = item.url;
                            try {
                              const u = new URL(item.url);
                              storedUrl = u.pathname;
                            } catch { /* already relative */ }
                            onChange(storedUrl);
                            setMediaBrowserOpen(false);
                          }}
                          style={{
                            background: "none",
                            border: item.url === strVal ? "2px solid var(--primary)" : "1px solid var(--border)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            padding: "0.25rem",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "0.25rem",
                            overflow: "hidden",
                          }}
                          className="hover:border-primary transition-colors"
                          title={item.name}
                        >
                          <img
                            src={item.url}
                            alt={item.name}
                            style={{
                              width: "100%",
                              height: "80px",
                              objectFit: "cover",
                              borderRadius: "4px",
                            }}
                          />
                          <span style={{
                            fontSize: "0.6rem",
                            color: "var(--muted-foreground)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            width: "100%",
                            textAlign: "center",
                          }}>
                            {item.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "video": {
      const embedSrc = getVideoEmbedSrc(strVal);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Input
            type="url"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="YouTube or Vimeo URL"
            className="font-mono text-sm"
          />
          {embedSrc && (
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)" }}>
              <iframe
                src={embedSrc}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video preview"
              />
            </div>
          )}
        </div>
      );
    }

    case "audio": {
      const [audioUploading, setAudioUploading] = useState(false);
      const [audioConfirm, setAudioConfirm] = useState(false);
      const audioConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
      const audioInputRef = useRef<HTMLInputElement>(null);
      const [audioBrowserOpen, setAudioBrowserOpen] = useState(false);
      const [audioItems, setAudioItems] = useState<Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>>([]);
      const [audioLoading, setAudioLoading] = useState(false);
      const [audioSearch, setAudioSearch] = useState("");

      useEffect(() => {
        if (!audioBrowserOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAudioBrowserOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [audioBrowserOpen]);

      async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setAudioUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "audio");
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json() as { url: string };
            onChange(data.url);
          }
        } finally {
          setAudioUploading(false);
          if (audioInputRef.current) audioInputRef.current.value = "";
        }
      }

      function openAudioBrowser() {
        setAudioBrowserOpen(true);
        setAudioLoading(true);
        setAudioSearch("");
        fetch("/api/media")
          .then((r) => r.json())
          .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>) => {
            setAudioItems(items.filter((item) => !item.isImage || item.mediaType?.startsWith("audio")));
          })
          .catch(() => setAudioItems([]))
          .finally(() => setAudioLoading(false));
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {/* Player preview */}
          {strVal && (
            <div style={{ position: "relative" }}>
              <audio controls src={strVal} style={{ width: "100%", borderRadius: "6px" }} preload="metadata" />
              {!locked && (
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "0.25rem" }}>
                  <span style={{ fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {strVal}
                  </span>
                  {audioConfirm ? (
                    <>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                      <button type="button" onClick={() => { if (audioConfirmTimer.current) clearTimeout(audioConfirmTimer.current); setAudioConfirm(false); onChange(""); }}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                      <button type="button" onClick={() => { if (audioConfirmTimer.current) clearTimeout(audioConfirmTimer.current); setAudioConfirm(false); }}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setAudioConfirm(true); audioConfirmTimer.current = setTimeout(() => setAudioConfirm(false), 3000); }}
                      style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1 }} title="Remove audio">×</button>
                  )}
                </div>
              )}
            </div>
          )}
          {/* URL input */}
          <Input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="Audio URL"
            className="font-mono text-xs"
          />
          {/* Upload + Browse buttons */}
          {!locked && (
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <label
                title="Upload audio"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: audioUploading ? "wait" : "pointer", fontSize: "0.7rem",
                  color: "var(--muted-foreground)", whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioUpload} disabled={locked || audioUploading} style={{ display: "none" }} />
                <Upload style={{ width: 12, height: 12 }} />
                {audioUploading ? "..." : "Upload"}
              </label>
              <button
                type="button"
                onClick={openAudioBrowser}
                title="Browse Media"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: "pointer", fontSize: "0.7rem", color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <FolderOpen style={{ width: 12, height: 12 }} />
                Browse
              </button>
            </div>
          )}

          {/* Media browser modal — same as image field */}
          {audioBrowserOpen && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setAudioBrowserOpen(false); }}
            >
              <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", width: "min(640px, 90vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>Media Library</span>
                  <button type="button" onClick={() => setAudioBrowserOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <input type="text" value={audioSearch} onChange={(e) => setAudioSearch(e.target.value)} placeholder="Search media…" autoFocus
                    style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)", fontSize: "0.8rem", outline: "none" }} />
                </div>
                <div style={{ overflowY: "auto", padding: "0.75rem" }}>
                  {audioLoading && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading media...</div>}
                  {!audioLoading && audioItems.length === 0 && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No media found</div>}
                  {!audioLoading && audioItems.filter((item) => !audioSearch || item.name.toLowerCase().includes(audioSearch.toLowerCase())).map((item) => (
                    <button key={item.url} type="button" onClick={() => {
                      let storedUrl = item.url;
                      try { storedUrl = new URL(item.url).pathname; } catch {}
                      onChange(storedUrl);
                      setAudioBrowserOpen(false);
                    }} style={{ width: "100%", textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.8rem", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border)" }} className="hover:bg-accent">
                      <span style={{ fontSize: "1.1rem" }}>🎵</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "interactive": {
      const [intUploading, setIntUploading] = useState(false);
      const intInputRef = useRef<HTMLInputElement>(null);
      const [intBrowserOpen, setIntBrowserOpen] = useState(false);
      const [intItems, setIntItems] = useState<Array<{ id: string; title: string }>>([]);
      const [intLoading, setIntLoading] = useState(false);
      const [intSearch, setIntSearch] = useState("");

      useEffect(() => {
        if (!intBrowserOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIntBrowserOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [intBrowserOpen]);

      async function handleIntUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setIntUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch("/api/interactives", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json() as { id: string };
            onChange(data.id);
          }
        } finally {
          setIntUploading(false);
          if (intInputRef.current) intInputRef.current.value = "";
        }
      }

      function openIntBrowser() {
        setIntBrowserOpen(true);
        setIntLoading(true);
        setIntSearch("");
        fetch("/api/interactives")
          .then((r) => r.json())
          .then((data) => {
            const items = Array.isArray(data) ? data : (data.interactives ?? []);
            setIntItems(items
              .filter((i: Record<string, string>) => i.status !== "trashed")
              .map((i: Record<string, string>) => ({ id: i.id, title: i.name || i.title || i.id })));
          })
          .catch(() => setIntItems([]))
          .finally(() => setIntLoading(false));
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {/* ID input */}
          <Input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="Interactive ID"
            className="font-mono text-xs"
          />
          {/* Upload + Browse buttons */}
          {!locked && (
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <label
                title="Upload interactive (.html)"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: intUploading ? "wait" : "pointer", fontSize: "0.7rem",
                  color: "var(--muted-foreground)", whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <input ref={intInputRef} type="file" accept=".html,.htm,.zip" onChange={handleIntUpload} disabled={locked || intUploading} style={{ display: "none" }} />
                <Upload style={{ width: 12, height: 12 }} />
                {intUploading ? "..." : "Upload"}
              </label>
              <button
                type="button"
                onClick={openIntBrowser}
                title="Browse Interactives"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: "pointer", fontSize: "0.7rem", color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <FolderOpen style={{ width: 12, height: 12 }} />
                Browse
              </button>
            </div>
          )}

          {/* Interactive browser modal */}
          {intBrowserOpen && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setIntBrowserOpen(false); }}
            >
              <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", width: "min(480px, 90vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>Interactives</span>
                  <button type="button" onClick={() => setIntBrowserOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <input type="text" value={intSearch} onChange={(e) => setIntSearch(e.target.value)} placeholder="Search interactives…" autoFocus
                    style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)", fontSize: "0.8rem", outline: "none" }} />
                </div>
                <div style={{ overflowY: "auto", padding: "0.5rem" }}>
                  {intLoading && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading...</div>}
                  {!intLoading && intItems.length === 0 && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No interactives found</div>}
                  {!intLoading && intItems.filter((i) => !intSearch || i.title.toLowerCase().includes(intSearch.toLowerCase()) || i.id.toLowerCase().includes(intSearch.toLowerCase())).map((item) => (
                    <button key={item.id} type="button" onClick={() => { onChange(item.id); setIntBrowserOpen(false); }}
                      style={{ width: "100%", textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.8rem", background: item.id === strVal ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", borderRadius: "4px", marginBottom: "2px" }} className="hover:bg-accent">
                      <span style={{ fontSize: "1rem", color: "#F7BB2E" }}>⚡</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                      <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)" }}>{item.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "file": {
      const [fileUploading, setFileUploading] = useState(false);
      const fileInputRef = useRef<HTMLInputElement>(null);
      const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
      const [fileItems, setFileItems] = useState<Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>>([]);
      const [fileLoading, setFileLoading] = useState(false);
      const [fileSearch, setFileSearch] = useState("");

      useEffect(() => {
        if (!fileBrowserOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFileBrowserOpen(false); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [fileBrowserOpen]);

      async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "files");
        try {
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (res.ok) {
            const data = await res.json() as { url: string };
            onChange(data.url);
          }
        } finally {
          setFileUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      }

      function openFileBrowser() {
        setFileBrowserOpen(true);
        setFileLoading(true);
        setFileSearch("");
        fetch("/api/media")
          .then((r) => r.json())
          .then((items: Array<{ name: string; url: string; isImage: boolean; mediaType?: string }>) => {
            setFileItems(items);
          })
          .catch(() => setFileItems([]))
          .finally(() => setFileLoading(false));
      }

      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {/* URL input */}
          <Input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            disabled={locked}
            placeholder="File URL"
            className="font-mono text-xs"
          />
          {/* Upload + Browse buttons */}
          {!locked && (
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <label
                title="Upload file"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: fileUploading ? "wait" : "pointer", fontSize: "0.7rem",
                  color: "var(--muted-foreground)", whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <input ref={fileInputRef} type="file" onChange={handleFileUpload} disabled={locked || fileUploading} style={{ display: "none" }} />
                <Upload style={{ width: 12, height: 12 }} />
                {fileUploading ? "..." : "Upload"}
              </label>
              <button
                type="button"
                onClick={openFileBrowser}
                title="Browse Media"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.6rem", borderRadius: "6px",
                  border: "1px dashed var(--border)", background: "none",
                  cursor: "pointer", fontSize: "0.7rem", color: "var(--muted-foreground)",
                  whiteSpace: "nowrap",
                }}
                className="hover:border-primary hover:text-primary transition-colors"
              >
                <FolderOpen style={{ width: 12, height: 12 }} />
                Browse
              </button>
            </div>
          )}

          {/* Media browser modal */}
          {fileBrowserOpen && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
              onClick={(e) => { if (e.target === e.currentTarget) setFileBrowserOpen(false); }}
            >
              <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", width: "min(640px, 90vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>Media Library</span>
                  <button type="button" onClick={() => setFileBrowserOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                    <X style={{ width: "16px", height: "16px" }} />
                  </button>
                </div>
                <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                  <input type="text" value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} placeholder="Search media…" autoFocus
                    style={{ width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "color-mix(in srgb, var(--input) 30%, var(--background))", color: "var(--foreground)", fontSize: "0.8rem", outline: "none" }} />
                </div>
                <div style={{ overflowY: "auto", padding: "0.75rem" }}>
                  {fileLoading && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>Loading media...</div>}
                  {!fileLoading && fileItems.length === 0 && <div style={{ padding: "2rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>No media found</div>}
                  {!fileLoading && fileItems.filter((item) => !fileSearch || item.name.toLowerCase().includes(fileSearch.toLowerCase())).map((item) => (
                    <button key={item.url} type="button" onClick={() => {
                      let storedUrl = item.url;
                      try { storedUrl = new URL(item.url).pathname; } catch {}
                      onChange(storedUrl);
                      setFileBrowserOpen(false);
                    }} style={{ width: "100%", textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.8rem", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", borderBottom: "1px solid var(--border)" }} className="hover:bg-accent">
                      <span style={{ fontSize: "1.1rem" }}>{item.isImage ? "🖼" : "📎"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    case "array": {
      // Structured array with field definitions → StructuredArrayEditor
      if (field.fields && field.fields.length > 0) {
        const arrVal = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
        return (
          <StructuredArrayEditor
            field={field}
            value={arrVal}
            onChange={onChange}
            locked={locked}
            blocksConfig={blocksConfig}
          />
        );
      }
      // Simple string array (no sub-fields defined) → line-by-line editor
      // But if items are objects, fall through to JSON textarea
      const arrVal = Array.isArray(value) ? (value as unknown[]) : [];
      const hasObjects = arrVal.some(v => typeof v === "object" && v !== null);
      if (hasObjects) {
        // Object array without schema → JSON textarea
        const jsonStr = typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2);
        return (
          <Textarea
            value={jsonStr}
            onChange={(e) => {
              try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
            }}
            disabled={locked}
            rows={10}
            className="resize-y min-h-[200px] font-mono text-xs"
            spellCheck={false}
          />
        );
      }
      const strArr = arrVal.map(v => String(v ?? ""));
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [arrConfirmIdx, setArrConfirmIdx] = useState<number | null>(null);
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const arrConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {strArr.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <Input
                value={item}
                disabled={locked}
                onChange={(e) => {
                  const next = [...strArr];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const next = [...strArr];
                    next.splice(i + 1, 0, "");
                    onChange(next);
                  }
                  if (e.key === "Backspace" && item === "" && strArr.length > 1) {
                    e.preventDefault();
                    const next = strArr.filter((_, j) => j !== i);
                    onChange(next);
                  }
                }}
                style={{ flex: 1 }}
              />
              {!locked && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                  {arrConfirmIdx === i ? (
                    <>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                      <button type="button" onClick={() => { if (arrConfirmTimer.current) clearTimeout(arrConfirmTimer.current); setArrConfirmIdx(null); onChange(strArr.filter((_, j) => j !== i)); }}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}>Yes</button>
                      <button type="button" onClick={() => { if (arrConfirmTimer.current) clearTimeout(arrConfirmTimer.current); setArrConfirmIdx(null); }}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => {
                      if (!item.trim()) { onChange(strArr.filter((_, j) => j !== i)); return; }
                      if (arrConfirmTimer.current) clearTimeout(arrConfirmTimer.current);
                      setArrConfirmIdx(i);
                      arrConfirmTimer.current = setTimeout(() => setArrConfirmIdx(null), 3000);
                    }} style={{ width: "18px", height: "18px", borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)", fontSize: "0.9rem", lineHeight: 1 }} title="Remove item" className="hover:text-destructive transition-colors">×</button>
                  )}
                </span>
              )}
            </div>
          ))}
          {!locked && (
            <button
              type="button"
              onClick={() => onChange([...strArr, ""])}
              style={{ alignSelf: "flex-start", background: "none", border: "1px dashed var(--border)", borderRadius: "5px", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", padding: "0.25rem 0.75rem", marginTop: "0.1rem" }}
              className="hover:border-primary hover:text-primary transition-colors"
            >
              + Add item
            </button>
          )}
        </div>
      );
    }

    case "blocks": {
      const blocksVal = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      return (
        <BlocksEditor
          field={field}
          value={blocksVal}
          onChange={onChange}
          locked={locked}
          blocksConfig={blocksConfig}
        />
      );
    }

    case "object": {
      if (field.fields && field.fields.length > 0) {
        const objVal = (typeof value === "object" && value !== null && !Array.isArray(value))
          ? (value as Record<string, unknown>) : {};
        return (
          <StructuredObjectEditor
            field={field}
            value={objVal}
            onChange={onChange}
            locked={locked}
            blocksConfig={blocksConfig}
          />
        );
      }
      const jsonStr = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
      return (
        <Textarea
          value={jsonStr}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
          }}
          disabled={locked}
          rows={8}
          className="resize-y min-h-[160px] font-mono text-xs"
          spellCheck={false}
        />
      );
    }

    case "htmldoc":
      return (
        <HtmlDocEditor
          field={field}
          value={strVal}
          onChange={(html) => onChange(html)}
          locked={locked}
        />
      );

    default:
      return (
        <Input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          disabled={locked}
        />
      );
  }
}
