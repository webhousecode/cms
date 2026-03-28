"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Sparkles, Loader2, ChevronDown, ChevronUp, Code2, RefreshCw } from "lucide-react";
import { calculateSeoScore, calculateReadability, type SeoFields, type SeoScoreResult } from "@/lib/seo/score";
import { JSON_LD_TEMPLATES, autoFillFields, generateJsonLd, type JsonLdTemplate } from "@/lib/seo/json-ld";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "sonner";

interface Props {
  collection: string;
  doc: { slug: string; data: Record<string, unknown> };
  onUpdate: (seo: SeoFields) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SeoPanel({ collection, doc, onUpdate, onSave, onClose }: Props) {
  const seo: SeoFields = (doc.data._seo as SeoFields) ?? {};
  const [metaTitle, setMetaTitle] = useState(seo.metaTitle ?? "");
  const [metaDesc, setMetaDesc] = useState(seo.metaDescription ?? "");
  const [keywords, setKeywords] = useState<string[]>(seo.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [ogImage, setOgImage] = useState(seo.ogImage ?? "");
  const [robots, setRobots] = useState(seo.robots ?? "index,follow");
  const [canonical, setCanonical] = useState(seo.canonical ?? "");
  const [jsonLd, setJsonLd] = useState<Record<string, unknown> | null>(seo.jsonLd ?? null);
  const [jsonLdTemplate, setJsonLdTemplate] = useState<string>(seo.jsonLdTemplate ?? "");
  const [jsonLdValues, setJsonLdValues] = useState<Record<string, string>>(seo.jsonLdValues ?? {});
  const [lastOptimized, setLastOptimized] = useState(seo.lastOptimized ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSocialPreview, setShowSocialPreview] = useState(false);
  const [rewriteKeyword, setRewriteKeyword] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [confirmReoptimize, setConfirmReoptimize] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [score, setScore] = useState<SeoScoreResult | null>(null);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // Calculate score whenever fields change
  const recalc = useCallback(() => {
    const current: SeoFields = { metaTitle, metaDescription: metaDesc, keywords, ogImage, robots };
    const result = calculateSeoScore(doc, current);
    setScore(result);
  }, [doc, metaTitle, metaDesc, keywords, ogImage, robots]);

  useEffect(() => { recalc(); }, [recalc]);

  // Persist to doc on every change
  useEffect(() => {
    const timer = setTimeout(() => {
      onUpdate({
        metaTitle: metaTitle || undefined,
        metaDescription: metaDesc || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
        ogImage: ogImage || undefined,
        robots,
        canonical: canonical || undefined,
        score: score?.score,
        scoreDetails: score?.details,
        lastOptimized: lastOptimized || undefined,
        jsonLd: jsonLd ?? undefined,
        jsonLdTemplate: jsonLdTemplate || undefined,
        jsonLdValues: Object.keys(jsonLdValues).length > 0 ? jsonLdValues : undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaTitle, metaDesc, keywords, ogImage, robots, canonical, score, jsonLd, jsonLdTemplate, jsonLdValues]);

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
    }
    setKeywordInput("");
  }

  async function aiOptimize() {
    setOptimizing(true);
    try {
      const content = String(doc.data.content ?? doc.data.body ?? "");
      const title = String(doc.data.title ?? "");
      const res = await fetch("/api/cms/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nContent: ${content.slice(0, 2000)}`,
          instruction: `Generate SEO metadata for this content. Return ONLY a JSON object with these fields:
{
  "metaTitle": "SEO-optimized title (30-60 characters) — MUST include the primary keyword",
  "metaDescription": "compelling meta description (MUST be 130-155 characters, never shorter than 120) — MUST include the primary keyword naturally",
  "keywords": ["primary-keyword", "keyword2", "keyword3", "keyword4", "keyword5"]
}
IMPORTANT: The primary keyword (first in the keywords array) MUST appear in BOTH metaTitle and metaDescription.
Return ONLY the JSON, no explanation.`,
        }),
      });
      const data = await res.json();
      if (data.result) {
        try {
          const parsed = JSON.parse(data.result.replace(/^```json?\n?/, "").replace(/\n?```$/, ""));
          if (parsed.metaTitle) setMetaTitle(parsed.metaTitle);
          if (parsed.metaDescription) setMetaDesc(parsed.metaDescription);
          if (parsed.keywords?.length) setKeywords(parsed.keywords);
          // Auto-generate OG image via server
          try {
            const ogRes = await fetch("/api/admin/seo/og-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ collection, slug: doc.slug }),
            });
            const ogData = await ogRes.json();
            if (ogData.url) setOgImage(ogData.url);
          } catch { /* non-fatal */ }

          setLastOptimized(new Date().toISOString());
          setConfirmReoptimize(false);
          setTimeout(() => onSave(), 500);
          toast.success("SEO optimized and saved");
        } catch {
          toast.error("AI returned invalid JSON");
        }
      }
    } catch {
      toast.error("AI optimization failed");
    }
    setOptimizing(false);
  }

