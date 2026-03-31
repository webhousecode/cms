"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check } from "lucide-react";

/**
 * Inline Settings Update (ISU) — Media Processing
 *
 * A compact, self-contained settings form that loads and saves
 * media processing config directly — no navigation needed.
 */
export function ISUMediaProcessing() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [widths, setWidths] = useState("400, 800, 1200, 1600");
  const [quality, setQuality] = useState(80);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((cfg: Record<string, unknown>) => {
        setEnabled((cfg.mediaAutoOptimize as boolean) ?? true);
        const w = cfg.mediaVariantWidths as number[] | undefined;
        if (w?.length) setWidths(w.join(", "));
        setQuality((cfg.mediaWebpQuality as number) ?? 80);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const parsedWidths = widths
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mediaAutoOptimize: enabled,
        mediaVariantWidths: parsedWidths.length > 0 ? parsedWidths : [400, 800, 1200, 1600],
        mediaWebpQuality: quality,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [enabled, widths, quality]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0", color: "var(--muted-foreground)", fontSize: "0.72rem" }}>
        <Loader2 className="animate-spin" style={{ width: "0.7rem", height: "0.7rem" }} />
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{
      marginTop: "0.5rem", padding: "0.75rem",
      borderRadius: "8px", border: "1px solid var(--border)",
      background: "var(--background)",
      display: "flex", flexDirection: "column", gap: "0.6rem",
    }}>
      {/* Toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ accentColor: "var(--primary)" }}
        />
        <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>Generate WebP variants on upload</span>
      </label>

      {/* Variant widths */}
      <div>
        <label style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--muted-foreground)", display: "block", marginBottom: "0.2rem" }}>
          Variant widths (px)
        </label>
        <input
          type="text"
          value={widths}
          onChange={(e) => setWidths(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "0.3rem 0.5rem", borderRadius: "5px",
            border: "1px solid var(--border)", background: "var(--card)",
            fontSize: "0.72rem", color: "var(--foreground)", fontFamily: "monospace",
          }}
        />
      </div>

      {/* Quality slider */}
      <div>
        <label style={{ fontSize: "0.68rem", fontWeight: 500, color: "var(--muted-foreground)" }}>
          WebP quality: {quality}
        </label>
        <input
          type="range"
          min={10} max={100} step={5}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--primary)", marginTop: "0.2rem" }}
        />
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          alignSelf: "flex-start",
          display: "flex", alignItems: "center", gap: "0.3rem",
          padding: "0.3rem 0.7rem", borderRadius: "5px",
          border: "none", cursor: "pointer",
          fontSize: "0.7rem", fontWeight: 600,
          background: saved ? "rgb(74 222 128)" : "var(--primary)",
          color: saved ? "#000" : "#fff",
          transition: "background 0.2s",
        }}
      >
        {saving ? (
          <Loader2 className="animate-spin" style={{ width: "0.65rem", height: "0.65rem" }} />
        ) : saved ? (
          <Check style={{ width: "0.65rem", height: "0.65rem" }} />
        ) : null}
        {saved ? "Saved" : saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
