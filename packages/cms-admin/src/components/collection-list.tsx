"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Copy, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type StatusFilter = "all" | "published" | "draft" | "scheduled" | "trashed";

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
  initialDocs: Doc[];
}

export function CollectionList({ collection, titleField, initialDocs }: Props) {
  const [docs, setDocs] = useState(initialDocs);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Counts per status (for filter badges)
  const counts = {
    published: docs.filter((d) => d.status === "published").length,
    draft: docs.filter((d) => d.status === "draft" && !d.publishAt).length,
    scheduled: docs.filter((d) => d.status === "draft" && !!d.publishAt && new Date(d.publishAt) > new Date()).length,
    trashed: docs.filter((d) => d.status === "trashed").length,
  };

  const filtered = docs.filter((doc) => {
    // Status filter
    if (statusFilter === "published" && doc.status !== "published") return false;
    if (statusFilter === "draft" && !(doc.status === "draft" && !doc.publishAt)) return false;
    if (statusFilter === "scheduled" && !(doc.status === "draft" && !!doc.publishAt && new Date(doc.publishAt) > new Date())) return false;
    if (statusFilter === "trashed" && doc.status !== "trashed") return false;
    if (statusFilter === "all" && doc.status === "trashed") return false; // hide trashed from "all"
    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      const title = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug).toLowerCase();
      if (!title.includes(q) && !doc.slug.includes(q) && !doc.status.includes(q)) return false;
    }
    return true;
  });

  async function cloneDoc(e: React.MouseEvent, doc: Doc) {
    e.preventDefault();
    e.stopPropagation();
    setCloningSlug(doc.slug);
    await fetch(`/api/cms/${collection}/${doc.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clone" }),
    });
    setCloningSlug(null);
    startTransition(() => router.refresh());
  }

  async function toggleStatus(e: React.MouseEvent, doc: Doc) {
    e.preventDefault();
    e.stopPropagation();
    const next = doc.status === "published" ? "draft" : "published";
    // Optimistic update
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: next } : d));
    await fetch(`/api/cms/${collection}/${doc.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    startTransition(() => router.refresh());
  }

  const allFilterOptions: { value: StatusFilter; label: string; count: number; color: string }[] = [
    { value: "all",       label: "All",       count: docs.filter((d) => d.status !== "trashed").length, color: "var(--muted-foreground)" },
    { value: "published", label: "Published", count: counts.published, color: "rgb(74 222 128)" },
    { value: "draft",     label: "Draft",     count: counts.draft,     color: "rgb(234 179 8)" },
    { value: "scheduled", label: "Scheduled", count: counts.scheduled, color: "rgb(251 146 60)" },
    { value: "trashed",   label: "Trashed",   count: counts.trashed,   color: "rgb(239 68 68)" },
  ];
  const filterOptions = allFilterOptions.filter((f) => f.value === "all" || f.count > 0); // hide empty filters

  return (
    <div>
      {/* Status filter pills */}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.875rem", flexWrap: "wrap" }}>
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.2rem 0.625rem", borderRadius: "9999px", fontSize: "0.75rem",
                fontFamily: "monospace", cursor: "pointer", transition: "all 120ms",
                border: `1px solid ${statusFilter === opt.value ? opt.color : "var(--border)"}`,
                background: statusFilter === opt.value ? `color-mix(in srgb, ${opt.color} 12%, transparent)` : "transparent",
                color: statusFilter === opt.value ? opt.color : "var(--muted-foreground)",
              }}
            >
              {opt.label}
              <span style={{ opacity: 0.7 }}>{opt.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {docs.length > 0 && (
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-shadow"
          />
        </div>
      )}

      {/* List */}
      {filtered.length === 0 && docs.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg mb-2">No items yet</p>
          <p className="text-sm">Create your first item to get started.</p>
        </div>
      )}
      {filtered.length === 0 && docs.length > 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No items match <span className="font-mono">"{search}"</span>
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((doc) => {
          const titleBase = String(doc.data[titleField] ?? doc.data["title"] ?? doc.slug);
          const titleHighlight = doc.data["titleHighlight"] as string | undefined;
          const title = titleHighlight ? `${titleBase} ${titleHighlight}` : titleBase;
          const isPublished = doc.status === "published";
          const isScheduled = !isPublished && !!doc.publishAt && new Date(doc.publishAt) > new Date();

          return (
            <Link
              key={doc.id ?? doc.slug}
              href={`/admin/${collection}/${doc.slug}`}
              className="group flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-secondary transition-all"
            >
              {/* Title + slug */}
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isPublished ? "bg-green-500" : "bg-yellow-500"}`} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {title}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{doc.slug}</p>
                </div>
              </div>

              {/* Status badge (clickable) + clone + date */}
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <button
                  type="button"
                  title="Clone item"
                  onClick={(e) => cloneDoc(e, doc)}
                  disabled={cloningSlug === doc.slug}
                  className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 focus:outline-none"
                >
                  <Copy className={`w-3.5 h-3.5 ${cloningSlug === doc.slug ? "animate-pulse" : ""}`} />
                </button>
                {isScheduled && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1 pointer-events-none">
                    <Clock className="w-3 h-3" />
                    scheduled
                  </Badge>
                )}
                <button
                  type="button"
                  title={isPublished ? "Click to unpublish" : "Click to publish"}
                  onClick={(e) => toggleStatus(e, doc)}
                  className="focus:outline-none"
                >
                  <Badge
                    variant="outline"
                    className={
                      isPublished
                        ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 cursor-pointer transition-colors"
                        : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20 cursor-pointer transition-colors"
                    }
                  >
                    {doc.status}
                  </Badge>
                </button>
                <span className="text-xs text-muted-foreground">
                  {formatDate(doc.updatedAt ?? (doc.data["date"] as string))}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
