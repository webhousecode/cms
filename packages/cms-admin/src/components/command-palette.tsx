"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@/app/api/search/route";
import { Search, FileText, Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Provider: mounts the palette and registers ⌘K ─────────── */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}

/* ─── Palette ────────────────────────────────────────────────── */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Auto-focus input */
  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Search with debounce */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setSelected(0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  /* Keyboard navigation */
  const navigate = useCallback((result: SearchResult) => {
    router.push(`/admin/${result.collection}/${result.slug}`);
    onClose();
  }, [router, onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter" && results[selected]) {
      navigate(results[selected]);
    }
  }, [results, selected, navigate, onClose]);

  /* Scroll selected item into view */
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selected] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  /* Close on backdrop click */
  const onBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={onBackdropClick}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        style={{
          width: "min(640px, 90vw)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "60vh",
        }}
      >
        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", borderBottom: "1px solid var(--border)" }}>
          <Search style={{ width: "1.1rem", height: "1.1rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search items…"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: "1rem", color: "var(--foreground)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.125rem" }}>
              <X style={{ width: "0.875rem", height: "0.875rem" }} />
            </button>
          )}
          <kbd style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "monospace", flexShrink: 0 }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Searching…</div>
          )}
          {!loading && query && results.length === 0 && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
              No results for <strong style={{ color: "var(--foreground)" }}>"{query}"</strong>
            </div>
          )}
          {!loading && !query && (
            <div style={{ padding: "1.25rem 1rem", fontSize: "0.875rem", color: "var(--muted-foreground)" }}>
              Type to search across all collections…
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.collection}/${r.slug}`}
              type="button"
              onClick={() => navigate(r)}
              onMouseEnter={() => setSelected(i)}
              className={cn(
                "w-full text-left flex items-center gap-3 px-4 py-3 transition-colors",
                i === selected ? "bg-accent" : "hover:bg-accent/50"
              )}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {r.status === "published"
                ? <Globe style={{ width: "0.875rem", height: "0.875rem", color: "#4ade80", flexShrink: 0 }} />
                : <FileText style={{ width: "0.875rem", height: "0.875rem", color: "var(--muted-foreground)", flexShrink: 0 }} />
              }
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "0.9rem", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Highlight text={r.title} query={query} />
                </span>
                <span style={{ display: "block", fontSize: "0.7rem", fontFamily: "monospace", color: "var(--muted-foreground)", marginTop: "0.1rem" }}>
                  {r.collectionLabel} · {r.slug}
                </span>
              </span>
              <kbd style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", borderRadius: "4px", border: "1px solid var(--border)", color: "var(--muted-foreground)", fontFamily: "monospace", flexShrink: 0, opacity: i === selected ? 1 : 0 }}>
                ↵
              </kbd>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "0.5rem 1rem", borderTop: "1px solid var(--border)", display: "flex", gap: "1rem", fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>ESC close</span>
          <span style={{ marginLeft: "auto" }}>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Highlight matching characters ─────────────────────────── */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "2px", padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
