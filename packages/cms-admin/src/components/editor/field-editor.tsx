"use client";

import type { FieldConfig } from "@webhouse/cms";
import { X } from "lucide-react";
import { RichTextEditor } from "./rich-text-editor";
import { TagsInput } from "./tags-input";
import { ImageGalleryEditor } from "./image-gallery-editor";
import type { GalleryImage } from "./image-gallery-editor";
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
          background: "var(--background)", cursor: disabled ? "not-allowed" : "pointer",
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
                background: "var(--background)", color: "var(--foreground)",
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
          background: "var(--background)", color: value ? "var(--foreground)" : "var(--muted-foreground)",
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
                background: "var(--background)", color: "var(--foreground)",
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

export function FieldEditor({ field, value, onChange, locked }: Props) {
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
      return <RichTextEditor value={strVal} onChange={onChange} disabled={locked} />;

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

    case "array": {
      // Simple string array (no sub-fields defined) → line-by-line editor
      if (!field.fields) {
        const arrVal = Array.isArray(value) ? (value as unknown[]) : [];
        const strArr = arrVal.map(v => String(v ?? ""));
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
                  <button
                    type="button"
                    onClick={() => onChange(strArr.filter((_, j) => j !== i))}
                    style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
                    className="hover:text-destructive transition-colors"
                  >
                    <X style={{ width: "14px", height: "14px" }} />
                  </button>
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
      // Array of objects → JSON textarea
      const jsonStr = typeof value === "string" ? value : JSON.stringify(value ?? [], null, 2);
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

    case "object": {
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
