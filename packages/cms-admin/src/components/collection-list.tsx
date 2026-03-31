"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Copy, Clock, MoreHorizontal, Pencil, Globe, FileX, ArrowUpDown, Languages, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { LOCALE_FLAGS } from "@/lib/locale";

export type ViewMode = "list" | "grid";
type StatusFilter = "all" | "published" | "draft" | "scheduled" | "expired" | "trashed";
type SortKey = string;
type SortDir = "asc" | "desc";

interface FieldConfig {
  name: string;
  type: string;
  label?: string;
}

interface Doc {
  id: string;
  slug: string;
  status: string;
  publishAt?: string;
  unpublishAt?: string;
  updatedAt: string;
  data: Record<string, unknown>;
  locale?: string;
  translationOf?: string;
  translationGroup?: string;
}

interface Props {
  collection: string;
  titleField: string;
  fields: FieldConfig[];
  initialDocs: Doc[];
  readOnly?: boolean;
  view?: ViewMode;
  urlPrefix?: string;
  urlPattern?: string;
  localeStrategy?: string;
  defaultLocale?: string;
  siteLocales?: string[];
}

/* ─── Column definitions ─────────────────────────────────────── */

// Fields that should appear as columns (skip title — it's always first, skip richtext/blocks — too large)
const SKIP_COLUMN_TYPES = new Set(["richtext", "blocks", "image", "image-gallery", "video", "object", "htmldoc", "column-slots"]);
// Max extra columns beyond title + status + updated
const MAX_EXTRA_COLUMNS = 4;

function buildColumns(fields: FieldConfig[], titleField: string) {
  const extra = fields
    .filter(f => f.name !== titleField && !SKIP_COLUMN_TYPES.has(f.type))
    .slice(0, MAX_EXTRA_COLUMNS);
  return extra;
}

function renderCellValue(field: FieldConfig, value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === "") {
    return <span style={{ opacity: 0.3, fontSize: "0.8rem" }}>—</span>;
  }

  switch (field.type) {
    case "tags": {
      const tags = Array.isArray(value) ? value as string[] : [];
      if (tags.length === 0) return <span style={{ opacity: 0.3, fontSize: "0.8rem" }}>—</span>;
      return (
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {tags.slice(0, 3).map((t) => (
            <span key={t} style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px", background: "var(--secondary)", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{t}</span>
          ))}
          {tags.length > 3 && <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>+{tags.length - 3}</span>}
        </div>
      );
    }
    case "boolean":
      return <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{value ? "Yes" : "No"}</span>;
    case "date":
      return <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{formatDate(String(value))}</span>;
    case "relation":
      if (Array.isArray(value)) return <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{value.length} items</span>;
      return <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{String(value)}</span>;
    case "array":
      if (Array.isArray(value)) return <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{value.length} items</span>;
      return <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{String(value)}</span>;
    default: {
      const str = String(value);
      return <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: "12rem" }}>{str}</span>;
    }
  }
}

/* ─── Sub-components ──────────────────────────────────────────── */

function StatusDot({ status, publishAt }: { status: string; publishAt?: string }) {
  const isScheduled = status === "draft" && !!publishAt && new Date(publishAt) > new Date();
  if (status === "published") return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(74 222 128)", display: "inline-block", flexShrink: 0 }} />;
  if (isScheduled) return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(139 92 246)", display: "inline-block", flexShrink: 0 }} />;
  if (status === "expired") return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(239 68 68)", display: "inline-block", flexShrink: 0 }} />;
  if (status === "trashed") return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(239 68 68)", display: "inline-block", flexShrink: 0 }} />;
  return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(234 179 8)", display: "inline-block", flexShrink: 0 }} />;
}

