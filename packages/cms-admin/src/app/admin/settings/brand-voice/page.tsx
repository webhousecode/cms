"use client";

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { Loader2, Send, RefreshCw, Pencil, History, ChevronDown, Languages, Check, ArrowUpDown } from "lucide-react";
import type { BrandVoice, BrandVoiceVersion } from "@/lib/brand-voice";

const TRANSLATE_LANGUAGES = ["English", "Danish", "German", "French", "Spanish", "Norwegian", "Swedish"];

/* ─── Shared diff utilities (mirrors document-editor) ───────────── */
function wordDiff(oldText: string, newText: string): Array<{ text: string; type: "same" | "added" | "removed" }> {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  const result: Array<{ text: string; type: "same" | "added" | "removed" }> = [];
  const m = oldWords.length, n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i]![j] = oldWords[i] === newWords[j] ? 1 + (dp[i + 1]?.[j + 1] ?? 0) : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldWords[i] === newWords[j]) { result.push({ text: oldWords[i]!, type: "same" }); i++; j++; }
    else if (j < n && (i >= m || (dp[i]?.[j + 1] ?? 0) >= (dp[i + 1]?.[j] ?? 0))) { result.push({ text: newWords[j]!, type: "added" }); j++; }
    else { result.push({ text: oldWords[i]!, type: "removed" }); i++; }
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
            <span key={i} style={{ backgroundColor: part.type === "added" ? "rgba(74,222,128,0.15)" : part.type === "removed" ? "rgba(248,113,113,0.15)" : "transparent", color: part.type === "added" ? "rgb(74,222,128)" : part.type === "removed" ? "rgb(248,113,113)" : "var(--foreground)", textDecoration: part.type === "removed" ? "line-through" : "none" }}>{part.text}</span>
          ))}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {oldStr && <p style={{ fontSize: "0.72rem", color: "rgb(248,113,113)", textDecoration: "line-through", margin: 0, wordBreak: "break-word", lineHeight: 1.4, maxHeight: "3.5rem", overflow: "hidden" }}>{oldStr.slice(0, 200)}{oldStr.length > 200 ? "…" : ""}</p>}
          {newStr && <p style={{ fontSize: "0.72rem", color: "rgb(74,222,128)", margin: 0, wordBreak: "break-word", lineHeight: 1.4, maxHeight: "3.5rem", overflow: "hidden" }}>{newStr.slice(0, 200)}{newStr.length > 200 ? "…" : ""}</p>}
        </div>
      )}
    </div>
  );
}

/* ─── History panel (mirrors RevisionPanel) ─────────────────────── */
const BV_KEYS: (keyof BrandVoice)[] = ["name","industry","description","language","targetAudience","primaryTone","brandPersonality","contentGoals","contentPillars","avoidTopics","seoKeywords","examplePhrases"];

