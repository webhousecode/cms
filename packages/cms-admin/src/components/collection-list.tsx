"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Copy, Clock, MoreHorizontal, Pencil, Globe, FileX, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type StatusFilter = "all" | "published" | "draft" | "scheduled" | "trashed";
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
  updatedAt: string;
  data: Record<string, unknown>;
}

interface Props {
  collection: string;
  titleField: string;
  fields: FieldConfig[];
  initialDocs: Doc[];
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
  if (isScheduled) return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(251 146 60)", display: "inline-block", flexShrink: 0 }} />;
  if (status === "trashed") return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(239 68 68)", display: "inline-block", flexShrink: 0 }} />;
  return <span style={{ width: "0.45rem", height: "0.45rem", borderRadius: "9999px", background: "rgb(234 179 8)", display: "inline-block", flexShrink: 0 }} />;
}

function RowMenu({ doc, collection, onClone, onToggle, onTrash, cloning }: {
  doc: Doc; collection: string;
  onClone: (e: React.MouseEvent) => void;
  onToggle: (e: React.MouseEvent) => void;
  onTrash: (e: React.MouseEvent) => void;
  cloning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{ padding: "0.25rem", borderRadius: "5px", border: "none", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "flex", alignItems: "center" }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      >
        <MoreHorizontal style={{ width: "0.9rem", height: "0.9rem" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "100%", zIndex: 50, minWidth: "10rem",
          background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", padding: "0.25rem", marginTop: "0.25rem",
        }}>
          <Link
            href={`/admin/${collection}/${doc.slug}`}
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "5px", fontSize: "0.8rem", color: "var(--foreground)", textDecoration: "none" }}
            className="hover:bg-secondary"
          >
            <Pencil style={{ width: "0.8rem", height: "0.8rem" }} /> Edit
          </Link>
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

/* ─── Main component ──────────────────────────────────────────── */

export function CollectionList({ collection, titleField, fields, initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const extraColumns = buildColumns(fields, titleField);

  const counts = {
    published: docs.filter((d) => d.status === "published").length,
    draft: docs.filter((d) => d.status === "draft" && !d.publishAt).length,
    scheduled: docs.filter((d) => d.status === "draft" && !!d.publishAt && new Date(d.publishAt) > new Date()).length,
    trashed: docs.filter((d) => d.status === "trashed").length,
  };

  const allFilterOptions: { value: StatusFilter; label: string; count: number; color: string }[] = [
    { value: "all",       label: "All",       count: docs.filter((d) => d.status !== "trashed").length, color: "var(--muted-foreground)" },
    { value: "published", label: "Published", count: counts.published, color: "rgb(74 222 128)" },
    { value: "draft",     label: "Draft",     count: counts.draft,     color: "rgb(234 179 8)" },
    { value: "scheduled", label: "Scheduled", count: counts.scheduled, color: "rgb(251 146 60)" },
    { value: "trashed",   label: "Trashed",   count: counts.trashed,   color: "rgb(239 68 68)" },
  ];
  const filterOptions = allFilterOptions.filter((f) => f.value === "all" || f.count > 0);

  const filtered = docs
    .filter((doc) => {
      if (statusFilter === "published" && doc.status !== "published") return false;
      if (statusFilter === "draft" && !(doc.status === "draft" && !doc.publishAt)) return false;
      if (statusFilter === "scheduled" && !(doc.status === "draft" && !!doc.publishAt && new Date(doc.publishAt) > new Date())) return false;
      if (statusFilter === "trashed" && doc.status !== "trashed") return false;
      if (statusFilter === "all" && doc.status === "trashed") return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const title = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug).toLowerCase();
        if (!title.includes(q) && !doc.slug.includes(q)) return false;
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

  return (
    <div>
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
      </div>

      {/* Empty state after filter */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
          No items match your filters.
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
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

                return (
                  <tr
                    key={doc.id ?? doc.slug}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", transition: "background 120ms" }}
                    className="hover:bg-secondary/50"
                  >
                    {/* Title */}
                    <td style={{ padding: "0.625rem 0.75rem", maxWidth: "22rem" }}>
                      <Link href={`/admin/${collection}/${doc.slug}`} style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <StatusDot status={doc.status} publishAt={doc.publishAt} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {title}
                            </p>
                            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.slug}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </td>

                    {/* Status */}
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={(e) => toggleStatus(e, doc)} title={doc.status === "published" ? "Click to unpublish" : "Click to publish"} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        {isScheduled ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                            <Clock style={{ width: "0.65rem", height: "0.65rem" }} /> scheduled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={
                            doc.status === "published"
                              ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                              : doc.status === "trashed"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20"
                          }>
                            {doc.status}
                          </Badge>
                        )}
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
                      <RowMenu
                        doc={doc}
                        collection={collection}
                        onClone={(e) => cloneDoc(e, doc)}
                        onToggle={(e) => toggleStatus(e, doc)}
                        onTrash={(e) => trashDoc(e, doc)}
                        cloning={cloningSlug === doc.slug}
                      />
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
