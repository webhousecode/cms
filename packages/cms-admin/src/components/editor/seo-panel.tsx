"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { calculateSeoScore, type SeoFields, type SeoScoreResult } from "@/lib/seo/score";
import { CustomSelect } from "@/components/ui/custom-select";
import { toast } from "sonner";

interface Props {
  doc: { slug: string; data: Record<string, unknown> };
  onUpdate: (seo: SeoFields) => void;
  onSave: () => void;
  onClose: () => void;
}

export function SeoPanel({ doc, onUpdate, onSave, onClose }: Props) {
  const seo: SeoFields = (doc.data._seo as SeoFields) ?? {};
  const [metaTitle, setMetaTitle] = useState(seo.metaTitle ?? "");
  const [metaDesc, setMetaDesc] = useState(seo.metaDescription ?? "");
  const [keywords, setKeywords] = useState<string[]>(seo.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [ogImage, setOgImage] = useState(seo.ogImage ?? "");
  const [robots, setRobots] = useState(seo.robots ?? "index,follow");
  const [lastOptimized, setLastOptimized] = useState(seo.lastOptimized ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [confirmReoptimize, setConfirmReoptimize] = useState(false);
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
        score: score?.score,
        scoreDetails: score?.details,
        lastOptimized: lastOptimized || undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaTitle, metaDesc, keywords, ogImage, robots, score]);

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
          // Auto-fill OG image from content (always re-extract on optimize)
          {
            const rawContent = String(doc.data.content ?? doc.data.body ?? "");
            // Try dedicated image fields first (cleanest source)
            const fieldImg = String(doc.data.heroImage ?? doc.data.coverImage ?? doc.data.image ?? "");
            let picked = "";
            if (fieldImg && fieldImg.startsWith("/uploads/")) {
              picked = fieldImg;
            } else {
              // Extract from markdown: ![alt](/uploads/file.jpg "title") — capture only the path
              const mdMatch = rawContent.match(/!\[[^\]]*\]\((\/uploads\/[^\s"]+)/);
              if (mdMatch) picked = mdMatch[1];
              else {
                // Extract from HTML: <img src="/uploads/file.jpg">
                const htmlMatch = rawContent.match(/<img[^>]+src="(\/uploads\/[^"]+)"/);
                if (htmlMatch) picked = htmlMatch[1];
              }
            }
            // Only set if it's a valid /uploads/ path
            if (picked && picked.startsWith("/uploads/")) {
              setOgImage(picked);
            }
          }
          setLastOptimized(new Date().toISOString());
          setConfirmReoptimize(false);
          // Auto-save after a short delay to let state propagate
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
          <button type="button" onClick={onSave}
            style={{
              padding: "0.25rem 0.5rem", borderRadius: "5px", border: "none",
              background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer",
              fontSize: "0.7rem", fontWeight: 600,
            }}>
            Save
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
          <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} placeholder="Compelling description for search results..." style={{ ...input, minHeight: 60, resize: "vertical" }} maxLength={200} />
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

        {/* Advanced */}
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", padding: 0 }}>
          {showAdvanced ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
          Advanced
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
