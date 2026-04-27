import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Spinner } from "@/components/Spinner";
import { getServerUrl, getJwt } from "@/lib/prefs";

interface SearchResult {
  collection: string;
  slug: string;
  title: string;
  excerpt: string;
  status: string;
  score: number;
}

interface SearchProps {
  orgId: string;
  siteId: string;
  siteName?: string;
}

export function Search({ orgId, siteId, siteName }: SearchProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    debounceRef.current = setTimeout(() => void doSearch(query), 400);
  }, [query]);

  async function doSearch(q: string) {
    setLoading(true);
    try {
      const [serverUrl, jwt] = await Promise.all([getServerUrl(), getJwt()]);
      if (!serverUrl) return;
      const params = new URLSearchParams({ orgId, siteId, q });
      const res = await fetch(`${serverUrl}/api/mobile/content/search?${params}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
        credentials: "omit",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { results: SearchResult[] };
      setResults(data.results);
      setSearched(true);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }

  function statusColor(s: string) {
    if (s === "published") return "text-green-400";
    if (s === "draft") return "text-white/40";
    if (s === "archived") return "text-yellow-500/60";
    return "text-white/40";
  }

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={() => setLocation(`/site/${orgId}/${siteId}`)} />}
        title="Search"
        subtitle={siteName}
      />

      <div className="px-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2 rounded-xl bg-brand-darkPanel border border-white/10 px-3 py-2.5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-white/40">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all content…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 min-w-0"
          />
          {loading && <Spinner size={16} />}
          {query && !loading && (
            <button type="button" onClick={() => setQuery("")} className="text-white/40 active:text-white">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {results.length > 0 ? (
          <div>
            {results.map((r) => (
              <button
                key={`${r.collection}/${r.slug}`}
                type="button"
                onClick={() => setLocation(`/site/${orgId}/${siteId}/edit/${r.collection}/${r.slug}`)}
                className="flex w-full items-start gap-3 px-4 py-3 border-b border-white/5 text-left active:bg-white/5"
              >
                <div className="mt-0.5 shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 uppercase tracking-wide">
                  {r.collection}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  {r.excerpt && (
                    <p className="text-xs text-white/40 truncate mt-0.5">{r.excerpt}</p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] mt-1 ${statusColor(r.status)}`}>
                  {r.status}
                </span>
              </button>
            ))}
          </div>
        ) : searched && !loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-white/40 text-center">No results for "{query}"</p>
          </div>
        ) : !query ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-white/40 text-center">
              Search across all collections — posts, pages, team members, and more
            </p>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