function RowMenu({ doc, collection, onClone, onToggle, onTrash, cloning, previewUrl }: {
  doc: Doc; collection: string;
  onClone: (e: React.MouseEvent) => void;
  onToggle: (e: React.MouseEvent) => void;
  onTrash: (e: React.MouseEvent) => void;
  cloning: boolean;
  previewUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function openMenu(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuH = 180; // approx menu height
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow < menuH ? r.top - menuH : r.bottom + 4;
      setPos({ top, left: r.right - 160 }); // 160 ≈ minWidth 10rem
    }
    setOpen(true);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        style={{ padding: "0.25rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--card)", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center" }}
        className="hover:bg-secondary hover:text-foreground"
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <MoreHorizontal style={{ width: "0.9rem", height: "0.9rem" }} />
      </button>
      {open && pos && (
        <div style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, minWidth: "10rem",
          background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", padding: "0.25rem",
        }}>
          <Link
            href={`/admin/${collection}/${doc.slug}`}
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--foreground)", textDecoration: "none" }}
            className="hover:bg-secondary"
          >
            <Pencil style={{ width: "0.8rem", height: "0.8rem" }} /> Edit
          </Link>
          {previewUrl && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(previewUrl, "_blank"); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--foreground)", background: "none", border: "none", cursor: "pointer", width: "100%" }}
              className="hover:bg-secondary"
            >
              <ExternalLink style={{ width: "0.8rem", height: "0.8rem" }} /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { onToggle(e); setOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--foreground)", background: "none", border: "none", cursor: "pointer", width: "100%" }}
            className="hover:bg-secondary"
          >
            <Globe style={{ width: "0.8rem", height: "0.8rem" }} />
            {doc.status === "published" ? "Unpublish" : "Publish"}
          </button>
          <button
            type="button"
            onClick={(e) => { onClone(e); setOpen(false); }}
            disabled={cloning}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--foreground)", background: "none", border: "none", cursor: "pointer", width: "100%", opacity: cloning ? 0.5 : 1 }}
            className="hover:bg-secondary"
          >
            <Copy style={{ width: "0.8rem", height: "0.8rem" }} /> {cloning ? "Cloning…" : "Clone"}
          </button>
          <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />
          <button
            type="button"
            onClick={(e) => {
              if (confirmTrash) {
                onTrash(e);
                setOpen(false);
                setConfirmTrash(false);
              } else {
                setConfirmTrash(true);
                setTimeout(() => setConfirmTrash(false), 3000);
              }
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--destructive)", background: confirmTrash ? "color-mix(in srgb, var(--destructive) 10%, transparent)" : "none", border: "none", cursor: "pointer", width: "100%", fontWeight: confirmTrash ? 600 : 400 }}
            className="hover:bg-destructive/10"
          >
            <FileX style={{ width: "0.8rem", height: "0.8rem" }} /> {confirmTrash ? "OK — click to confirm" : "Move to trash"}
          </button>
        </div>
      )}
    </div>
  );
}

function NoPreviewPlaceholder() {
  return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem",
      background: "var(--muted)", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "var(--muted-foreground)", fontSize: "0.75rem",
    }}>No preview</div>
  );
}

// Cache probe results so we only check each URL once per session
const probeCache = new Map<string, boolean>();

