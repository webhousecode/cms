"use client";

import { useState, useEffect, FormEvent } from "react";
import { Check, Sparkles, AlertTriangle } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

interface AiDefaults {
  aiInteractivesModel: string;
  aiInteractivesMaxTokens: number;
  aiContentModel: string;
  aiContentMaxTokens: number;
}

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — fast, affordable" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4.5 — best for code" },
];

const TOKEN_OPTIONS = [
  { value: "2048", label: "2,048 — short content" },
  { value: "4096", label: "4,096 — standard content" },
  { value: "8192", label: "8,192 — long content" },
  { value: "16384", label: "16,384 — large HTML/code" },
];

const fieldStyle = {
  padding: "0.5rem 0.75rem",
  borderRadius: "7px",
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: "0.8rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

export function AIDefaultsPanel() {
  const [config, setConfig] = useState<AiDefaults>({
    aiInteractivesModel: "claude-sonnet-4-20250514",
    aiInteractivesMaxTokens: 16384,
    aiContentModel: "claude-haiku-4-5-20251001",
    aiContentMaxTokens: 4096,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d: AiDefaults) => {
        setConfig((prev) => ({ ...prev, ...d }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiInteractivesModel: config.aiInteractivesModel,
        aiInteractivesMaxTokens: config.aiInteractivesMaxTokens,
        aiContentModel: config.aiContentModel,
        aiContentMaxTokens: config.aiContentMaxTokens,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</p>;
  }

  return (
    <form onSubmit={handleSave}>
      {/* Interactives section */}
      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
          Interactives (Generate &amp; Edit with AI)
        </h3>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used when creating or editing HTML interactives. Sonnet is recommended for complex code generation. Higher token limits prevent truncated output on large files.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiInteractivesModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens
            </label>
            <CustomSelect
              value={String(config.aiInteractivesMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiInteractivesMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Content writing section */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
          Content Writing (Chat, Generate, Rewrite)
        </h3>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Used for in-editor AI chat, article generation, and text rewriting. Haiku is usually sufficient for text content.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Model
            </label>
            <CustomSelect
              value={config.aiContentModel}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentModel: v }))}
              options={MODEL_OPTIONS}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>
              Max tokens
            </label>
            <CustomSelect
              value={String(config.aiContentMaxTokens)}
              onChange={(v) => setConfig((c) => ({ ...c, aiContentMaxTokens: parseInt(v, 10) }))}
              options={TOKEN_OPTIONS}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", marginBottom: "1.25rem", fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
        <AlertTriangle style={{ width: "0.875rem", height: "0.875rem", color: "#eab308", flexShrink: 0 }} />
        <span>Changing models affects AI quality and cost. Sonnet produces better code but costs more per request. These are defaults — the built-in values are recommended for most use cases.</span>
      </div>

      <button
        type="submit"
        disabled={saving}
        style={{
          display: "flex", alignItems: "center", gap: "0.375rem",
          padding: "0.5rem 1rem", borderRadius: "7px", border: "none",
          background: saved ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--primary)",
          color: saved ? "var(--primary)" : "var(--primary-foreground)",
          fontSize: "0.875rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
          transition: "all 200ms",
        }}
      >
        {saved
          ? <><Check style={{ width: "0.9rem", height: "0.9rem" }} /> Saved</>
          : saving ? "Saving…" : <><Sparkles style={{ width: "0.9rem", height: "0.9rem" }} /> Save AI defaults</>
        }
      </button>
    </form>
  );
}