  async function rewriteForKeyword() {
    if (!rewriteKeyword.trim()) return;
    setRewriting(true);
    try {
      const content = String(doc.data.content ?? doc.data.body ?? "");
      const res = await fetch("/api/cms/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Meta title: ${metaTitle}\n\nMeta description: ${metaDesc}\n\nContent excerpt: ${content.slice(0, 2000)}`,
          instruction: `Rewrite the meta title and meta description to optimize for the keyword "${rewriteKeyword.trim()}".

Rules:
- The keyword MUST appear naturally in BOTH the meta title and meta description
- Meta title: 30-60 characters
- Meta description: 130-155 characters
- Keep the original meaning and tone
- Return ONLY a JSON object: {"metaTitle": "...", "metaDescription": "..."}`,
        }),
      });
      const data = await res.json();
      if (data.result) {
        const parsed = JSON.parse(data.result.replace(/^```json?\n?/, "").replace(/\n?```$/, ""));
        if (parsed.metaTitle) setMetaTitle(parsed.metaTitle);
        if (parsed.metaDescription) setMetaDesc(parsed.metaDescription);
        if (!keywords.includes(rewriteKeyword.trim().toLowerCase())) {
          setKeywords([...keywords, rewriteKeyword.trim().toLowerCase()]);
        }
        toast.success(`Rewritten for "${rewriteKeyword.trim()}"`);
        setRewriteKeyword("");
      }
    } catch {
      toast.error("Rewrite failed");
    }
    setRewriting(false);
  }

  // Readability
  const content = String(doc.data.content ?? doc.data.body ?? "");
  const plainText = content.replace(/<[^>]+>/g, " ").replace(/[#*_~`>]/g, "").trim();
  const readabilityScore = plainText.split(/\s+/).length >= 100 ? calculateReadability(plainText) : null;

  const scoreColor = (score?.score ?? 0) >= 80 ? "#4ade80" : (score?.score ?? 0) >= 50 ? "#F7BB2E" : "#f87171";
  const title = String(doc.data.title ?? "");
  const siteUrl = "example.com";

  const lbl: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)", marginBottom: "0.25rem" };
  const input: React.CSSProperties = { width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", outline: "none" };

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "340px", zIndex: 100,
      background: "var(--card)", borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontWeight: 600, fontSize: "0.85rem" }}>
          <Search style={{ width: 14, height: 14 }} /> SEO
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, fontFamily: "monospace", color: scoreColor }}>
            {score?.score ?? 0}
          </span>
          <button type="button" disabled={saving}
            onClick={async () => {
              setSaving(true);
              setSaved(false);
              onSave();
              await new Promise((r) => setTimeout(r, 1000));
              setSaving(false);
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
            style={{
              padding: "0.25rem 0.5rem", borderRadius: "5px", border: "none",
              background: saved ? "#4ade80" : "#F7BB2E", color: "#0D0D0D",
              cursor: saving ? "wait" : "pointer",
              fontSize: "0.7rem", fontWeight: 600,
              transition: "background 0.2s",
              opacity: saving ? 0.7 : 1,
            }}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "1.1rem" }}>&times;</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

        {/* Score bar */}
        <div>
          <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${score?.score ?? 0}%`, background: scoreColor, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Meta title */}
        <div>
          <p style={lbl}>Meta title</p>
          <input type="text" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={title} style={input} maxLength={70} />
          <p style={{ fontSize: "0.65rem", color: metaTitle.length > 60 ? "#f87171" : "var(--muted-foreground)", marginTop: "0.2rem", textAlign: "right" }}>
            {metaTitle.length}/60
          </p>
        </div>

        {/* Meta description */}
        <div>
          <p style={lbl}>Meta description</p>
          <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} placeholder="Compelling description for search results..." style={{ ...input, minHeight: 100, resize: "vertical" }} maxLength={200} />
          <p style={{ fontSize: "0.65rem", color: metaDesc.length > 160 ? "#f87171" : "var(--muted-foreground)", marginTop: "0.2rem", textAlign: "right" }}>
            {metaDesc.length}/160
          </p>
        </div>

        {/* Keywords */}
        <div>
          <p style={lbl}>Keywords</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: keywords.length > 0 ? "0.375rem" : 0 }}>
            {keywords.map((kw) => (
              <span key={kw} style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "9999px", background: "rgba(247,187,46,0.12)", border: "1px solid rgba(247,187,46,0.25)", color: "var(--foreground)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                {kw}
                <button type="button" onClick={() => setKeywords(keywords.filter((k) => k !== kw))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 0, fontSize: "0.8rem", lineHeight: 1 }}>&times;</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <input type="text" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
              placeholder="Add keyword..." style={{ ...input, flex: 1 }} />
          </div>
        </div>

        {/* OG Image */}
        <div>
          <p style={lbl}>Social image (OG)</p>
          <input type="text" value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="/uploads/..." style={input} />
          {ogImage && ogImage.startsWith("/uploads/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ogImage} alt="OG preview"
              style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: "4px", marginTop: "0.375rem", border: "1px solid var(--border)" }}
            />
          )}
        </div>

        {/* AI Optimize */}
        {lastOptimized && !confirmReoptimize ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
              Optimized: {new Date(lastOptimized).toLocaleDateString()}
            </p>
            <button type="button" onClick={() => setConfirmReoptimize(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem",
                padding: "0.4rem 0.75rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)", cursor: "pointer",
                fontSize: "0.75rem", fontWeight: 500,
              }}>
              <Sparkles style={{ width: 12, height: 12 }} /> Re-optimize with AI
            </button>
          </div>
        ) : confirmReoptimize ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <p style={{ fontSize: "0.72rem", color: "#F7BB2E", margin: 0, fontWeight: 500 }}>
              This will overwrite existing SEO fields.
            </p>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <button type="button" onClick={aiOptimize} disabled={optimizing}
                style={{
                  display: "flex", alignItems: "center", gap: "0.25rem",
                  padding: "0.3rem 0.6rem", borderRadius: "5px", border: "none",
                  background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer",
                  fontSize: "0.7rem", fontWeight: 600,
                }}>
                {optimizing ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : null}
                Yes, re-optimize
              </button>
              <button type="button" onClick={() => setConfirmReoptimize(false)}
                style={{
                  padding: "0.3rem 0.6rem", borderRadius: "5px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer", fontSize: "0.7rem",
                }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={aiOptimize} disabled={optimizing}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem",
              padding: "0.5rem 1rem", borderRadius: "6px", border: "none",
              background: "#F7BB2E", color: "#0D0D0D", cursor: optimizing ? "wait" : "pointer",
              fontSize: "0.8rem", fontWeight: 600,
            }}>
            {optimizing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Sparkles style={{ width: 14, height: 14 }} />}
            {optimizing ? "Optimizing..." : "AI Optimize"}
          </button>
        )}

        {/* Rewrite for keyword */}
        <div>
          <p style={lbl}>Rewrite for keyword</p>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            <input
              type="text"
              value={rewriteKeyword}
              onChange={(e) => setRewriteKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); rewriteForKeyword(); } }}
              placeholder="Target keyword..."
              style={{ ...input, flex: 1 }}
            />
            <button type="button" onClick={rewriteForKeyword} disabled={rewriting || !rewriteKeyword.trim()}
              style={{
                display: "flex", alignItems: "center", gap: "0.2rem",
                padding: "0.35rem 0.5rem", borderRadius: "6px", border: "none",
                background: rewriteKeyword.trim() ? "var(--foreground)" : "var(--border)",
                color: rewriteKeyword.trim() ? "var(--background)" : "var(--muted-foreground)",
                cursor: rewriteKeyword.trim() ? "pointer" : "default",
                fontSize: "0.7rem", fontWeight: 600, flexShrink: 0,
              }}>
              {rewriting ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 10, height: 10 }} />}
              Rewrite
            </button>
          </div>
          <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>
            AI rewrites meta title + description to target this keyword
          </p>
        </div>

        {/* Readability */}
        {readabilityScore !== null && (
          <div>
            <p style={lbl}>Readability</p>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                fontSize: "1.1rem", fontWeight: 700, fontFamily: "monospace",
                color: readabilityScore >= 60 ? "#4ade80" : readabilityScore >= 30 ? "#F7BB2E" : "#f87171",
              }}>
                {readabilityScore}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 2, background: "var(--border)" }}>
                  <div style={{
                    height: "100%", width: `${readabilityScore}%`, borderRadius: 2,
                    background: readabilityScore >= 60 ? "#4ade80" : readabilityScore >= 30 ? "#F7BB2E" : "#f87171",
                  }} />
                </div>
              </div>
              <span style={{ fontSize: "0.6rem", color: "var(--muted-foreground)" }}>
                {readabilityScore >= 60 ? "Easy" : readabilityScore >= 30 ? "Moderate" : "Hard"}
              </span>
            </div>
          </div>
        )}

        {/* Advanced */}
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", padding: 0 }}>
          {showAdvanced ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          Advanced
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <p style={lbl}>Canonical URL</p>
              <input type="text" value={canonical} onChange={(e) => setCanonical(e.target.value)}
                placeholder="https://... (default: self)" style={input} />
            </div>
            <div>
              <p style={lbl}>Robots</p>
              <CustomSelect
                value={robots}
                onChange={setRobots}
                options={[
                  { value: "index,follow", label: "index, follow (default)" },
                  { value: "noindex,follow", label: "noindex, follow" },
                  { value: "noindex,nofollow", label: "noindex, nofollow" },
                ]}
              />
            </div>

            {/* JSON-LD Structured Data */}
            <div>
              <p style={{ ...lbl, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Code2 style={{ width: 10, height: 10 }} /> Structured data (JSON-LD)
              </p>
              <CustomSelect
                value={jsonLdTemplate}
                onChange={(templateId) => {
                  setJsonLdTemplate(templateId);
                  if (!templateId) {
                    setJsonLd(null);
                    setJsonLdValues({});
                    return;
                  }
                  const tmpl = JSON_LD_TEMPLATES.find((t) => t.id === templateId);
                  if (tmpl) {
                    // Merge doc data with current SEO state for auto-fill
                    const enrichedData = {
                      ...doc.data,
                      _seo: { metaTitle, metaDescription: metaDesc, ogImage, keywords },
                    };
                    const auto = autoFillFields(tmpl, enrichedData);
                    const merged = { ...auto, ...jsonLdValues };
                    setJsonLdValues(merged);
                    setJsonLd(generateJsonLd(tmpl, merged));
                  }
                }}
                options={[
                  { value: "", label: "None" },
                  ...JSON_LD_TEMPLATES.map((t) => ({ value: t.id, label: `${t.label} — ${t.description}` })),
                ]}
              />
              {jsonLdTemplate && (() => {
                const tmpl = JSON_LD_TEMPLATES.find((t) => t.id === jsonLdTemplate);
                if (!tmpl) return null;
                const visibleFields = tmpl.fields.filter((f) => !f.hidden);
                return (
                  <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {visibleFields.length === 0 && (
                      <p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", margin: 0 }}>
                        All fields auto-filled from document + SEO data above.
                      </p>
                    )}
                    {visibleFields.map((f) => (
                      <div key={f.key}>
                        <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", margin: "0 0 0.15rem", fontWeight: 500 }}>
                          {f.label}{f.required ? " *" : ""}
                        </p>
                        <input
                          type="text"
                          value={jsonLdValues[f.key] ?? ""}
                          placeholder={f.placeholder}
                          onChange={(e) => {
                            const next = { ...jsonLdValues, [f.key]: e.target.value };
                            setJsonLdValues(next);
                            setJsonLd(generateJsonLd(tmpl, next));
                          }}
                          style={{ ...input, fontSize: "0.72rem", padding: "0.25rem 0.4rem" }}
                        />
                      </div>
                    ))}
                    {/* Preview */}
                    {jsonLd && (
                      <details style={{ marginTop: "0.25rem" }}>
                        <summary style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", cursor: "pointer" }}>
                          Preview JSON-LD
                        </summary>
                        <pre style={{
                          fontSize: "0.6rem", padding: "0.5rem", background: "var(--background)",
                          borderRadius: "4px", border: "1px solid var(--border)",
                          overflow: "auto", maxHeight: 150, margin: "0.25rem 0 0",
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {JSON.stringify(jsonLd, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Google Preview — collapsible */}
        <button type="button" onClick={() => setShowPreview(!showPreview)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", padding: 0 }}>
          {showPreview ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          Google preview
        </button>
        {showPreview && (
          <div style={{ padding: "0.75rem", background: "#fff", borderRadius: "8px", fontFamily: "Arial, sans-serif" }}>
            <p style={{ fontSize: "0.7rem", color: "#202124", margin: 0 }}>{siteUrl} › ...</p>
            <p style={{ fontSize: "0.9rem", color: "#1a0dab", margin: "0.15rem 0", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {metaTitle || title || "Page title"}
            </p>
            <p style={{ fontSize: "0.72rem", color: "#4d5156", margin: 0, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
              {metaDesc || "No meta description set."}
            </p>
          </div>
        )}

        {/* Social preview (Facebook/LinkedIn) — collapsible */}
        <button type="button" onClick={() => setShowSocialPreview(!showSocialPreview)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", padding: 0 }}>
          {showSocialPreview ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          Social preview
        </button>
        {showSocialPreview && (
          <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #ddd", background: "#f0f2f5", fontFamily: "-apple-system, sans-serif" }}>
            {ogImage && ogImage.startsWith("/uploads/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ogImage} alt="Social preview" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: 130, background: "#e4e6eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "#65676b" }}>No image set</span>
              </div>
            )}
            <div style={{ padding: "0.5rem 0.75rem" }}>
              <p style={{ fontSize: "0.6rem", color: "#65676b", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {siteUrl}
              </p>
              <p style={{ fontSize: "0.82rem", color: "#1c1e21", margin: "0.15rem 0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {seo.ogTitle || metaTitle || title || "Page title"}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#65676b", margin: 0, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                {seo.ogDescription || metaDesc || "No description set."}
              </p>
            </div>
          </div>
        )}

        {/* Score details */}
        {score && score.details.length > 0 && (
          <div>
            <p style={lbl}>Checks</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {score.details.map((d) => (
                <div key={d.rule} style={{ display: "flex", alignItems: "flex-start", gap: "0.375rem", fontSize: "0.72rem" }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>
                    {d.status === "pass" ? "🟢" : d.status === "warn" ? "🟡" : "🔴"}
                  </span>
                  <span style={{ color: "var(--muted-foreground)" }}>{d.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
