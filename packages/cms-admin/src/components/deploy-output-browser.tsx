/**
 * Visual browser for the active site's `deploy/` output. Drops into the
 * Site Settings → Deploy panel as a new section — gives you direct
 * confirmation that the build produced the bytes you expected.
 *
 * Read-only. Sandboxed to deploy/ — backend rejects path escapes.
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Folder, FileText, Image as ImageIcon, ChevronRight, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";

interface Entry {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
  mtime?: string;
}
interface Stats {
  totalFiles: number;
  totalBytes: number;
  htmlPages: number;
  lastModified?: string;
}

interface DirNode {
  entries: Entry[];
  loading: boolean;
  expanded: boolean;
  error?: string;
}

interface Props {
  siteId: string;
}

const HTML_EXT = /\.(html?|svg)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|ico)$/i;

export function DeployOutputBrowser({ siteId }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rootExists, setRootExists] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<Record<string, DirNode>>({});
  const [selected, setSelected] = useState<Entry | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const fetchDir = useCallback(async (relPath: string): Promise<{ entries: Entry[]; stats?: Stats; deployRootExists?: boolean }> => {
    const r = await fetch(`/api/admin/deploy/output?site=${encodeURIComponent(siteId)}&path=${encodeURIComponent(relPath)}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, [siteId]);

  // Initial load: root + stats
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const root = await fetchDir("");
        if (cancelled) return;
        setStats(root.stats ?? null);
        setRootExists(root.deployRootExists ?? false);
        setTree({ "": { entries: root.entries, loading: false, expanded: true } });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchDir]);

  const toggleDir = useCallback(async (relPath: string) => {
    const node = tree[relPath];
    if (node && node.expanded) {
      setTree((t) => ({ ...t, [relPath]: { ...t[relPath]!, expanded: false } }));
      return;
    }
    if (node && node.entries.length > 0) {
      setTree((t) => ({ ...t, [relPath]: { ...t[relPath]!, expanded: true } }));
      return;
    }
    setTree((t) => ({ ...t, [relPath]: { entries: [], loading: true, expanded: true } }));
    try {
      const data = await fetchDir(relPath);
      setTree((t) => ({ ...t, [relPath]: { entries: data.entries, loading: false, expanded: true } }));
    } catch (e) {
      setTree((t) => ({
        ...t,
        [relPath]: { entries: [], loading: false, expanded: true, error: e instanceof Error ? e.message : "failed" },
      }));
    }
  }, [tree, fetchDir]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setTree({});
    setSelected(null);
    try {
      const root = await fetchDir("");
      setStats(root.stats ?? null);
      setRootExists(root.deployRootExists ?? false);
      setTree({ "": { entries: root.entries, loading: false, expanded: true } });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }, [fetchDir]);

  if (loading && !stats) {
    return <div style={{ color: "var(--muted-foreground)", fontSize: "0.85rem" }}>Loading deploy output…</div>;
  }
  if (error) {
    return <div style={{ color: "var(--destructive)", fontSize: "0.85rem" }}>Browser unavailable: {error}</div>;
  }
  if (!rootExists) {
    return (
      <div style={{ color: "var(--muted-foreground)", fontSize: "0.85rem", padding: "0.75rem", border: "1px dashed var(--border)", borderRadius: "6px" }}>
        No <code>deploy/</code> directory yet. Click <strong>Deploy now</strong> to build the site.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) 1fr", gap: "0.75rem" }}>
      {/* ── Tree ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: 0 }}>
        {stats && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: "0.7rem", color: "var(--muted-foreground)", padding: "0.25rem 0",
          }}>
            <span>
              {stats.totalFiles} files · {stats.htmlPages} HTML · {fmtBytes(stats.totalBytes)}
              {stats.lastModified && ` · ${fmtRel(stats.lastModified)}`}
            </span>
            <button onClick={refresh} title="Refresh"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.15rem 0.4rem",
                background: "transparent", border: "1px solid var(--border)", borderRadius: "4px",
                color: "var(--muted-foreground)", fontSize: "0.65rem", cursor: "pointer" }}>
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
        )}
        <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem", maxHeight: "480px", overflow: "auto", fontSize: "0.8rem" }}>
          <TreeNode
            relPath=""
            tree={tree}
            depth={0}
            onToggle={toggleDir}
            onSelect={setSelected}
            selected={selected}
          />
        </div>
      </div>

      {/* ── Preview ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: 0 }}>
        {!selected ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: "0.8rem", padding: "1rem", border: "1px dashed var(--border)", borderRadius: "6px", textAlign: "center" }}>
            Select a file to preview
          </div>
        ) : (
          <FilePreview key={selected.path} entry={selected} siteId={siteId} iframeRef={previewRef} />
        )}
      </div>
    </div>
  );
}

function TreeNode({ relPath, tree, depth, onToggle, onSelect, selected }: {
  relPath: string;
  tree: Record<string, DirNode>;
  depth: number;
  onToggle: (rel: string) => void;
  onSelect: (entry: Entry) => void;
  selected: Entry | null;
}) {
  const node = tree[relPath];
  if (!node) return null;
  if (node.loading) return <div style={{ paddingLeft: depth * 14, fontSize: "0.7rem", color: "var(--muted-foreground)" }}>Loading…</div>;
  if (node.error) return <div style={{ paddingLeft: depth * 14, fontSize: "0.7rem", color: "var(--destructive)" }}>{node.error}</div>;
  return (
    <>
      {node.entries.map((e) => {
        if (e.type === "directory") {
          const child = tree[e.path];
          const expanded = child?.expanded ?? false;
          return (
            <div key={e.path}>
              <button onClick={() => onToggle(e.path)}
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.15rem 0.25rem",
                  background: "transparent", border: "none", color: "var(--foreground)", cursor: "pointer", width: "100%", textAlign: "left",
                  paddingLeft: depth * 14 + 4 }}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Folder size={12} style={{ color: "var(--muted-foreground)" }} />
                <span>{e.name}</span>
              </button>
              {expanded && <TreeNode relPath={e.path} tree={tree} depth={depth + 1} onToggle={onToggle} onSelect={onSelect} selected={selected} />}
            </div>
          );
        }
        const isSelected = selected?.path === e.path;
        const Icon = IMG_EXT.test(e.name) ? ImageIcon : FileText;
        return (
          <button key={e.path}
            onClick={() => onSelect(e)}
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.15rem 0.25rem",
              background: isSelected ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "transparent",
              border: "none", color: isSelected ? "var(--primary)" : "var(--foreground)",
              cursor: "pointer", width: "100%", textAlign: "left",
              paddingLeft: depth * 14 + 22, fontSize: "0.78rem",
            }}
          >
            <Icon size={12} style={{ color: "var(--muted-foreground)" }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
            {e.size !== undefined && <span style={{ color: "var(--muted-foreground)", fontSize: "0.65rem" }}>{fmtBytes(e.size)}</span>}
          </button>
        );
      })}
    </>
  );
}

function FilePreview({ entry, siteId, iframeRef }: {
  entry: Entry;
  siteId: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const fileUrl = `/api/admin/deploy/output/file?site=${encodeURIComponent(siteId)}&path=${encodeURIComponent(entry.path)}`;
  const isHtml = HTML_EXT.test(entry.name) && !entry.name.endsWith(".svg");
  const isImg = IMG_EXT.test(entry.name);
  const [text, setText] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);

  useEffect(() => {
    if (isHtml || isImg) return;
    let cancelled = false;
    setText(null); setTextErr(null);
    void (async () => {
      try {
        const r = await fetch(fileUrl);
        if (!r.ok) throw new Error(`${r.status}`);
        const t = await r.text();
        if (!cancelled) setText(t);
      } catch (e) {
        if (!cancelled) setTextErr(e instanceof Error ? e.message : "failed");
      }
    })();
    return () => { cancelled = true; };
  }, [isHtml, isImg, fileUrl]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
        <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem" }}>deploy/{entry.path}</code>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: "var(--primary)", textDecoration: "none" }}>
          <ExternalLink size={10} /> Open raw
        </a>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", minHeight: "300px", background: "var(--background)" }}>
        {isHtml && <iframe ref={iframeRef} src={fileUrl} sandbox="allow-same-origin" style={{ width: "100%", height: "480px", border: "none", display: "block" }} title={entry.name} />}
        {isImg && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", minHeight: "300px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt={entry.name} style={{ maxWidth: "100%", maxHeight: "440px", objectFit: "contain" }} />
          </div>
        )}
        {!isHtml && !isImg && (
          <pre style={{ margin: 0, padding: "0.75rem", fontSize: "0.7rem", fontFamily: "var(--font-mono)", overflow: "auto", maxHeight: "480px", whiteSpace: "pre", color: "var(--foreground)" }}>
            {textErr ? `Error: ${textErr}` : text ?? "Loading…"}
          </pre>
        )}
      </div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtRel(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}
