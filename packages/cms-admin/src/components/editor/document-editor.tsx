"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { useRouter } from "next/navigation";
import type { CollectionConfig, BlockConfig } from "@webhouse/cms";
import { FieldEditor } from "./field-editor";
import { Save, Globe, FileText, Trash2, ArrowLeft, Lock, LockOpen, Copy, Clock, History, Eye, Languages, Sparkles, Settings2, Wand2, ChevronDown, ChevronRight, Loader2, Search as SearchIcon } from "lucide-react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { formatDate, cn, previewPath } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTabs } from "@/lib/tabs-context";
import { AIPanel } from "./ai-panel";
import { SeoPanel } from "./seo-panel";
import { GenerateDocumentDialog } from "@/components/generate-document-dialog";
import { isTranslationStale, LOCALE_LABELS } from "@/lib/locale";

/** Minimal markdown→HTML converter for side-by-side source pane (no external deps) */
function miniMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;margin:0.5rem 0" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--primary);text-decoration:underline">$1</a>')
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/^(?!<[h|p|i|a|u|o|d])/, "<p>")
    .concat("</p>")
    .replace(/<p><\/p>/g, "");
}

// Fallback to env vars for backwards compatibility — overridden by props from server
const PREVIEW_SITE_URL_DEFAULT = process.env.NEXT_PUBLIC_PREVIEW_SITE_URL ?? "";
const PREVIEW_IN_IFRAME_DEFAULT = process.env.NEXT_PUBLIC_PREVIEW_IN_IFRAME === "true";

