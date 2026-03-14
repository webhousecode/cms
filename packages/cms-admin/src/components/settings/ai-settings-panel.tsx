"use client";

import { useState, useEffect, FormEvent } from "react";
import { Sparkles, Check, ExternalLink } from "lucide-react";

interface AiConfigMasked {
  defaultProvider: "anthropic" | "openai" | "gemini";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  webSearchProvider?: "brave" | "tavily";
  webSearchApiKey?: string;
}

const PROVIDERS = [
  {
    id: "anthropic" as const,
    label: "Anthropic (Claude)",
    field: "anthropicApiKey" as const,
    placeholder: "sk-ant-api03-…",
    docsUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai" as const,
    label: "OpenAI (GPT-4o)",
    field: "openaiApiKey" as const,
    placeholder: "sk-proj-…",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini" as const,
    label: "Google Gemini",
    field: "geminiApiKey" as const,
    placeholder: "AIza…",
    docsUrl: "https://aistudio.google.com/api-keys",
  },
] as const;

export function AISettingsPanel() {
  const [config, setConfig] = useState<AiConfigMasked>({ defaultProvider: "anthropic" });
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ai-config")
      .then((r) => r.json())
      .then((d: AiConfigMasked) => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);

    const body: Record<string, string> = {
      defaultProvider: config.defaultProvider,
      webSearchProvider: config.webSearchProvider ?? "brave",
      ...editing,
    };

    const res = await fetch("/api/admin/ai-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as AiConfigMasked & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Save failed");
    } else {
      setConfig(data);
      setEditing({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  const fieldStyle = {
    padding: "0.5rem 0.75rem",
    borderRadius: "7px",
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.8rem",
    fontFamily: "monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  if (loading) {
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>Loading…</p>;
  }

  return (
    <form onSubmit={handleSave}>
      {/* Default provider */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.5rem" }}>
          Default provider
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setConfig((c) => ({ ...c, defaultProvider: p.id }))}
              style={{
                padding: "0.35rem 0.875rem",
                borderRadius: "6px",
                border: `1px solid ${config.defaultProvider === p.id ? "var(--primary)" : "var(--border)"}`,
                background: config.defaultProvider === p.id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                color: config.defaultProvider === p.id ? "var(--primary)" : "var(--muted-foreground)",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: config.defaultProvider === p.id ? 600 : 400,
                transition: "all 120ms",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* API key fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
        {PROVIDERS.map((p) => {
          const currentMasked = config[p.field];
          const isEditing = p.field in editing;
          const hasKey = !!currentMasked;
          return (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{p.label} API key</label>
                {hasKey && !isEditing && (
                  <span style={{
                    fontSize: "0.65rem", fontFamily: "monospace",
                    padding: "0.1rem 0.4rem", borderRadius: "4px",
                    background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                    color: "var(--primary)",
                  }}>configured</span>
                )}
                <a
                  href={p.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: "0.2rem", marginLeft: "auto" }}
                >
                  Get key <ExternalLink style={{ width: "0.6rem", height: "0.6rem" }} />
                </a>
              </div>
              {isEditing ? (
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <input
                    type="text"
                    value={editing[p.field] ?? ""}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [p.field]: e.target.value }))}
                    placeholder={p.placeholder}
                    autoFocus
                    style={{ ...fieldStyle, flex: 1 }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[p.field]; return n; })}
                    style={{ padding: "0.5rem 0.625rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing((prev) => ({ ...prev, [p.field]: "" }))}
                  style={{
                    ...fieldStyle,
                    textAlign: "left",
                    cursor: "pointer",
                    color: hasKey ? "var(--muted-foreground)" : "var(--muted-foreground)",
                    opacity: hasKey ? 1 : 0.6,
                  }}
                >
                  {hasKey ? currentMasked : `Click to set ${p.label} key…`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Web Search */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
          Web Search (for AI agents)
        </h3>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
          Enables the <code style={{ fontSize: "0.7rem" }}>web_search</code> tool for agents with &ldquo;Web search&rdquo; enabled.
        </p>

        {/* Provider selector */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {([
            { id: "brave" as const, label: "Brave Search", url: "https://api.search.brave.com/register" },
            { id: "tavily" as const, label: "Tavily", url: "https://tavily.com/" },
          ]).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setConfig((c) => ({ ...c, webSearchProvider: p.id }))}
              style={{
                padding: "0.35rem 0.875rem",
                borderRadius: "6px",
                border: `1px solid ${(config.webSearchProvider ?? "brave") === p.id ? "var(--primary)" : "var(--border)"}`,
                background: (config.webSearchProvider ?? "brave") === p.id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                color: (config.webSearchProvider ?? "brave") === p.id ? "var(--primary)" : "var(--muted-foreground)",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontWeight: (config.webSearchProvider ?? "brave") === p.id ? 600 : 400,
                transition: "all 120ms",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* API key field */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>
              {(config.webSearchProvider ?? "brave") === "brave" ? "Brave" : "Tavily"} API key
            </label>
            {config.webSearchApiKey && !("webSearchApiKey" in editing) && (
              <span style={{
                fontSize: "0.65rem", fontFamily: "monospace",
                padding: "0.1rem 0.4rem", borderRadius: "4px",
                background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                color: "var(--primary)",
              }}>configured</span>
            )}
          </div>
          {"webSearchApiKey" in editing ? (
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <input
                type="text"
                value={editing.webSearchApiKey ?? ""}
                onChange={(e) => setEditing((prev) => ({ ...prev, webSearchApiKey: e.target.value }))}
                placeholder={(config.webSearchProvider ?? "brave") === "brave" ? "BSA…" : "tvly-…"}
                autoFocus
                style={{ ...fieldStyle, flex: 1 }}
                onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
              <button
                type="button"
                onClick={() => setEditing((prev) => { const n = { ...prev }; delete n.webSearchApiKey; return n; })}
                style={{ padding: "0.5rem 0.625rem", borderRadius: "7px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing((prev) => ({ ...prev, webSearchApiKey: "" }))}
              style={{ ...fieldStyle, textAlign: "left", cursor: "pointer", color: "var(--muted-foreground)", opacity: config.webSearchApiKey ? 1 : 0.6 }}
            >
              {config.webSearchApiKey ? config.webSearchApiKey : `Click to set API key…`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p style={{ fontSize: "0.8rem", color: "var(--destructive)", marginBottom: "0.75rem" }}>{error}</p>
      )}

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
          : saving ? "Saving…" : <><Sparkles style={{ width: "0.9rem", height: "0.9rem" }} /> Save AI settings</>
        }
      </button>

      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.75rem" }}>
        Keys are stored in <code style={{ fontSize: "0.7rem" }}>_data/ai-config.json</code> in your project directory — not in environment variables.
      </p>
    </form>
  );
}
