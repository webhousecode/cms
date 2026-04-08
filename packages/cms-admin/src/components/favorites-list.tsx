"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Heart, Search, ArrowUpDown, X, List, LayoutGrid, FileText, Settings2, Wrench, Zap } from "lucide-react";
import { useFavorites } from "@/lib/hooks/use-favorites";
import type { Favorite } from "@/lib/user-state";
import { PreviewThumb } from "@/components/preview-thumb";

type ViewMode = "list" | "grid";
type SortKey = "label" | "type" | "addedAt";
type SortDir = "asc" | "desc";

const TYPE_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  collection: List,
  page: Settings2,
  tool: Wrench,
  interactive: Zap,
};

const TYPE_LABELS: Record<string, string> = {
  document: "Document",
  collection: "Collection",
  page: "Page",
  tool: "Tool",
  interactive: "Interactive",
};

export function FavoritesList() {
  const { favorites, remove } = useFavorites();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("addedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("cms-favorites-view") as ViewMode) || "list";
  });
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [previewBase, setPreviewBase] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("cms-favorites-view", view);
  }, [view]);

  // Fetch site preview base URL once (for grid view thumbnails of document favorites)
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.previewSiteUrl) setPreviewBase(d.previewSiteUrl); })
      .catch(() => {});
  }, []);

  function favPreviewUrl(fav: Favorite): string {
    if (!previewBase || fav.type !== "document") return "";
    // Heuristic: admin path /admin/<collection>/<slug> → preview <base>/<collection>/<slug>
    // Works for the default urlPrefix convention; PreviewThumb falls back gracefully.
    const sitePath = fav.path.replace(/^\/admin/, "") || "/";
    return `${previewBase.replace(/\/$/, "")}${sitePath}`;
  }

  const filtered = favorites
    .filter((f) => {
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return f.label.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av: string, bv: string;
      if (sortKey === "label") { av = a.label; bv = b.label; }
      else if (sortKey === "type") { av = a.type; bv = b.type; }
      else { av = a.addedAt; bv = b.addedAt; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const types = Array.from(new Set(favorites.map((f) => f.type)));
  const typeCounts = types.reduce<Record<string, number>>((acc, t) => {
    acc[t] = favorites.filter((f) => f.type === t).length;
    return acc;
  }, {});

  const thStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 500,
    color: "var(--muted-foreground)", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)",
    background: "var(--card)",
  };

  function SortTh({ label, sk, width }: { label: string; sk: SortKey; width?: string }) {
    const active = sortKey === sk;
    return (
      <th style={{ ...thStyle, width }}>
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

  if (favorites.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "5rem 0", color: "var(--muted-foreground)" }}>
        <Heart style={{ width: 48, height: 48, margin: "0 auto 1rem", opacity: 0.3 }} />
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>No favorites yet</p>
        <p style={{ fontSize: "0.875rem" }}>Click the heart icon on any page or document to add it here.</p>
      </div>
    );
  }

  return (
    <div data-testid="favorites-list">
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: "180px" }}>
          <Search style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", width: "0.85rem", height: "0.85rem", color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search favorites…"
            style={{
              width: "100%", padding: "0.45rem 0.625rem 0.45rem 2rem", borderRadius: "7px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
            }}
          />
        </div>

        {/* Type filter */}
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setTypeFilter("all")}
            style={{
              padding: "0.35rem 0.65rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 500,
              border: "1px solid var(--border)",
              background: typeFilter === "all" ? "var(--primary)" : "transparent",
              color: typeFilter === "all" ? "var(--primary-foreground)" : "var(--muted-foreground)",
              cursor: "pointer",
            }}
          >
            All ({favorites.length})
          </button>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "0.35rem 0.65rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 500,
                border: "1px solid var(--border)",
                background: typeFilter === t ? "var(--primary)" : "transparent",
                color: typeFilter === t ? "var(--primary-foreground)" : "var(--muted-foreground)",
                cursor: "pointer", textTransform: "capitalize",
              }}
            >
              {TYPE_LABELS[t] ?? t} ({typeCounts[t]})
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
          {(["grid", "list"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                padding: "0.25rem 0.5rem", background: view === v ? "var(--accent)" : "transparent",
                border: "none", cursor: "pointer", color: view === v ? "var(--foreground)" : "var(--muted-foreground)",
                display: "flex", alignItems: "center",
              }}
              title={v === "grid" ? "Grid view" : "List view"}
            >
              {v === "grid"
                ? <LayoutGrid style={{ width: "0.875rem", height: "0.875rem" }} />
                : <List style={{ width: "0.875rem", height: "0.875rem" }} />}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
          No favorites match your search.
        </div>
      )}

      {/* List view */}
      {filtered.length > 0 && view === "list" && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr>
                <SortTh label="Title" sk="label" />
                <SortTh label="Type" sk="type" width="8rem" />
                <SortTh label="Added" sk="addedAt" width="10rem" />
                <th style={{ ...thStyle, width: "2.5rem" }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((fav: Favorite, i) => {
                const Icon = TYPE_ICONS[fav.type] ?? FileText;
                return (
                  <tr
                    key={fav.id}
                    style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", transition: "background 120ms" }}
                    className="hover:bg-secondary/50"
                  >
                    <td style={{ padding: "0.625rem 0.75rem", maxWidth: "32rem" }}>
                      <Link href={fav.path} style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <Icon style={{ width: "1rem", height: "1rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                              {fav.label}
                            </p>
                            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                              {fav.path}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap" }}>
                      <span style={{
                        fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: 4,
                        background: "var(--muted)", color: "var(--muted-foreground)",
                        textTransform: "capitalize", fontWeight: 500,
                      }}>
                        {TYPE_LABELS[fav.type] ?? fav.type}
                      </span>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
                      {new Date(fav.addedAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "0.625rem 0.5rem", whiteSpace: "nowrap", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => remove(fav.path)}
                        title="Remove from favorites"
                        style={{
                          background: "none", border: "none", padding: "0.3rem",
                          color: "var(--muted-foreground)", cursor: "pointer",
                          borderRadius: 4, display: "inline-flex", alignItems: "center",
                        }}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X style={{ width: "0.9rem", height: "0.9rem" }} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid view */}
      {filtered.length > 0 && view === "grid" && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "0.875rem",
        }}>
          {filtered.map((fav: Favorite) => {
            const Icon = TYPE_ICONS[fav.type] ?? FileText;
            const previewUrl = favPreviewUrl(fav);
            return (
              <div
                key={fav.id}
                style={{
                  position: "relative",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  transition: "border-color 120ms",
                }}
                className="hover:border-primary/50"
              >
                <Link href={fav.path} style={{ display: "flex", flexDirection: "column", textDecoration: "none", flex: 1 }}>
                  {/* Preview thumb (only for document favorites) */}
                  {previewUrl ? (
                    <PreviewThumb previewUrl={previewUrl} title={fav.label} />
                  ) : (
                    <div style={{
                      width: "100%", minHeight: "8rem", flex: 1,
                      background: "var(--muted)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 10,
                        background: "color-mix(in srgb, #ef4444 12%, transparent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <Icon style={{ width: "1.5rem", height: "1.5rem", color: "#ef4444" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ padding: "0.875rem 1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem" }}>
                      <Icon style={{ width: "0.8rem", height: "0.8rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <span style={{
                        fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: 3,
                        background: "var(--muted)", color: "var(--muted-foreground)",
                        textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.03em",
                      }}>
                        {TYPE_LABELS[fav.type] ?? fav.type}
                      </span>
                    </div>
                    <p style={{
                      fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground)",
                      margin: 0, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {fav.label}
                    </p>
                    <p style={{
                      fontSize: "0.7rem", color: "var(--muted-foreground)",
                      fontFamily: "monospace", margin: "0.35rem 0 0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {fav.path}
                    </p>
                    <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", margin: "0.5rem 0 0" }}>
                      Added {new Date(fav.addedAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short" })}
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(fav.path); }}
                  title="Remove from favorites"
                  style={{
                    position: "absolute", top: "0.5rem", right: "0.5rem",
                    background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 4, padding: "0.25rem",
                    color: "var(--muted-foreground)", cursor: "pointer",
                    display: "flex", alignItems: "center",
                  }}
                  className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                >
                  <X style={{ width: "0.8rem", height: "0.8rem" }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