/* ─── Custom confirm dialog ────────────────────────────────── */
function ConfirmDialog({ message, confirmLabel = "Delete", onConfirm, onCancel }: {
  message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "10px", padding: "1.5rem", minWidth: "320px", maxWidth: "420px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column", gap: "1.25rem",
      }}>
        <p style={{ fontSize: "0.9rem", color: "var(--foreground)", margin: 0 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" onClick={onCancel} style={{
            padding: "0.4rem 0.875rem", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer",
          }}>Cancel</button>
          <button type="button" onClick={onConfirm} style={{
            padding: "0.4rem 0.875rem", borderRadius: "6px",
            border: "none", background: "var(--destructive)",
            color: "#fff", fontSize: "0.8rem", cursor: "pointer",
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible richtext field (TEXT badge, like blocks) ──── */
function RichtextCollapsible({ field, value, onChange, locked, blocksConfig, defaultOpen, storageKey, collection, slug, fieldMeta, onToggleLock }: {
  field: import("@webhouse/cms").FieldConfig;
  value: unknown;
  onChange: (val: unknown) => void;
  locked: boolean;
  blocksConfig: import("@webhouse/cms").BlockConfig[];
  defaultOpen: boolean;
  storageKey: string;
  collection: string;
  slug: string;
  fieldMeta?: Record<string, unknown>;
  onToggleLock: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Load persisted state after hydration
  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s !== null) setOpen(s === "1");
    } catch {}
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch {}
  }

  // Preview text for collapsed state
  const strVal = String(value ?? "");
  const preview = strVal.replace(/[#*_`>\[\]!]/g, "").trim();
  const previewShort = preview.length > 80 ? preview.slice(0, 80) + "…" : preview;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--card)" }}>
      {/* Header */}
      <div
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 0.75rem", cursor: "pointer", userSelect: "none",
          background: open ? "var(--accent)" : "transparent",
          borderRadius: open ? "7px 7px 0 0" : "7px",
        }}
      >
        {open ? <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} /> : <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />}
        <span style={{
          fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase",
          letterSpacing: "0.05em", padding: "0.1rem 0.4rem", borderRadius: "4px",
          background: "var(--primary)", color: "var(--primary-foreground)", flexShrink: 0,
        }}>Text</span>
        <span style={{ flex: 1, fontSize: "0.85rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {open ? (field.label ?? field.name) : (previewShort || (field.label ?? field.name))}
        </span>
        {/* Lock button */}
        <span onClick={(e) => { e.stopPropagation(); onToggleLock(); }} style={{
          display: "flex", alignItems: "center", gap: "0.2rem",
          fontSize: "0.65rem", color: locked ? "var(--primary)" : "var(--muted-foreground)",
          opacity: locked ? 1 : 0.45, cursor: "pointer", fontFamily: "monospace",
        }}>
          {locked
            ? <><Lock style={{ width: "0.7rem", height: "0.7rem" }} /> Lock</>
            : <><LockOpen style={{ width: "0.7rem", height: "0.7rem" }} /> Lock</>
          }
        </span>
      </div>
      {/* Body */}
      {open && (
        <div style={{ padding: "0.75rem", borderTop: "1px solid var(--border)" }}>
          <FieldEditor
            field={field}
            value={value}
            onChange={onChange}
            locked={locked}
            blocksConfig={blocksConfig}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Create Translation dialog ────────────────────────────── */
function CreateTranslationDialog({
  collection, originalSlug, locales, existingLocales, defaultLocale,
  onClose, onCreated,
}: {
  collection: string;
  originalSlug: string;
  locales: string[];
  existingLocales: (string | null)[];
  defaultLocale: string;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const availableLocales = locales.filter(l => !existingLocales.includes(l));
  const [targetLocale, setTargetLocale] = useState(availableLocales[0] ?? locales[0] ?? "");
  const [newSlug, setNewSlug] = useState(`${originalSlug}-${availableLocales[0] ?? locales[0] ?? "xx"}`);
  const [creating, setCreating] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleLocaleChange = (l: string) => {
    setTargetLocale(l);
    setNewSlug(`${originalSlug}-${l || "xx"}`);
  };

  async function create() {
    if (!newSlug.trim()) { setError("Slug is required"); return; }
    setCreating(true);
    setError("");

    if (useAi) {
      // AI-powered translation: call the translate endpoint
      const res = await fetch(`/api/cms/${collection}/${originalSlug}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLocale }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Translation failed" }));
        setError(body.error ?? "AI translation failed");
        setCreating(false);
        return;
      }
      const result = await res.json();
      setCreating(false);
      onCreated(result.slug);
      return;
    }

    // Manual: create empty doc + set locale/translationOf
    const res = await fetch(`/api/cms/${collection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: newSlug.trim(),
        data: {},
      }),
    });
    if (!res.ok) {
      setError("Failed to create — slug may already exist");
      setCreating(false);
      return;
    }
    const created = await res.json();
    // Set locale + translationOf on the new doc
    await fetch(`/api/cms/${collection}/${created.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {},
        locale: targetLocale,
        translationOf: originalSlug,
      }),
    });
    setCreating(false);
    onCreated(created.slug);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.5rem", minWidth: "360px", maxWidth: "460px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3 style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>Add translation</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.7rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>Target locale</label>
          <CustomSelect
            options={availableLocales.map(l => ({ value: l, label: l.toUpperCase() }))}
            value={targetLocale}
            onChange={handleLocaleChange}
            style={{ width: "100%" }}
          />
        </div>

        {!useAi && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.7rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)" }}>Slug for translation</label>
            <input
              type="text"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value)}
              style={{ padding: "0.4rem 0.625rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.85rem", fontFamily: "monospace", outline: "none" }}
            />
            <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0 }}>
              translationOf: <code style={{ fontSize: "0.7rem" }}>{originalSlug}</code>
            </p>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={useAi}
            onChange={e => setUseAi(e.target.checked)}
            style={{ width: "14px", height: "14px", accentColor: "var(--primary)", cursor: "pointer" }}
          />
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", color: "var(--foreground)" }}>
            <Sparkles size={13} style={{ color: "rgb(234 179 8)" }} />
            Translate with AI
          </span>
        </label>
        {useAi && (
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "-0.5rem 0 0 1.5rem" }}>
            AI will translate all text fields from the source document into {LOCALE_LABELS[targetLocale] ?? targetLocale}.
          </p>
        )}

        {error && <p style={{ fontSize: "0.75rem", color: "var(--destructive)", margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" onClick={onClose} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={create} disabled={creating} style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.8rem", cursor: creating ? "wait" : "pointer" }}>
            {creating ? (useAi ? "Translating…" : "Creating…") : (useAi ? "Translate & create" : "Create translation")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Schedule button ──────────────────────────────────────── */
function ScheduleButton({ publishAt, onSchedule, label = "Scheduled", defaultLabel = "Schedule", popoverLabel = "Auto-publish at", color = "rgb(234 179 8)" }: {
  publishAt?: string;
  onSchedule: (iso: string | undefined) => void;
  label?: string;
  defaultLabel?: string;
  popoverLabel?: string;
  color?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => {
    if (!publishAt) return "";
    // datetime-local expects "YYYY-MM-DDTHH:MM" — stored as-is, no timezone conversion
    return publishAt.slice(0, 16);
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const isScheduled = (() => {
    if (!publishAt) return false;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return publishAt > localNow;
  })();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={isScheduled ? `${label}: ${publishAt!.replace("T", " ")}` : defaultLabel}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: "28px", height: "28px", borderRadius: "6px",
          border: `1px solid ${isScheduled ? `color-mix(in srgb, ${color} 40%, transparent)` : "transparent"}`,
          background: isScheduled ? `color-mix(in srgb, ${color} 8%, transparent)` : "transparent",
          color: isScheduled ? color : "var(--muted-foreground)",
          cursor: "pointer",
        }}
      >
        <Clock style={{ width: "0.9rem", height: "0.9rem" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          padding: "0.75rem", minWidth: "220px", display: "flex", flexDirection: "column", gap: "0.5rem",
        }}>
          <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {popoverLabel}
          </p>
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{
              padding: "0.35rem 0.5rem", borderRadius: "5px",
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.8rem", width: "100%",
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => {
                onSchedule(value ? value + ":00" : undefined);
                setOpen(false);
              }}
              style={{ flex: 1, padding: "0.35rem", borderRadius: "5px", border: "1px solid var(--border)", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.8rem", cursor: "pointer" }}
            >
              Set
            </button>
            {publishAt && (
              <button
                type="button"
                onClick={() => { onSchedule(undefined); setValue(""); setOpen(false); }}
                style={{ padding: "0.35rem 0.625rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.8rem", cursor: "pointer" }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Revision history panel ───────────────────────────────── */
type Revision = { savedAt: string; status: string; data: Record<string, unknown> };

function wordDiff(oldText: string, newText: string): Array<{ text: string; type: "same" | "added" | "removed" }> {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result: Array<{ text: string; type: "same" | "added" | "removed" }> = [];

  // Simple LCS-based diff — good enough for small field values
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldWords[i] === newWords[j]) dp[i]![j] = 1 + (dp[i + 1]?.[j + 1] ?? 0);
      else dp[i]![j] = Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
    }
  }
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldWords[i] === newWords[j]) {
      result.push({ text: oldWords[i]!, type: "same" });
      i++; j++;
    } else if (j < n && (i >= m || (dp[i]?.[j + 1] ?? 0) >= (dp[i + 1]?.[j] ?? 0))) {
      result.push({ text: newWords[j]!, type: "added" });
      j++;
    } else {
      result.push({ text: oldWords[i]!, type: "removed" });
      i++;
    }
  }
  return result;
}

function FieldDiff({ fieldName, oldVal, newVal }: { fieldName: string; oldVal: unknown; newVal: unknown }) {
  const oldStr = typeof oldVal === "string" ? oldVal : JSON.stringify(oldVal ?? "");
  const newStr = typeof newVal === "string" ? newVal : JSON.stringify(newVal ?? "");
  if (oldStr === newStr) return null;

  const isTextual = typeof oldVal === "string" || typeof newVal === "string";
  const isLong = oldStr.length > 200 || newStr.length > 200;

  return (
    <div style={{ marginTop: "0.5rem", padding: "0.5rem", borderRadius: "6px", background: "var(--background)", border: "1px solid var(--border)" }}>
      <p style={{ fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", margin: "0 0 0.35rem" }}>{fieldName}</p>
      {isTextual && !isLong ? (
        <p style={{ fontSize: "0.75rem", lineHeight: 1.5, margin: 0, wordBreak: "break-word" }}>
          {wordDiff(oldStr, newStr).map((part, i) => (
            <span key={i} style={{
              backgroundColor: part.type === "added" ? "rgba(74,222,128,0.15)" : part.type === "removed" ? "rgba(248,113,113,0.15)" : "transparent",
              color: part.type === "added" ? "rgb(74,222,128)" : part.type === "removed" ? "rgb(248,113,113)" : "var(--foreground)",
              textDecoration: part.type === "removed" ? "line-through" : "none",
            }}>{part.text}</span>
          ))}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {oldVal !== undefined && oldVal !== null && oldVal !== "" && (
            <p style={{ fontSize: "0.72rem", color: "rgb(248,113,113)", textDecoration: "line-through", margin: 0, wordBreak: "break-word", lineHeight: 1.4, maxHeight: "3.5rem", overflow: "hidden" }}>
              {oldStr.slice(0, 200)}{oldStr.length > 200 ? "…" : ""}
            </p>
          )}
          {newVal !== undefined && newVal !== null && newVal !== "" && (
            <p style={{ fontSize: "0.72rem", color: "rgb(74,222,128)", margin: 0, wordBreak: "break-word", lineHeight: 1.4, maxHeight: "3.5rem", overflow: "hidden" }}>
              {newStr.slice(0, 200)}{newStr.length > 200 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionPanel({ collection, slug, currentData, onRestore, onClose }: {
  collection: string;
  slug: string;
  currentData: Record<string, unknown>;
  onRestore: (doc: unknown) => void;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/cms/${collection}/${slug}/revisions`)
      .then((r) => r.json())
      .then((data) => { setRevisions(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [collection, slug]);

  async function restore(idx: number) {
    setRestoring(idx);
    const res = await fetch(`/api/cms/${collection}/${slug}/revisions/${idx}`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      onRestore(updated);
    }
    setRestoring(null);
  }

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "380px", zIndex: 100,
      background: "var(--card)", borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Revision history</span>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
        {loading && <p style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</p>}
        {!loading && revisions.length === 0 && (
          <p style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>No revisions yet. They are saved on each update.</p>
        )}
        {revisions.map((rev, idx) => {
          const isOpen = expanded === idx;
          // Compare with current doc (idx=0) or previous revision
          const compareAgainst = idx === 0 ? currentData : (revisions[idx - 1]?.data ?? {});
          const changedFields = Object.keys({ ...rev.data, ...compareAgainst }).filter((k) => {
            if (k === "_fieldMeta") return false;
            return JSON.stringify(rev.data[k]) !== JSON.stringify(compareAgainst[k]);
          });
          return (
            <div key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--foreground)" }}>
                    {new Date(rev.savedAt).toLocaleString()}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                    {rev.status} · {changedFields.length} changed field{changedFields.length !== 1 ? "s" : ""}
                  </p>
                  {changedFields.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : idx)}
                      style={{ fontSize: "0.65rem", color: "var(--primary)", background: "transparent", border: "none", cursor: "pointer", padding: 0, marginTop: "0.2rem" }}
                    >
                      {isOpen ? "Hide diff" : "Show diff"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => restore(idx)}
                  disabled={restoring === idx}
                  style={{
                    fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: "4px",
                    border: "1px solid var(--border)", cursor: restoring === idx ? "wait" : "pointer",
                    background: "transparent", color: "var(--foreground)", whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {restoring === idx ? "…" : "Restore"}
                </button>
              </div>
              {isOpen && changedFields.length > 0 && (
                <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {changedFields.map((field) => (
                    <FieldDiff
                      key={field}
                      fieldName={field}
                      oldVal={compareAgainst[field]}
                      newVal={rev.data[field]}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Properties panel ─────────────────────────────────────── */
/** Check if a slug looks auto-generated (numeric ID, UUID, filename hash, etc.) */
function isAutoSlug(s: string): boolean {
  // Pure numbers or numbers with hyphens (e.g. "10828042-10205557498204127-...")
  if (/^\d[\d-]*$/.test(s)) return true;
  // UUID-like
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)) return true;
  // Very long slug (>40 chars) with mostly numbers — likely a filename hash
  if (s.length > 40 && (s.match(/\d/g)?.length ?? 0) > s.length * 0.5) return true;
  return false;
}

function slugifyTitle(title: string): string {
  return title.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function PropertiesPanel({ doc, collection, onClose, onSaved }: {
  doc: DocSnapshot;
  collection: string;
  onClose: () => void;
  onSaved: (updated: DocSnapshot) => void;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(doc.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function sanitizeSlug(value: string) {
    return value.trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function validateSlug(value: string): string {
    if (!value.trim()) return "Slug cannot be empty";
    if (/[A-Z]/.test(value)) return "Slug must be lowercase";
    if (/\s/.test(value)) return "Slug cannot contain spaces";
    if (/[^a-z0-9-]/.test(value)) return "Only letters a–z, numbers and hyphens allowed";
    if (/^-|-$/.test(value)) return "Slug cannot start or end with a hyphen";
    if (/--/.test(value)) return "Slug cannot contain consecutive hyphens";
    return "";
  }

  const slugChanged = slug !== doc.slug;
  const slugError = validateSlug(slug);

  async function saveSlug() {
    if (!slugChanged || slugError) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/cms/${collection}/${doc.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.ok) {
      const updated = await res.json() as DocSnapshot;
      onSaved(updated);
      router.replace(`/admin/${collection}/${slug}`);
      router.refresh();
      // Trigger rebuild for static sites after slug rename
      fetch("/api/preview-build", { method: "POST" }).catch(() => {});
    } else {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? "Failed to save");
    }
    setSaving(false);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: "0.8rem", fontFamily: "monospace", color: "var(--foreground)",
  };

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "340px", zIndex: 100,
      background: "var(--card)", borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Properties</span>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* ID */}
        <div>
          <p style={labelStyle}>ID</p>
          <p
            style={{ ...valueStyle, color: "var(--muted-foreground)", fontSize: "0.72rem", cursor: "pointer" }}
            title="Click to copy"
            onClick={() => { navigator.clipboard.writeText(doc.id); }}
          >{doc.id}</p>
        </div>

        {/* Slug — editable */}
        <div>
          <p style={labelStyle}>Slug</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={slug}
              onChange={e => { setSlug(e.target.value); setError(""); }}
              onBlur={() => { const s = sanitizeSlug(slug); if (s !== slug) setSlug(s); }}
              onKeyDown={e => { if (e.key === "Enter") saveSlug(); }}
              style={{
                flex: 1, padding: "0.35rem 0.5rem", borderRadius: "5px",
                border: `1px solid ${slugError && slug !== doc.slug ? "var(--destructive)" : slugChanged ? "var(--primary)" : "var(--border)"}`,
                background: "var(--background)", color: "var(--foreground)",
                fontSize: "0.8rem", fontFamily: "monospace", outline: "none",
              }}
            />
            {slugChanged && (
              <button
                type="button"
                onClick={saveSlug}
                disabled={saving || !!slugError}
                title={slugError || undefined}
                style={{
                  padding: "0.35rem 0.625rem", borderRadius: "5px",
                  border: "none", background: slugError ? "var(--muted)" : "var(--primary)",
                  color: slugError ? "var(--muted-foreground)" : "var(--primary-foreground)",
                  fontSize: "0.75rem",
                  cursor: saving ? "wait" : slugError ? "not-allowed" : "pointer",
                  flexShrink: 0,
                }}
              >
                {saving ? "…" : "Save"}
              </button>
            )}
          </div>
          {(slugError && slug !== doc.slug) && (
            <p style={{ fontSize: "0.72rem", color: "var(--destructive)", marginTop: "0.25rem" }}>{slugError}</p>
          )}
          {error && <p style={{ fontSize: "0.72rem", color: "var(--destructive)", marginTop: "0.25rem" }}>{error}</p>}
          <p style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.3rem" }}>
            Lowercase letters, numbers and hyphens only
          </p>
          {/* Update slug from title button */}
          {(() => {
            const title = String(doc.data?.title ?? doc.data?.[Object.keys(doc.data)[0]] ?? "");
            const suggested = slugifyTitle(title);
            if (!suggested || suggested === slug) return null;
            return (
              <button
                type="button"
                onClick={() => setSlug(suggested)}
                style={{
                  marginTop: "0.35rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted-foreground)", fontSize: "0.68rem", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "0.3rem",
                }}
                title={`Set slug to: ${suggested}`}
              >
                ↻ Update from title
              </button>
            );
          })()}
        </div>

        {/* Status */}
        <div>
          <p style={labelStyle}>Status</p>
          <p style={valueStyle}>{doc.status}</p>
        </div>

        {/* Collection */}
        <div>
          <p style={labelStyle}>Collection</p>
          <p style={valueStyle}>{collection}</p>
        </div>

        {/* Locale */}
        {doc.locale && (
          <div>
            <p style={labelStyle}>Locale</p>
            <p style={valueStyle}>{doc.locale}</p>
          </div>
        )}

        {/* Translation of */}
        {doc.translationOf && (
          <div>
            <p style={labelStyle}>Translation of</p>
            <p style={valueStyle}>{doc.translationOf}</p>
          </div>
        )}

        {/* Scheduled */}
        {doc.publishAt && (
          <div>
            <p style={labelStyle}>Scheduled publish</p>
            <p style={valueStyle}>{doc.publishAt.replace("T", " ").slice(0, 16)}</p>
          </div>
        )}
        {doc.unpublishAt && (
          <div>
            <p style={labelStyle}>Scheduled expiry</p>
            <p style={{ ...valueStyle, color: "rgb(239 68 68)" }}>{doc.unpublishAt.replace("T", " ").slice(0, 16)}</p>
          </div>
        )}

        {/* Dates */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <p style={labelStyle}>Created</p>
            <p style={valueStyle}>{new Date(doc.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p style={labelStyle}>Last updated</p>
            <p style={valueStyle}>{new Date(doc.updatedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DocSnapshot {
  id: string;
  slug: string;
  status: string;
  locale?: string;
  translationOf?: string;
  publishAt?: string;
  unpublishAt?: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  collection: string;
  colConfig: CollectionConfig;
  blocksConfig?: BlockConfig[];
  locales?: string[];
  defaultLocale?: string;
  initialDoc: DocSnapshot;
  translations?: { slug: string; locale: string | null; status: string; translationOf: string | null; updatedAt?: string }[];
  sourceUpdatedAt?: string;
  sourceData?: Record<string, unknown>;
  previewSiteUrl?: string;
  previewInIframe?: boolean;
  backHref?: string;
  readOnly?: boolean;
}

// Global cache: survives unmount/remount from tab navigation + HMR.
// Keyed by collection/slug, stores the latest doc state.
const G = globalThis as unknown as { __docCache?: Map<string, DocSnapshot> };
if (!G.__docCache) G.__docCache = new Map();
const docStateCache = G.__docCache;

export function DocumentEditor({ collection, colConfig, blocksConfig = [], locales = [], defaultLocale = "en", initialDoc, translations = [], sourceUpdatedAt, sourceData: sourceDataProp, previewSiteUrl, previewInIframe, backHref, readOnly = false }: Props) {
  const PREVIEW_SITE_URL = previewSiteUrl ?? PREVIEW_SITE_URL_DEFAULT;
  const PREVIEW_IN_IFRAME = previewInIframe ?? PREVIEW_IN_IFRAME_DEFAULT;
  const cacheKey = `${collection}/${initialDoc.slug}`;
  const [doc, setDocRaw] = useState(() => {
    // Prefer cached state over server-provided initialDoc (survives tab navigation)
    const cached = docStateCache.get(cacheKey);
    console.log("[DocEditor mount]", cacheKey, {
      hasCached: !!cached,
      cacheSize: docStateCache.size,
      cachedUpdatedAt: cached?.updatedAt,
      initialUpdatedAt: initialDoc.updatedAt,
      willUseCache: !!(cached && cached.updatedAt >= initialDoc.updatedAt),
    });
    if (cached && cached.updatedAt >= initialDoc.updatedAt) {
      return cached;
    }
    // Default empty date fields to today
    const today = new Date().toISOString().split("T")[0];
    const data = { ...initialDoc.data };
    for (const field of colConfig.fields) {
      if (field.type === "date" && !data[field.name]) {
        data[field.name] = today;
      }
    }
    return { ...initialDoc, data };
  });
  // Wrap setDoc to also update the cache
  const setDoc = useCallback((update: DocSnapshot | ((prev: DocSnapshot) => DocSnapshot)) => {
    setDocRaw((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      const key = `${collection}/${next.slug}`;
      docStateCache.set(key, next);
      console.log("[DocEditor setDoc]", key, "cached, cacheSize:", docStateCache.size);
      return next;
    });
  }, [collection]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [seoPanelOpen, setSeoPanelOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [locale, setLocale] = useState(initialDoc.locale ?? "");
  const [translationOf] = useState(initialDoc.translationOf ?? "");
  const [localeOpen, setLocaleOpen] = useState(false);
  const [createTranslationOpen, setCreateTranslationOpen] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const sourceDoc = sourceDataProp ?? null;
  const localeRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { openTab, setTabStatus } = useTabs();

  // Sync document status to active tab (for the colored dot)
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const status = doc.publishAt && doc.publishAt > localNow
      ? "scheduled"
      : doc.status;
    setTabStatus(status);
  }, [doc.status, doc.publishAt, setTabStatus]);

  /* ── Cmd+S → save document ────────────────────────────────── */
  const saveRef = useRef(save);
  saveRef.current = save; // always points to the latest save() with current doc state
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s" && !e.shiftKey) {
        e.preventDefault();
        saveRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close locale dropdown on outside click
  useEffect(() => {
    if (!localeOpen) return;
    const h = (e: MouseEvent) => {
      if (localeRef.current && !localeRef.current.contains(e.target as Node)) setLocaleOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [localeOpen]);

  const updateField = useCallback((name: string, value: unknown) => {
    setDoc((prev) => ({ ...prev, data: { ...prev.data, [name]: value } }));
    setDirty(true);
  }, [setDoc]);

  async function save(status?: "draft" | "published") {
    setSaving(true);
    const nextStatus = status ?? doc.status;

    // Auto-slug: if draft with auto-generated slug and title has changed, include slug rename
    const titleFieldName = colConfig.fields[0]?.name ?? "title";
    const title = String(doc.data[titleFieldName] ?? "");
    const autoSlug = (doc.status === "draft" && isAutoSlug(doc.slug) && title) ? slugifyTitle(title) : null;

    const res = await fetch(`/api/cms/${collection}/${doc.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: doc.data,
        status: nextStatus,
        ...(locale && { locale }),
        ...(translationOf && { translationOf }),
        // Always send publishAt so PATCH route can manage it; null clears it
        publishAt: nextStatus === "published" ? null : (doc.publishAt ?? null),
        unpublishAt: doc.unpublishAt ?? null,
        ...(autoSlug && autoSlug !== doc.slug ? { slug: autoSlug } : {}),
      }),
    });
    if (res.ok) {
      const updated = (await res.json()) as DocSnapshot & { _deployTriggered?: boolean };
      const deployTriggered = updated._deployTriggered;
      setDoc(updated);
      // Navigate to new slug if it changed
      if (updated.slug !== doc.slug) {
        router.replace(`/admin/${collection}/${updated.slug}`);
      }
      setDirty(false);
      setSavedAt(new Date());
      startTransition(() => router.refresh());
      if (nextStatus === "published" && doc.status !== "published") {
        toast.success("Published", { description: doc.slug });
      } else if (nextStatus === "draft" && doc.status === "published") {
        toast.info("Unpublished", { description: doc.slug });
      } else {
        toast.success("Document saved");
      }
      // Auto-rebuild static sites (no previewUrl = static site with build.ts)
      if (!PREVIEW_SITE_URL) {
        fetch("/api/preview-build", { method: "POST" })
          .then((r) => r.json())
          .then((d: { ok?: boolean }) => {
            if (d.ok) toast.success("Site rebuilt", { description: "Preview updated" });
          })
          .catch(() => {});
      }
      // Show deploy progress toast
      if (deployTriggered) {
        const deployToastId = toast.loading("Deploying...", { description: "Building and pushing to live site" });
        const pollDeploy = setInterval(async () => {
          try {
            const r = await fetch("/api/admin/deploy");
            if (!r.ok) return;
            const { deploys } = await r.json() as { deploys: { status: string; url?: string; error?: string; timestamp: string }[] };
            const latest = deploys[0];
            if (!latest) return;
            // Check if this deploy started after our save
            if (new Date(latest.timestamp).getTime() < Date.now() - 30000) return;
            if (latest.status === "success") {
              clearInterval(pollDeploy);
              toast.success("Deployed", { id: deployToastId, description: latest.url ?? "Site is live" });
            } else if (latest.status === "error") {
              clearInterval(pollDeploy);
              toast.error("Deploy failed", { id: deployToastId, description: latest.error ?? "Check deploy log" });
            }
          } catch { /* ignore poll errors */ }
        }, 2000);
        // Stop polling after 60s
        setTimeout(() => clearInterval(pollDeploy), 60000);
      }
    }
    setSaving(false);
  }

  async function deleteDoc() {
    await fetch(`/api/cms/${collection}/${doc.slug}`, { method: "DELETE" });
    toast("Moved to trash", { description: doc.slug });
    router.push(`/admin/${collection}`);
    router.refresh();
  }

  async function openPreview() {
    if (!colConfig.urlPrefix) return;
    const prefix = colConfig.urlPrefix.replace(/\/$/, "");
    // Homepage: slug "home" or "index" with urlPrefix "/" maps to root
    const isHomepage = (prefix === "" || prefix === "/") && (doc.slug === "home" || doc.slug === "index");
    // Include category segment if present AND different from urlPrefix (e.g. /blog/{category}/{slug})
    const category = typeof doc.data?.category === "string" ? doc.data.category : "";
    const prefixBase = prefix.split("/").pop() ?? "";
    const useCategory = category && category !== prefixBase;
    const slugPath = useCategory ? `${category}/${doc.slug}` : doc.slug;
    const pagePath = isHomepage ? "/" : `${prefix}/${slugPath}`;

    if (PREVIEW_SITE_URL) {
      const url = `${PREVIEW_SITE_URL}${pagePath}`;
      if (PREVIEW_IN_IFRAME) {
        openTab(previewPath(url), `Preview: ${doc.slug}`, true);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      // Start preview server for static sites and open in iframe
      try {
        const res = await fetch("/api/preview-serve", { method: "POST" });
        if (res.ok) {
          const { url: baseUrl } = await res.json() as { url: string };
          const url = `${baseUrl}${pagePath}`;
          openTab(previewPath(url), `Preview: ${doc.slug}`, true);
        }
      } catch { /* ignore */ }
    }
  }

  async function cloneDoc() {
    setCloning(true);
    const res = await fetch(`/api/cms/${collection}/${doc.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clone" }),
    });
    if (res.ok) {
      const cloned = (await res.json()) as { slug: string };
      toast.success("Document cloned", { description: cloned.slug });
      router.push(`/admin/${collection}/${cloned.slug}`);
      router.refresh();
    }
    setCloning(false);
  }

  const isPublished = doc.status === "published";
  const isExpired = doc.status === "expired";

  return (
    <div className="flex flex-col" data-doc-locale={doc.locale || defaultLocale}>
      {/* Top bar — sticky */}
      <ActionBar
        actions={
          <div className="flex items-center gap-2">
          {savedAt && !dirty && (
            <span className="text-xs text-muted-foreground">
              Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full",
              isPublished
                ? "bg-green-500/10 text-green-400"
                : isExpired
                ? "bg-red-500/10 text-red-400"
                : "bg-yellow-500/10 text-yellow-400"
            )}
          >
            {isPublished ? <Globe className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
            {doc.status}
          </span>

          {/* Locale selector */}
          {locales && locales.length > 1 && (locale || defaultLocale) && (
            <div style={{ position: "relative" }} ref={localeRef}>
              <button
                type="button"
                onClick={() => translations.length > 0 ? setLocaleOpen(o => !o) : undefined}
                title={translations.length > 0 ? "Switch between translations" : `Document language: ${(locale || defaultLocale || "").toUpperCase()}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.2rem 0.5rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: "0.75rem", fontFamily: "monospace",
                  cursor: translations.length > 0 ? "pointer" : "default",
                }}
              >
                <Languages style={{ width: "0.8rem", height: "0.8rem" }} />
                {(locale || defaultLocale || "").toUpperCase()}
                {translations.length > 0 && <span style={{ fontSize: "0.6rem", opacity: 0.5 }}>▾</span>}
              </button>
              {localeOpen && translations.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  minWidth: "140px", overflow: "hidden",
                }}>
                  {/* Current doc */}
                  <div style={{
                    padding: "0.4rem 0.75rem", fontSize: "0.8rem", fontFamily: "monospace",
                    background: "var(--accent)", color: "var(--foreground)", fontWeight: 600,
                  }}>
                    {(locale || defaultLocale || "").toUpperCase()} — current
                  </div>
                  {/* Sibling translations */}
                  {translations.map(t => (
                    <Link
                      key={t.slug}
                      href={`/admin/${collection}/${t.slug}`}
                      onClick={() => setLocaleOpen(false)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.4rem",
                        padding: "0.4rem 0.75rem", fontSize: "0.8rem",
                        color: "var(--foreground)", textDecoration: "none",
                        fontFamily: "monospace",
                      }}
                      className="hover:bg-accent"
                    >
                      <span style={{ fontWeight: 600 }}>{(t.locale ?? "?").toUpperCase()}</span>
                      <span style={{ color: "var(--muted-foreground)", fontSize: "0.7rem" }}>{t.slug}</span>
                      <span style={{
                        width: "6px", height: "6px", borderRadius: "50%", marginLeft: "auto",
                        backgroundColor: t.status === "published" ? "rgb(74 222 128)" : "rgb(234 179 8)",
                      }} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cloneDoc}
              disabled={cloning}
              className="text-muted-foreground hover:text-foreground gap-1.5"
              title="Clone item"
            >
              <Copy className="w-3.5 h-3.5" />
              {cloning ? "Cloning…" : "Clone"}
            </Button>
          )}

          {translationOf && (
            <Button
              variant={sideBySide ? "default" : "ghost"}
              size="sm"
              onClick={() => setSideBySide(!sideBySide)}
              className="gap-1.5"
              title="Show source document side-by-side"
              style={sideBySide ? { background: "#F7BB2E", color: "#0D0D0D" } : undefined}
            >
              <Languages className="w-3.5 h-3.5" />
              {sideBySide ? "Close source" : "Side-by-side"}
            </Button>
          )}

          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGenerateOpen(true)}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              title="Generate all fields with AI"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Generate
            </Button>
          )}

          {!readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAiPanelOpen((o) => !o); if (historyOpen) setHistoryOpen(false); }}
              className={aiPanelOpen ? "gap-1.5 text-primary" : "gap-1.5 text-muted-foreground hover:text-foreground"}
              title="AI Assistant"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSeoPanelOpen((o) => !o); if (historyOpen) setHistoryOpen(false); if (aiPanelOpen) setAiPanelOpen(false); if (propertiesOpen) setPropertiesOpen(false); }}
            className={seoPanelOpen ? "gap-1.5 text-primary" : "gap-1.5 text-muted-foreground hover:text-foreground"}
            title="SEO settings"
          >
            <SearchIcon className="w-3.5 h-3.5" />
            SEO
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setHistoryOpen((o) => !o); if (aiPanelOpen) setAiPanelOpen(false); if (propertiesOpen) setPropertiesOpen(false); if (seoPanelOpen) setSeoPanelOpen(false); }}
            className="text-muted-foreground hover:text-foreground gap-1.5"
            title="Revision history"
          >
            <History className="w-3.5 h-3.5" />
            History
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => { setPropertiesOpen((o) => !o); if (historyOpen) setHistoryOpen(false); if (aiPanelOpen) setAiPanelOpen(false); }}
            className={propertiesOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"}
            title="Document properties (slug, ID, dates)"
          >
            <Settings2 className="w-4 h-4" />
          </Button>

          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setConfirmTrash(true)}
              className="text-muted-foreground hover:text-destructive"
              title="Move to trash"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}

          {colConfig.urlPrefix && (
            <Button
              variant="ghost"
              size="icon"
              onClick={openPreview}
              className="text-muted-foreground hover:text-foreground"
              title="Preview"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}

          {!readOnly && (
            <>
              {isPublished ? (
                <>
                  <ScheduleButton
                    publishAt={doc.unpublishAt}
                    onSchedule={async (iso) => {
                      setDoc((prev) => ({ ...prev, unpublishAt: iso }));
                      setSaving(true);
                      const res = await fetch(`/api/cms/${collection}/${doc.slug}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ unpublishAt: iso ?? null }),
                      });
                      if (res.ok) {
                        const updated = (await res.json()) as DocSnapshot;
                        setDoc(updated);
                        startTransition(() => router.refresh());
                      }
                      setSaving(false);
                    }}
                    label="Expires"
                    defaultLabel="Set expiry"
                    popoverLabel="Auto-unpublish at"
                    color="rgb(239 68 68)"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => save("draft")}
                    disabled={saving}
                    className="gap-1.5"
                    title="Revert to draft (unpublish)"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Unpublish
                  </Button>
                </>
              ) : (
                <>
                  <ScheduleButton
                    publishAt={doc.publishAt}
                    onSchedule={async (iso) => {
                      setDoc((prev) => ({ ...prev, publishAt: iso }));
                      // Auto-save schedule change immediately
                      setSaving(true);
                      const res = await fetch(`/api/cms/${collection}/${doc.slug}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ publishAt: iso ?? null }),
                      });
                      if (res.ok) {
                        const updated = (await res.json()) as DocSnapshot;
                        setDoc(updated);
                        startTransition(() => router.refresh());
                      }
                      setSaving(false);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => save("published")}
                    disabled={saving}
                    className="gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-400"
                    title="Save and publish immediately"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Publish
                  </Button>
                </>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={() => save()}
                disabled={saving || !dirty}
                className="gap-1.5"
                title={dirty ? "Save changes (⌘S)" : "No unsaved changes"}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
          {readOnly && (
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted font-mono">
              Read only
            </span>
          )}
        </div>
        }
      >
        <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center" }} />
        <Link
          href={backHref ?? `/admin/${collection}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={`Back to ${backHref === "/admin/curation" ? "Curation Queue" : collection}`}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <ActionBarBreadcrumb items={[backHref === "/admin/curation" ? "curation" : collection, doc.slug]} />
        {dirty && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-mono">
            unsaved
          </span>
        )}
      </ActionBar>

      {/* Translations bar — sticky below top bar */}
      {(translations.length > 0 || (locales && locales.length > 0)) && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem",
          padding: "0.35rem 1rem", borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--background)", flexWrap: "wrap",
          position: "sticky", top: 132, zIndex: 20,
        }}>
          <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Translations
          </span>
          {translations.map(t => {
            // If current doc is the source, check if this translation is stale
            // If current doc is a translation, the "source" link in translations points to the original
            const isSource = !translationOf; // current doc is the source
            const stale = isSource && t.translationOf && t.updatedAt
              ? isTranslationStale(doc.updatedAt, t.updatedAt)
              : false;
            return (
              <Link
                key={t.slug}
                href={`/admin/${collection}/${t.slug}`}
                title={stale ? "Source updated — translation may be outdated" : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.15rem 0.5rem", borderRadius: "4px",
                  border: `1px solid ${stale ? "rgb(234 179 8 / 0.4)" : "var(--border)"}`, fontSize: "0.7rem",
                  fontFamily: "monospace", color: "var(--foreground)",
                  background: "var(--card)", textDecoration: "none",
                }}
              >
                {stale && <span title="Source updated — translation may be outdated" style={{ fontSize: "0.7rem", lineHeight: 1 }}>&#9888;&#65039;</span>}
                {t.locale && <span style={{ fontWeight: 600 }}>{t.locale.toUpperCase()}</span>}
                <span style={{ color: t.locale ? "var(--muted-foreground)" : "var(--foreground)" }}>{t.slug}</span>
                <span style={{
                  width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0,
                  backgroundColor: t.status === "published" ? "rgb(74 222 128)" : "rgb(234 179 8)",
                }} />
              </Link>
            );
          })}
          {(() => {
            // Only source documents can create translations (not translations of translations)
            if (translationOf) return null;
            const existingLocs = [locale || defaultLocale || null, ...translations.map(t => t.locale)];
            const available = (locales ?? []).filter(l => !existingLocs.includes(l));
            return available.length > 0 ? (
              <button
                type="button"
                onClick={() => setCreateTranslationOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.15rem 0.5rem", borderRadius: "4px",
                  border: "1px dashed var(--border)", fontSize: "0.7rem",
                  fontFamily: "monospace", color: "var(--muted-foreground)",
                  background: "transparent", cursor: "pointer",
                }}
              >
                + Add translation
              </button>
            ) : null;
          })()}
        </div>
      )}

      {/* Stale translation banner */}
      {translationOf && sourceUpdatedAt && isTranslationStale(sourceUpdatedAt, initialDoc.updatedAt) && (
        <div style={{
          display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap",
          padding: "0.5rem 1rem",
          background: "rgb(234 179 8 / 0.08)", borderBottom: "1px solid rgb(234 179 8 / 0.25)",
          fontSize: "0.75rem", color: "rgb(234 179 8)",
        }}>
          <span>&#9888;&#65039;</span>
          <span>Source document was updated — this translation may be outdated.</span>
          <button
            type="button"
            onClick={() => {
              setCreateTranslationOpen(true);
            }}
            style={{
              padding: "0.2rem 0.5rem", borderRadius: "4px",
              border: "1px solid rgb(234 179 8 / 0.4)", background: "rgb(234 179 8 / 0.1)",
              color: "rgb(234 179 8)", fontSize: "0.7rem", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
            }}
          >
            <Sparkles size={11} /> Re-translate with AI
          </button>
        </div>
      )}

      {/* Editor body */}
      <div style={sideBySide && sourceDoc ? { display: "flex", gap: 0 } : undefined}>
        {/* Source document pane (read-only) */}
        {sideBySide && sourceDoc && (
          <div style={{
            flex: "0 0 50%", maxWidth: "50%", borderRight: "2px solid var(--border)",
            padding: "2rem 1.5rem", overflowY: "auto",
            background: "var(--muted)", fontSize: "0.85rem",
          }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginBottom: "1.5rem" }}>
              Source ({(initialDoc as any).translationOf})
            </p>
            {colConfig.fields.map((field) => {
              const val = sourceDoc[field.name];
              if (val === undefined || val === null || val === "") return null;
              return (
                <div key={field.name} style={{ marginBottom: "1.5rem" }}>
                  <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.35rem" }}>
                    {field.label || field.name}
                  </p>
                  {(field.type === "richtext" || field.type === "htmldoc") ? (
                    <div
                      className="prose prose-sm dark:prose-invert"
                      style={{ fontSize: "0.85rem", lineHeight: 1.6, color: "var(--foreground)", maxWidth: "none" }}
                      dangerouslySetInnerHTML={{ __html: (() => {
                        const raw = String(val);
                        return /<(?:p|h[1-6]|div|ul|ol|table|blockquote)\b/i.test(raw) ? raw : miniMarkdownToHtml(raw);
                      })() }}
                    />
                  ) : field.type === "image" ? (
                    <img src={String(val)} alt="" style={{ maxWidth: "100%", borderRadius: "6px" }} />
                  ) : field.type === "textarea" ? (
                    <p style={{ fontSize: "0.85rem", color: "var(--foreground)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {String(val)}
                    </p>
                  ) : typeof val === "object" ? (
                    <pre style={{ fontSize: "0.75rem", color: "var(--foreground)", margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", opacity: 0.7 }}>
                      {JSON.stringify(val, null, 2)}
                    </pre>
                  ) : (
                    <p style={{ fontSize: "0.9rem", color: "var(--foreground)", margin: 0 }}>
                      {String(val)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={sideBySide && sourceDoc ? { flex: "0 0 50%", maxWidth: "50%" } : undefined}>
        <div className="doc-editor-body space-y-10">
          <div className="flex gap-6 text-xs text-muted-foreground font-mono pb-8 border-b border-border flex-wrap">
            <span>Created {formatDate(doc.createdAt)}</span>
            <span>Updated {formatDate(doc.updatedAt)}</span>
            <span
              title="Click to copy document ID"
              onClick={() => { navigator.clipboard.writeText(doc.id); }}
              style={{ cursor: "pointer", opacity: 0.5 }}
              className="hover:opacity-100"
            >
              ID: {doc.id.slice(0, 8)}…
            </span>
            {translationOf && (
              <span>
                Translation of{" "}
                <Link
                  href={`/admin/${collection}/${translationOf}`}
                  style={{ color: "var(--foreground)", textDecoration: "underline", textUnderlineOffset: "2px" }}
                >
                  {translationOf}
                </Link>
              </span>
            )}
          </div>

          {/* For blocks collection: show base fields first, then type-specific fields from blocksConfig */}
          {(() => {
            const isBlocksCollection = collection === "blocks" && blocksConfig.length > 0;
            const selectedType = isBlocksCollection ? String(doc.data["blockType"] ?? "") : "";
            const typeFields = isBlocksCollection && selectedType
              ? blocksConfig.find(b => b.name === selectedType)?.fields ?? []
              : [];
            const fields = isBlocksCollection
              ? [...colConfig.fields, ...typeFields]
              : colConfig.fields;
            return fields;
          })().map((field) => {
            const isLocked = !!(
              doc.data["_fieldMeta"] as Record<string, unknown> | undefined
            )?.[field.name];
            const isReadTime = /^read.?time$/i.test(field.name);

            // Richtext fields get a collapsible TEXT header (like blocks)
            if (field.type === "richtext") {
              const rtKey = `cms-rt-open:${collection}:${doc.slug}:${field.name}`;
              return (
                <RichtextCollapsible
                  key={field.name}
                  field={field}
                  value={doc.data[field.name]}
                  onChange={(val) => updateField(field.name, val)}
                  locked={isLocked}
                  blocksConfig={blocksConfig}
                  defaultOpen={true}
                  storageKey={rtKey}
                  collection={collection}
                  slug={doc.slug}
                  fieldMeta={doc.data["_fieldMeta"] as Record<string, unknown> | undefined}
                  onToggleLock={() => {
                    const currentMeta = (doc.data["_fieldMeta"] as Record<string, unknown> | undefined) ?? {};
                    const newMeta = { ...currentMeta };
                    if (isLocked) { delete newMeta[field.name]; } else { newMeta[field.name] = { lockedBy: "user", lockedAt: new Date().toISOString() }; }
                    updateField("_fieldMeta", newMeta);
                    fetch(`/api/cms/${collection}/${doc.slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { _fieldMeta: newMeta } }) }).catch(() => {});
                  }}
                />
              );
            }

            return (
              <div key={field.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
                    {field.label ?? field.name}
                  </label>
                  {field.required && <span className="text-xs text-primary">*</span>}
                  <button
                    type="button"
                    title={isLocked ? "AI locked — click to unlock" : "Click to AI lock this field"}
                    onClick={() => {
                      const currentMeta = (doc.data["_fieldMeta"] as Record<string, unknown> | undefined) ?? {};
                      const newMeta = { ...currentMeta };
                      if (isLocked) {
                        delete newMeta[field.name];
                      } else {
                        newMeta[field.name] = { lockedBy: "user", lockedAt: new Date().toISOString() };
                      }
                      updateField("_fieldMeta", newMeta);
                      // Persist lock immediately — silent, no spinner, doesn't affect dirty state
                      fetch(`/api/cms/${collection}/${doc.slug}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ data: { _fieldMeta: newMeta } }),
                      }).catch(() => { /* non-fatal */ });
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.2rem",
                      fontSize: "0.65rem", color: isLocked ? "var(--primary)" : "var(--muted-foreground)",
                      opacity: isLocked ? 1 : 0.45,
                      background: "transparent", border: "none", cursor: "pointer", padding: 0,
                      fontFamily: "monospace", transition: "opacity 150ms, color 150ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = isLocked ? "1" : "0.45"; }}
                  >
                    {isLocked
                      ? <><Lock style={{ width: "0.7rem", height: "0.7rem" }} /> AI locked</>
                      : <><LockOpen style={{ width: "0.7rem", height: "0.7rem" }} /> Lock</>
                    }
                  </button>
                  {isReadTime && (
                    <button
                      type="button"
                      onClick={() => {
                        const content = doc.data["content"];
                        if (typeof content !== "string" || !content.trim()) return;
                        const stripped = content.replace(/!\[.*?\]\(.*?\)/g, "").replace(/[#*_`>\[\]]/g, "").trim();
                        const words = stripped.split(/\s+/).filter(Boolean).length;
                        const mins = Math.max(1, Math.ceil(words / 200));
                        updateField(field.name, `${mins} min read`);
                      }}
                      style={{
                        fontSize: "0.65rem", fontFamily: "monospace", letterSpacing: "0.05em",
                        textTransform: "uppercase", padding: "1px 6px", borderRadius: "9999px",
                        border: "1px solid var(--border)", color: "var(--muted-foreground)",
                        backgroundColor: "transparent", cursor: "pointer", transition: "border-color 120ms, color 120ms",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--primary)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)";
                      }}
                    >
                      Calculate
                    </button>
                  )}
                </div>
                <FieldEditor
                  field={field}
                  value={doc.data[field.name]}
                  onChange={(val) => updateField(field.name, val)}
                  locked={readOnly || isLocked}
                  blocksConfig={blocksConfig}
                />
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {confirmTrash && (
        <ConfirmDialog
          message={`Move "${doc.slug}" to trash? You can restore it from the Trash section.`}
          confirmLabel="Move to trash"
          onConfirm={() => { setConfirmTrash(false); deleteDoc(); }}
          onCancel={() => setConfirmTrash(false)}
        />
      )}

      {aiPanelOpen && (
        <AIPanel
          collection={collection}
          colConfig={colConfig}
          doc={doc}
          onClose={() => setAiPanelOpen(false)}
          onInsert={(fieldName, content) => {
            updateField(fieldName, content);
          }}
        />
      )}

      {generateOpen && (
        <GenerateDocumentDialog
          collection={collection}
          collectionLabel={colConfig.label ?? collection}
          existingData={doc.data}
          existingSlug={doc.slug}
          onClose={() => setGenerateOpen(false)}
          onGenerated={(data) => {
            setDoc((prev) => ({
              ...prev,
              data: { ...prev.data, ...data },
            }));
            setDirty(true);
            setGenerateOpen(false);
          }}
        />
      )}

      {propertiesOpen && (
        <PropertiesPanel
          doc={doc}
          collection={collection}
          onClose={() => setPropertiesOpen(false)}
          onSaved={(updated) => {
            setDoc(updated);
            setPropertiesOpen(false);
          }}
        />
      )}

      {seoPanelOpen && (
        <SeoPanel
          collection={collection}
          doc={doc}
          onUpdate={(seo) => {
            updateField("_seo", seo);
          }}
          onSave={() => saveRef.current()}
          onClose={() => setSeoPanelOpen(false)}
        />
      )}

      {historyOpen && (
        <RevisionPanel
          collection={collection}
          slug={doc.slug}
          currentData={doc.data}
          onClose={() => setHistoryOpen(false)}
          onRestore={(updated) => {
            const snap = updated as unknown as DocSnapshot;
            setDoc((prev) => ({
              ...prev,
              data: snap.data ?? prev.data,
              status: snap.status ?? prev.status,
            }));
            setDirty(true);
            setHistoryOpen(false);
          }}
        />
      )}

      {createTranslationOpen && locales && locales.length > 0 && (
        <CreateTranslationDialog
          collection={collection}
          originalSlug={translationOf || doc.slug}
          locales={locales}
          existingLocales={[locale || defaultLocale || null, ...translations.map(t => t.locale)]}
          defaultLocale={defaultLocale ?? "en"}
          onClose={() => setCreateTranslationOpen(false)}
          onCreated={(slug) => {
            setCreateTranslationOpen(false);
            router.push(`/admin/${collection}/${slug}`);
          }}
        />
      )}
    </div>
  );
}