function BrandVoiceHistoryPanel({ versions, onRestore, onClose }: {
  versions: (BrandVoiceVersion & { active: boolean })[];
  onRestore: (v: BrandVoiceVersion) => void;
  onClose: () => void;
}) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function restore(v: BrandVoiceVersion) {
    setRestoring(v.id);
    await fetch(`/api/cms/brand-voice/versions/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    onRestore(v);
    setRestoring(null);
  }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "380px", zIndex: 100, background: "var(--card)", borderLeft: "1px solid var(--border)", boxShadow: "-4px 0 20px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Revision history</span>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
        {versions.length === 0 && (
          <p style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>No versions yet.</p>
        )}
        {versions.map((v, idx) => {
          const prev = versions[idx + 1];
          const changedFields = BV_KEYS.filter((k) => JSON.stringify(v[k]) !== JSON.stringify(prev?.[k]));
          const isOpen = expanded === v.id;
          return (
            <div key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--foreground)", margin: 0 }}>
                    {new Date(v.completedAt).toLocaleString()}
                    {v.active && <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "var(--primary)", fontWeight: 600 }}>· active</span>}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
                    {v.language}{prev ? ` · ${changedFields.length} changed field${changedFields.length !== 1 ? "s" : ""}` : " · initial version"}
                  </p>
                  {changedFields.length > 0 && (
                    <button type="button" onClick={() => setExpanded(isOpen ? null : v.id)}
                      style={{ fontSize: "0.65rem", color: "var(--primary)", background: "transparent", border: "none", cursor: "pointer", padding: 0, marginTop: "0.2rem" }}>
                      {isOpen ? "Hide diff" : "Show diff"}
                    </button>
                  )}
                </div>
                {!v.active && (
                  <button type="button" onClick={() => restore(v)} disabled={restoring === v.id}
                    style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", cursor: restoring === v.id ? "wait" : "pointer", background: "transparent", color: "var(--foreground)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {restoring === v.id ? "…" : "Restore"}
                  </button>
                )}
              </div>
              {isOpen && changedFields.length > 0 && (
                <div style={{ padding: "0 1rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {changedFields.map((field) => (
                    <FieldDiff key={field} fieldName={field} oldVal={prev?.[field]} newVal={v[field]} />
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

/* ─── Types ─────────────────────────────────────────────────────── */
type Message = { role: "user" | "assistant"; content: string };
type VersionWithActive = BrandVoiceVersion & { active: boolean };

/* ─── Helpers ───────────────────────────────────────────────────── */
function parseSynthesis(text: string): BrandVoice | null {
  const marker = "__SYNTHESIS__";
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  try {
    return JSON.parse(text.slice(idx + marker.length).trim()) as BrandVoice;
  } catch {
    return null;
  }
}

function stripSynthesis(text: string): string {
  const idx = text.indexOf("__SYNTHESIS__");
  return idx !== -1 ? text.slice(0, idx).trim() : text;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ─── Edit form ─────────────────────────────────────────────────── */
function EditForm({ version, onSaved, onCancel }: {
  version: BrandVoiceVersion;
  onSaved: (v: BrandVoiceVersion) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: version.name,
    industry: version.industry,
    description: version.description,
    language: version.language,
    targetAudience: version.targetAudience,
    primaryTone: version.primaryTone,
    brandPersonality: version.brandPersonality.join(", "),
    contentGoals: version.contentGoals.join(", "),
    contentPillars: version.contentPillars.join(", "),
    avoidTopics: version.avoidTopics.join(", "),
    seoKeywords: version.seoKeywords.join(", "),
    examplePhrases: version.examplePhrases.join("\n"),
  });
  const [saving, setSaving] = useState(false);

  const field = (
    label: string,
    key: keyof typeof form,
    multiline = false,
    hint?: string
  ) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <label style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)" }}>
        {label}{hint && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: "0.5rem" }}>{hint}</span>}
      </label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          style={{ padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", resize: "vertical", minHeight: "80px", fontFamily: "inherit" }}
        />
      ) : (
        <input
          type="text"
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          style={{ padding: "0.5rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem" }}
        />
      )}
    </div>
  );

  async function save() {
    setSaving(true);
    const updated: Partial<BrandVoice> = {
      name: form.name,
      industry: form.industry,
      description: form.description,
      language: form.language,
      targetAudience: form.targetAudience,
      primaryTone: form.primaryTone,
      brandPersonality: form.brandPersonality.split(",").map((s) => s.trim()).filter(Boolean),
      contentGoals: form.contentGoals.split(",").map((s) => s.trim()).filter(Boolean),
      contentPillars: form.contentPillars.split(",").map((s) => s.trim()).filter(Boolean),
      avoidTopics: form.avoidTopics.split(",").map((s) => s.trim()).filter(Boolean),
      seoKeywords: form.seoKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      examplePhrases: form.examplePhrases.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const res = await fetch(`/api/cms/brand-voice/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const saved = await res.json() as BrandVoiceVersion;
      onSaved(saved);
    }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {field("Site name", "name")}
        {field("Industry", "industry")}
        {field("Language", "language")}
        {field("Primary tone", "primaryTone")}
      </div>
      {field("Description", "description", true)}
      {field("Target audience", "targetAudience", true)}
      {field("Brand personality", "brandPersonality", false, "(comma-separated)")}
      {field("Content goals", "contentGoals", false, "(comma-separated)")}
      {field("Content pillars", "contentPillars", false, "(comma-separated)")}
      {field("SEO keywords", "seoKeywords", false, "(comma-separated)")}
      {field("Avoid", "avoidTopics", false, "(comma-separated)")}
      {field("Voice examples", "examplePhrases", true, "(one per line)")}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", borderRadius: "7px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
        >
          {saving ? <Loader2 style={{ width: "13px", height: "13px" }} className="animate-spin" /> : <Check style={{ width: "13px", height: "13px" }} />}
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: "0.5rem 1rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.875rem", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Import / Export ───────────────────────────────────────────── */
const BV_STRING_FIELDS: (keyof BrandVoice)[] = ["name", "industry", "description", "language", "targetAudience", "primaryTone"];
const BV_ARRAY_FIELDS: (keyof BrandVoice)[] = ["brandPersonality", "contentGoals", "contentPillars", "avoidTopics", "seoKeywords", "examplePhrases"];

const BV_SCHEMA_HINT = `Expected format:
{
  "name": "Acme Corp",
  "industry": "SaaS",
  "description": "1-2 sentences about the business",
  "language": "English",
  "targetAudience": "Who reads the site",
  "primaryTone": "1 sentence describing overall tone",
  "brandPersonality": ["adjective1", "adjective2"],
  "contentGoals": ["goal1", "goal2"],
  "contentPillars": ["pillar1", "pillar2"],
  "avoidTopics": ["topic1"],
  "seoKeywords": ["keyword1", "keyword2"],
  "examplePhrases": ["phrase1", "phrase2"]
}`;

function validateBrandVoice(data: unknown): { ok: true; value: BrandVoice } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return { ok: false, errors: ["Root must be a JSON object."] };
  const obj = data as Record<string, unknown>;
  for (const key of BV_STRING_FIELDS) {
    if (typeof obj[key] !== "string" || !(obj[key] as string).trim())
      errors.push(`"${key}" must be a non-empty string`);
  }
  for (const key of BV_ARRAY_FIELDS) {
    if (!Array.isArray(obj[key]) || !(obj[key] as unknown[]).every((x) => typeof x === "string"))
      errors.push(`"${key}" must be an array of strings`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: data as BrandVoice };
}

function ImportExportMenu({ bv, onImport }: { bv: BrandVoice; onImport: (v: BrandVoice) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    setOpen(false);
    const { completedAt: _c, ...clean } = bv as BrandVoice & { completedAt?: string };
    void _c;
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brand-voice-${(bv.name || "export").toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openImport() {
    setOpen(false);
    setErrors(null);
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setErrors(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); }
      catch { setErrors(["Invalid JSON — could not parse file."]); return; }
      const result = validateBrandVoice(parsed);
      if (!result.ok) { setErrors(result.errors); return; }
      await onImport(result.value);
      setErrors(null);
    } finally {
      setImporting(false);
    }
  }

  const btnStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" };

  return (
    <div style={{ position: "relative" }}>
      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={handleFile} />
      <button type="button" onClick={() => setOpen((o) => !o)} disabled={importing} style={btnStyle}>
        {importing ? <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" /> : <ArrowUpDown style={{ width: "12px", height: "12px" }} />}
        <ChevronDown style={{ width: "10px", height: "10px" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "150px", overflow: "hidden" }}>
          {[
            { label: "Export JSON", action: doExport },
            { label: "Import JSON", action: openImport },
          ].map(({ label, action }) => (
            <button key={label} type="button" onClick={action}
              style={{ display: "block", width: "100%", padding: "0.5rem 0.875rem", textAlign: "left", background: "none", border: "none", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {errors && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "var(--popover)", border: "1px solid var(--destructive)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", padding: "0.75rem 1rem", minWidth: "320px", maxWidth: "420px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--destructive)" }}>Import failed</p>
            <button type="button" onClick={() => setErrors(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            {errors.map((e) => <li key={e} style={{ fontSize: "0.75rem", color: "var(--destructive)" }}>{e}</li>)}
          </ul>
          <details>
            <summary style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", cursor: "pointer", userSelect: "none" }}>Show expected format</summary>
            <pre style={{ margin: "0.5rem 0 0", fontSize: "0.65rem", lineHeight: 1.5, color: "var(--muted-foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{BV_SCHEMA_HINT}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

/* ─── Brand voice card ──────────────────────────────────────────── */
function BrandVoiceCard({ bv, onReinterview, onEdit, onTranslate, onHistory, onImport }: {
  bv: BrandVoice;
  onReinterview: () => void;
  onEdit: () => void;
  onTranslate: (lang: string) => void;
  onHistory: () => void;
  onImport: (v: BrandVoice) => Promise<void>;
}) {
  const [langOpen, setLangOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const pillStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "0.2rem 0.6rem",
    borderRadius: "20px",
    background: "color-mix(in srgb, var(--primary) 12%, transparent)",
    color: "var(--primary)",
    fontSize: "0.75rem",
    fontWeight: 500,
    margin: "0.2rem",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>{bv.name}</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", margin: "0.2rem 0 0" }}>
            {bv.industry} · {bv.language}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ImportExportMenu bv={bv} onImport={onImport} />
          {/* Translate to */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              disabled={translating}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: translating ? "not-allowed" : "pointer" }}
            >
              {translating
                ? <Loader2 style={{ width: "12px", height: "12px" }} className="animate-spin" />
                : <Languages style={{ width: "12px", height: "12px" }} />}
              Translate to
              <ChevronDown style={{ width: "10px", height: "10px" }} />
            </button>
            {langOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50, background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", minWidth: "140px", overflow: "hidden" }}>
                {TRANSLATE_LANGUAGES.filter((l) => l.toLowerCase() !== bv.language.toLowerCase()).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={async () => {
                      setLangOpen(false);
                      setTranslating(true);
                      try { await onTranslate(lang); } finally { setTranslating(false); }
                    }}
                    style={{ display: "block", width: "100%", padding: "0.5rem 0.875rem", textAlign: "left", background: "none", border: "none", color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={onEdit}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
            <Pencil style={{ width: "12px", height: "12px" }} /> Edit
          </button>
          <button type="button" onClick={onHistory}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
            <History style={{ width: "12px", height: "12px" }} /> History
          </button>
          <button type="button" onClick={onReinterview}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
            <RefreshCw style={{ width: "12px", height: "12px" }} /> Re-interview
          </button>
        </div>
      </div>

      <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)" }}>
        <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>{bv.description}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Section label="Target Audience">
          <p style={{ fontSize: "0.875rem", margin: 0, lineHeight: 1.5 }}>{bv.targetAudience}</p>
        </Section>
        <Section label="Tone & Personality">
          <p style={{ fontSize: "0.875rem", margin: "0 0 0.5rem", lineHeight: 1.5 }}>{bv.primaryTone}</p>
          <div>{bv.brandPersonality.map((p) => <span key={p} style={pillStyle}>{p}</span>)}</div>
        </Section>
        <Section label="Content Goals">
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {bv.contentGoals.map((g) => <li key={g} style={{ fontSize: "0.875rem" }}>{g}</li>)}
          </ul>
        </Section>
        <Section label="Content Pillars">
          <div>{bv.contentPillars.map((p) => <span key={p} style={pillStyle}>{p}</span>)}</div>
        </Section>
        <Section label="SEO Keywords">
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {bv.seoKeywords.map((k) => (
              <span key={k} style={{ ...pillStyle, background: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)", color: "var(--foreground)" }}>{k}</span>
            ))}
          </div>
        </Section>
        {bv.avoidTopics.length > 0 && (
          <Section label="Avoid">
            <div>
              {bv.avoidTopics.map((t) => (
                <span key={t} style={{ ...pillStyle, background: "color-mix(in srgb, var(--destructive) 10%, transparent)", color: "var(--destructive)" }}>{t}</span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {bv.examplePhrases.length > 0 && (
        <Section label="Voice Examples">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {bv.examplePhrases.map((phrase) => (
              <div key={phrase} style={{ padding: "0.6rem 0.875rem", borderRadius: "8px", background: "var(--card)", border: "1px solid var(--border)", borderLeft: "3px solid var(--primary)", fontSize: "0.875rem", fontStyle: "italic" }}>
                "{phrase}"
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "1rem 1.25rem", borderRadius: "10px", background: "var(--card)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-foreground)", margin: 0 }}>{label}</p>
      {children}
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function BrandVoicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [synthesized, setSynthesized] = useState<BrandVoice | null>(null);
  const [activeVoice, setActiveVoice] = useState<BrandVoiceVersion | null>(null);
  const [versions, setVersions] = useState<VersionWithActive[]>([]);
  const [loading, setLoading] = useState(true);
  const [interviewActive, setInterviewActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadVersions = useCallback(async () => {
    const res = await fetch("/api/cms/brand-voice?versions=1");
    const data = await res.json() as VersionWithActive[];
    setVersions(data);
    const active = data.find((v) => v.active) ?? data[0] ?? null;
    setActiveVoice(active);
  }, []);

  useEffect(() => {
    loadVersions().finally(() => setLoading(false));
  }, [loadVersions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function startInterview() {
    setInterviewActive(true);
    setMessages([]);
    setSynthesized(null);
    setEditing(false);
    await fetchAssistantReply([]);
  }

  async function fetchAssistantReply(history: Message[]) {
    setStreaming(true);
    let fullText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/cms/brand-voice/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: fullText };
          return next;
        });
      }

      const synthesis = parseSynthesis(fullText);
      if (synthesis) {
        setSynthesized(synthesis);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: stripSynthesis(fullText) || "Perfekt — jeg har nu nok til at definere dit brand voice. Her er resultatet:",
          };
          return next;
        });
        // Auto-save
        await fetch("/api/cms/brand-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(synthesis),
        });
        await loadVersions();
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        return next;
      });
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    await fetchAssistantReply(newHistory);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function autoResize(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function handleTranslate(lang: string) {
    if (!activeVoice) return;
    const res = await fetch("/api/cms/brand-voice/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandVoice: activeVoice, targetLanguage: lang }),
    });
    if (!res.ok) return;
    const translated = await res.json() as BrandVoice;
    // Save as new active version
    const saved = await fetch("/api/cms/brand-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(translated),
    });
    if (saved.ok) {
      const newVersion = await saved.json() as BrandVoiceVersion;
      setActiveVoice(newVersion);
      loadVersions();
    }
  }

  if (loading) {
    return <div className="p-8"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  }

  const pageHeader = (
    <div className="mb-8">
      <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Settings</p>
      <h1 className="text-2xl font-bold text-foreground">Site Persona & Goals</h1>
      <p className="text-sm text-muted-foreground mt-1">The foundation every AI agent works from.</p>
    </div>
  );

  // ── Active interview ──────────────────────────────────────────
  if (interviewActive && !synthesized) {
    return (
      <div className="p-8 max-w-2xl" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)" }}>
        <div className="mb-6" style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Settings</p>
            <h1 className="text-2xl font-bold text-foreground">Site Persona & Goals</h1>
            <p className="text-xs text-muted-foreground mt-1">Powered by Claude Opus · ⌘ Enter to send</p>
          </div>
          {activeVoice && (
            <button
              type="button"
              onClick={() => { setInterviewActive(false); setMessages([]); }}
              style={{ marginTop: "0.25rem", padding: "0.35rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer", flexShrink: 0 }}
            >
              ← Cancel
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem", paddingBottom: "1rem" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "82%",
                padding: "0.75rem 1rem",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? "var(--primary)" : "var(--card)",
                color: msg.role === "user" ? "var(--primary-foreground)" : "var(--foreground)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {msg.content}
                {msg.role === "assistant" && streaming && i === messages.length - 1 && (
                  <span style={{ display: "inline-block", width: "2px", height: "14px", background: "var(--primary)", marginLeft: "2px", verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ flexShrink: 0, display: "flex", gap: "0.5rem", alignItems: "flex-end", padding: "0.75rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--card)" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={autoResize}
            onKeyDown={handleKey}
            disabled={streaming}
            placeholder="Your answer… (tip: paste multiple URLs and the AI will read them all)"
            rows={1}
            style={{ flex: 1, border: "none", background: "transparent", color: "var(--foreground)", fontSize: "0.9rem", outline: "none", resize: "none", lineHeight: 1.5, overflow: "hidden" }}
          />
          <button type="button" onClick={handleSend} disabled={streaming || !input.trim()}
            style={{ flexShrink: 0, width: "34px", height: "34px", borderRadius: "8px", border: "none", background: streaming || !input.trim() ? "var(--muted)" : "var(--primary)", color: streaming || !input.trim() ? "var(--muted-foreground)" : "var(--primary-foreground)", cursor: streaming || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {streaming ? <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" /> : <Send style={{ width: "14px", height: "14px" }} />}
          </button>
        </div>
        <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      </div>
    );
  }

  // ── Has voice — show card or edit form ────────────────────────
  if (activeVoice || synthesized) {
    const voice = (synthesized ? { ...synthesized, id: "", completedAt: new Date().toISOString() } : activeVoice) as BrandVoiceVersion;

    return (
      <div className="p-8 max-w-3xl">
        {pageHeader}

        {editing ? (
          <EditForm
            version={activeVoice ?? voice}
            onSaved={(updated) => {
              setActiveVoice(updated);
              setEditing(false);
              setSynthesized(null);
              loadVersions();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <BrandVoiceCard
              bv={voice}
              onEdit={() => setEditing(true)}
              onReinterview={startInterview}
              onTranslate={handleTranslate}
              onHistory={() => setHistoryOpen(true)}
              onImport={async (imported) => {
                const res = await fetch("/api/cms/brand-voice", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(imported),
                });
                if (res.ok) {
                  const newVersion = await res.json() as BrandVoiceVersion;
                  setActiveVoice(newVersion);
                  setSynthesized(null);
                  loadVersions();
                }
              }}
            />
            {historyOpen && (
              <BrandVoiceHistoryPanel
                versions={versions}
                onRestore={(v) => { setActiveVoice(v); setHistoryOpen(false); loadVersions(); }}
                onClose={() => setHistoryOpen(false)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  // ── No voice yet — start screen ───────────────────────────────
  return (
    <div className="p-8 max-w-2xl">
      {pageHeader}
      <div style={{ padding: "2rem", borderRadius: "14px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "1.25rem", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>How it works</p>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {[
              "Claude Opus — the most capable model — interviews you",
              "6–8 focused questions, each building on your previous answer",
              "Takes about 3 minutes",
              "Result is saved and injected into every agent automatically",
            ].map((item) => (
              <li key={item} style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>{item}</li>
            ))}
          </ul>
        </div>
        <button type="button" onClick={startInterview}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem", borderRadius: "8px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
          <Pencil style={{ width: "14px", height: "14px" }} />
          Start interview
        </button>
      </div>
    </div>
  );
}