function PreviewThumb({ previewUrl, title }: { previewUrl: string; title: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(
    !previewUrl ? "failed" : probeCache.has(previewUrl) ? (probeCache.get(previewUrl) ? "ok" : "failed") : "loading"
  );

  useEffect(() => {
    if (!previewUrl || probeCache.has(previewUrl)) return;
    // Probe via server-side API to avoid CORS issues
    fetch(`/api/admin/probe-url?url=${encodeURIComponent(previewUrl)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean }) => {
        probeCache.set(previewUrl, d.ok);
        setStatus(d.ok ? "ok" : "failed");
      })
      .catch(() => {
        probeCache.set(previewUrl, false);
        setStatus("failed");
      });
  }, [previewUrl]);

  if (status === "failed") return <NoPreviewPlaceholder />;
  if (status === "loading") return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem",
      background: "var(--muted)", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: "var(--muted-foreground)", fontSize: "0.75rem",
    }} />
  );

  return (
    <div style={{
      width: "100%", flex: 1, minHeight: "8rem", overflow: "hidden",
      background: "var(--muted)", position: "relative",
    }}>
      <iframe
        src={previewUrl}
        title={title}
        sandbox="allow-same-origin allow-scripts"
        loading="lazy"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "1280px", height: "720px", border: "none",
          transform: "scale(var(--thumb-scale, 0.25))", transformOrigin: "top left",
          pointerEvents: "none",
        }}
        ref={(el) => {
          if (el?.parentElement) {
            const w = el.parentElement.clientWidth;
            el.parentElement.style.setProperty("--thumb-scale", String(w / 1280));
          }
        }}
      />
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */

export function CollectionList({ collection, titleField, fields, initialDocs, readOnly, view = "list", urlPrefix, urlPattern, localeStrategy = "prefix-other", defaultLocale, siteLocales }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilterRaw] = useState<StatusFilter>(() => {
    if (typeof window === "undefined") return "all";
    return (localStorage.getItem(`cms-filter-${collection}`) as StatusFilter) || "all";
  });
  const setStatusFilter = (v: StatusFilter) => { setStatusFilterRaw(v); localStorage.setItem(`cms-filter-${collection}`, v); };
  const [localeFilter, setLocaleFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const extraColumns = buildColumns(fields, titleField);

  // Resolve preview base URL for grid view thumbnails
  const [previewBase, setPreviewBase] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("cms-preview-base") ?? "";
  });
  useEffect(() => {
    async function resolve() {
      // 1. FIRST: check previewSiteUrl from site config (Next.js dev server, custom URL)
      try {
        const r = await fetch("/api/admin/site-config");
        if (r.ok) {
          const data = await r.json();
          if (data?.previewSiteUrl) { setPreviewBase(data.previewSiteUrl); sessionStorage.setItem("cms-preview-base", data.previewSiteUrl); return; }
        }
      } catch { /* no config */ }
      // 2. Build with drafts only in grid view (thumbnails need it) — only for static sites
      if (view === "grid") {
        try {
          await fetch("/api/preview-build", { method: "POST" });
        } catch { /* build not available — serve existing dist/ */ }
      }
      // 3. Fall back to sirv (static sites with dist/)
      try {
        const r = await fetch("/api/preview-serve", { method: "POST" });
        if (r.ok) {
          const d = await r.json() as { url?: string };
          if (d?.url) { setPreviewBase(d.url); sessionStorage.setItem("cms-preview-base", d.url); return; }
        }
      } catch { /* sirv not available */ }
    }
    resolve();
  }, [view]);

  const counts = {
    published: docs.filter((d) => d.status === "published").length,
    draft: docs.filter((d) => d.status === "draft" && !d.publishAt).length,
    scheduled: docs.filter((d) => d.status === "draft" && !!d.publishAt && new Date(d.publishAt) > new Date()).length,
    expired: docs.filter((d) => d.status === "expired").length,
    trashed: docs.filter((d) => d.status === "trashed").length,
  };

  const allFilterOptions: { value: StatusFilter; label: string; count: number; color: string }[] = [
    { value: "all",       label: "All",       count: docs.filter((d) => d.status !== "trashed").length, color: "var(--muted-foreground)" },
    { value: "published", label: "Published", count: counts.published, color: "rgb(74 222 128)" },
    { value: "draft",     label: "Draft",     count: counts.draft,     color: "rgb(234 179 8)" },
    { value: "scheduled", label: "Scheduled", count: counts.scheduled, color: "rgb(139 92 246)" },
    { value: "expired",   label: "Expired",   count: counts.expired,   color: "rgb(239 68 68)" },
    { value: "trashed",   label: "Trashed",   count: counts.trashed,   color: "rgb(239 68 68)" },
  ];
  const filterOptions = allFilterOptions.filter((f) => f.value === "all" || f.count > 0);

  const filtered = docs
    .filter((doc) => {
      if (statusFilter === "published" && doc.status !== "published") return false;
      if (statusFilter === "draft" && !(doc.status === "draft" && !doc.publishAt)) return false;
      if (statusFilter === "scheduled" && !(doc.status === "draft" && !!doc.publishAt && new Date(doc.publishAt) > new Date())) return false;
      if (statusFilter === "expired" && doc.status !== "expired") return false;
      if (statusFilter === "trashed" && doc.status !== "trashed") return false;
      if (statusFilter === "all" && (doc.status === "trashed")) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const title = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug).toLowerCase();
        if (!title.includes(q) && !doc.slug.includes(q)) return false;
      }
      // Locale filter
      if (localeFilter !== "all") {
        const docLocale = doc.locale || defaultLocale || "";
        if (localeFilter === "source") {
          // "Source" filter: show docs that are not translations
          // With translationGroup, any doc can be a source (equal partners) — just filter by default locale
          if (doc.translationOf && !doc.translationGroup) return false; // legacy: hide old-style translations
          if (doc.locale && doc.locale !== (defaultLocale || "")) return false; // hide non-default locale docs
        } else if (docLocale !== localeFilter) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "updatedAt") {
        const av = new Date(a.updatedAt).getTime();
        const bv = new Date(b.updatedAt).getTime();
        return sortDir === "asc" ? av - bv : bv - av;
      }
      if (sortKey === "title") {
        const at = String(a.data[titleField] ?? a.slug).toLowerCase();
        const bt = String(b.data[titleField] ?? b.slug).toLowerCase();
        return sortDir === "asc" ? at.localeCompare(bt) : bt.localeCompare(at);
      }
      if (sortKey === "status") {
        return sortDir === "asc" ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
      }
      // Sort by data field
      const av = String(a.data[sortKey] ?? "");
      const bv = String(b.data[sortKey] ?? "");
      // Try numeric sort first
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
      // Date sort
      const ad = Date.parse(av), bd = Date.parse(bv);
      if (!isNaN(ad) && !isNaN(bd)) return sortDir === "asc" ? ad - bd : bd - ad;
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  async function cloneDoc(e: React.MouseEvent, doc: Doc) {
    e.preventDefault(); e.stopPropagation();
    setCloningSlug(doc.slug);
    await fetch(`/api/cms/${collection}/${doc.slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clone" }) });
    setCloningSlug(null);
    startTransition(() => router.refresh());
  }

  async function toggleStatus(e: React.MouseEvent, doc: Doc) {
    e.preventDefault(); e.stopPropagation();
    const next = doc.status === "published" ? "draft" : "published";
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: next } : d));
    await fetch(`/api/cms/${collection}/${doc.slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    startTransition(() => router.refresh());
  }

  async function trashDoc(e: React.MouseEvent, doc: Doc) {
    e.preventDefault(); e.stopPropagation();
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: "trashed" } : d));
    await fetch(`/api/cms/${collection}/${doc.slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "trashed" }) });
    startTransition(() => router.refresh());
  }

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 500,
    color: "var(--muted-foreground)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
    background: "var(--card)",
  };

  function SortTh({ label, sk }: { label: string; sk: SortKey }) {
    const active = sortKey === sk;
    return (
      <th style={thStyle}>
        <button
          type="button"
          onClick={() => toggleSort(sk)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: active ? "var(--foreground)" : "var(--muted-foreground)", fontSize: "0.72rem", fontWeight: active ? 600 : 500, padding: 0 }}
        >
          {label}
          <ArrowUpDown style={{ width: "0.65rem", height: "0.65rem", opacity: active ? 1 : 0.4 }} />
        </button>
      </th>
    );
  }

  if (docs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "5rem 0", color: "var(--muted-foreground)" }}>
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No items yet</p>
        <p style={{ fontSize: "0.875rem" }}>Create your first item to get started.</p>
      </div>
    );
  }

  function docPreviewUrl(doc: Doc): string {
    if (!previewBase) return "";
    const prefix = (urlPrefix ?? `/${collection}`).replace(/\/$/, "");
    const docLocale = (doc as any).locale ?? "";

    // Determine if locale prefix is used
    const usesLocalePrefix =
      (localeStrategy === "prefix-all" && !!docLocale) ||
      (localeStrategy === "prefix-other" && !!docLocale && docLocale !== (defaultLocale ?? "en"));

    // Strip locale suffix from slug when using prefix strategy
    let baseSlug = doc.slug;
    if (usesLocalePrefix && docLocale && docLocale !== (defaultLocale ?? "en")) {
      const suffix = `-${docLocale}`;
      if (baseSlug.endsWith(suffix)) {
        baseSlug = baseSlug.slice(0, -suffix.length);
      }
    }

    const isHomepage = (prefix === "" || prefix === "/") && (baseSlug === "home" || baseSlug === "index");

    let slugPath = baseSlug;
    if (urlPattern) {
      slugPath = urlPattern.replace(/^\//, "").replace(/:([a-zA-Z_]+)/g, (_m, field) => {
        if (field === "slug") return baseSlug;
        const val = doc.data?.[field];
        return typeof val === "string" ? val : "";
      });
    }

    const locPrefix = usesLocalePrefix ? `/${docLocale}` : "";

    // For "none" strategy, use original slug (locale baked in)
    if (localeStrategy === "none") {
      slugPath = doc.slug;
    }

    const pagePath = isHomepage
      ? (locPrefix ? `${locPrefix}/` : "/")
      : `${locPrefix}${prefix}/${slugPath}`;
    return `${previewBase}${pagePath}`;
  }

  return (
    <div data-testid={`collection-list-${collection}`}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1", minWidth: "180px" }}>
          <Search style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", width: "0.8rem", height: "0.8rem", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: "100%", paddingLeft: "2rem", paddingRight: "0.75rem", paddingTop: "0.375rem", paddingBottom: "0.375rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", fontSize: "0.8rem", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: "0.3rem",
                padding: "0.2rem 0.6rem", borderRadius: "9999px", fontSize: "0.75rem",
                fontFamily: "monospace", cursor: "pointer", transition: "all 120ms", whiteSpace: "nowrap",
                border: `1px solid ${statusFilter === opt.value ? opt.color : "var(--border)"}`,
                background: statusFilter === opt.value ? `color-mix(in srgb, ${opt.color} 12%, transparent)` : "transparent",
                color: statusFilter === opt.value ? opt.color : "var(--muted-foreground)",
              }}
            >
              {opt.label} <span style={{ opacity: 0.7 }}>{opt.count}</span>
            </button>
          ))}
        </div>
        {/* Locale filter — only show when site has multiple locales */}
        {siteLocales && siteLocales.length > 1 && (
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
            <Languages style={{ width: "0.8rem", height: "0.8rem", color: "var(--muted-foreground)", marginRight: "0.15rem" }} />
            {[
              { value: "all", label: "All" },
              { value: "source", label: "Source" },
              ...siteLocales.map((l) => ({ value: l, label: `${LOCALE_FLAGS[l] ?? ""} ${l.toUpperCase()}` })),
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLocaleFilter(opt.value)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.2rem",
                  padding: "0.2rem 0.5rem", borderRadius: "9999px", fontSize: "0.7rem",
                  cursor: "pointer", transition: "all 120ms", whiteSpace: "nowrap",
                  border: `1px solid ${localeFilter === opt.value ? "var(--primary)" : "var(--border)"}`,
                  background: localeFilter === opt.value ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "transparent",
                  color: localeFilter === opt.value ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty state after filter */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          No items match your filters.
        </div>
      )}

      {/* Grid view */}
      {filtered.length > 0 && view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gridAutoRows: "minmax(10rem, auto)" }}>
          {filtered.map((doc) => {
            const title = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug);
            const previewUrl = docPreviewUrl(doc);

            return (
              <div
                key={doc.id ?? doc.slug}
                className="group relative rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-200 overflow-hidden"
                style={{ display: "flex", flexDirection: "column" }}
              >
                <Link
                  data-testid={`collection-item-${doc.slug}`}
                  href={`/admin/${collection}/${doc.slug}`}
                  style={{ textDecoration: "none", display: "flex", flexDirection: "column", flex: 1 }}
                >
                  {/* Preview thumbnail */}
                  <PreviewThumb previewUrl={previewUrl} title={title} />
                </Link>
                {/* Title bar with context menu */}
                <div style={{ padding: "0.6rem 0.75rem", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <StatusDot status={doc.status} publishAt={doc.publishAt} />
                    <Link href={`/admin/${collection}/${doc.slug}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: "0.8rem", fontWeight: 500, color: "var(--foreground)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }} className="group-hover:text-primary transition-colors">
                        {title}
                      </p>
                    </Link>
                    {!readOnly && (
                      <RowMenu
                        doc={doc}
                        collection={collection}
                        onClone={(e) => cloneDoc(e, doc)}
                        onToggle={(e) => toggleStatus(e, doc)}
                        onTrash={(e) => trashDoc(e, doc)}
                        cloning={cloningSlug === doc.slug}
                        previewUrl={previewUrl}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table (list view) */}
      {filtered.length > 0 && view === "list" && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
            <thead>
              <tr>
                <SortTh label="Title" sk="title" />
                <SortTh label="Status" sk="status" />
                {extraColumns.map((col) => (
                  <SortTh key={col.name} label={col.label ?? col.name} sk={col.name} />
                ))}
                <SortTh label="Updated" sk="updatedAt" />
                <th style={{ ...thStyle, width: "2.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => {
                const title = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug);
                const isScheduled = doc.status === "draft" && !!doc.publishAt && new Date(doc.publishAt) > new Date();
                const hasExpiry = doc.status === "published" && !!doc.unpublishAt && new Date(doc.unpublishAt) > new Date();

                return (
                  <tr
                    key={doc.id ?? doc.slug}
                    data-testid={`collection-item-${doc.slug}`}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", transition: "background 120ms" }}
                    className="hover:bg-secondary/50"
                  >
                    {/* Title */}
                    <td style={{ padding: "0.625rem 0.75rem", maxWidth: "22rem" }}>
                      <Link href={`/admin/${collection}/${doc.slug}`} style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <StatusDot status={doc.status} publishAt={doc.publishAt} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                              <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {title}
                              </p>
                              {siteLocales && siteLocales.length > 1 && doc.locale && (
                                <span style={{
                                  fontSize: "0.6rem", fontWeight: 600, padding: "0.05rem 0.3rem",
                                  borderRadius: "3px", letterSpacing: "0.03em",
                                  background: doc.translationGroup
                                    ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                                    : "color-mix(in srgb, var(--muted-foreground) 15%, transparent)",
                                  color: doc.translationGroup ? "var(--primary)" : "var(--muted-foreground)",
                                }}>
                                  {doc.locale.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.slug}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={(e) => !readOnly && toggleStatus(e, doc)} title={readOnly ? doc.status : doc.status === "published" ? "Click to unpublish" : "Click to publish"} style={{ background: "none", border: "none", cursor: readOnly ? "default" : "pointer", padding: 0 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          {isScheduled ? (
                            <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/20 gap-1">
                              <Clock style={{ width: "0.65rem", height: "0.65rem" }} /> scheduled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={
                              doc.status === "published"
                                ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                                : doc.status === "expired"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : doc.status === "trashed"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20"
                            }>
                              {doc.status}
                            </Badge>
                          )}
                          {hasExpiry && (
                            <span title={`Expires: ${doc.unpublishAt!.replace("T", " ").slice(0, 16)}`}>
                              <Clock style={{ width: "0.7rem", height: "0.7rem", color: "rgb(239 68 68)" }} />
                            </span>
                          )}
                        </span>
                      </button>
                    </td>

                    {/* Dynamic columns */}
                    {extraColumns.map((col) => (
                      <td key={col.name} style={{ padding: "0.625rem 0.75rem" }}>
                        {renderCellValue(col, doc.data[col.name])}
                      </td>
                    ))}

                    {/* Updated */}
                    <td style={{ padding: "0.625rem 0.75rem", fontSize: "0.75rem", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                      {formatDate(doc.updatedAt)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "0.625rem 0.5rem", textAlign: "right" }}>
                      {!readOnly && (
                        <RowMenu
                          doc={doc}
                          collection={collection}
                          onClone={(e) => cloneDoc(e, doc)}
                          onToggle={(e) => toggleStatus(e, doc)}
                          onTrash={(e) => trashDoc(e, doc)}
                          cloning={cloningSlug === doc.slug}
                          previewUrl={docPreviewUrl(doc)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
