"use client";

import { useState, useEffect } from "react";
import { Check, Copy, Plus, Trash2, Key, RefreshCw } from "lucide-react";

interface McpApiKeyMasked {
  id: string;
  label: string;
  scopes: string[];
  masked: string;
}

interface McpConfigMasked {
  keys: McpApiKeyMasked[];
}

const ALL_SCOPES = ["read", "write", "publish", "deploy", "ai"] as const;

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  read:    "Read content, list collections, search",
  write:   "Create and update documents",
  publish: "Publish and unpublish documents",
  deploy:  "Trigger site builds",
  ai:      "Generate and rewrite content with AI",
};

function generateKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.2rem",
        padding: "0.2rem 0.5rem", borderRadius: "5px",
        border: "1px solid var(--border)", background: "transparent",
        color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer",
        transition: "all 120ms",
      }}
    >
      {copied ? <Check style={{ width: "0.7rem", height: "0.7rem" }} /> : <Copy style={{ width: "0.7rem", height: "0.7rem" }} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function MCPSettingsPanel() {
  const [config, setConfig] = useState<McpConfigMasked>({ keys: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  // New key form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>([...ALL_SCOPES]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicEndpoint = `${origin}/api/mcp`;
  const adminEndpoint  = `${origin}/api/mcp/admin`;

  useEffect(() => {
    fetch("/api/admin/mcp-config")
      .then((r) => r.json())
      .then((d: McpConfigMasked) => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!newLabel.trim()) { setAddError("Label is required"); return; }
    if (!newKey.trim())   { setAddError("API key is required"); return; }
    if (newScopes.length === 0) { setAddError("Select at least one scope"); return; }

    setAdding(true);
    setAddError("");
    const res = await fetch("/api/admin/mcp-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", key: newKey, label: newLabel, scopes: newScopes }),
    });
    const data = (await res.json()) as McpConfigMasked & { error?: string };
    if (!res.ok) {
      setAddError(data.error ?? "Failed to add key");
    } else {
      setConfig(data);
      setShowAddForm(false);
      setNewLabel("");
      setNewKey("");
      setNewScopes([...ALL_SCOPES]);
    }
    setAdding(false);
  }

  async function handleRemove(id: string) {
    setRemoving(id);
    setError("");
    const res = await fetch("/api/admin/mcp-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
    });
    const data = (await res.json()) as McpConfigMasked & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to remove key");
    } else {
      setConfig(data);
    }
    setRemoving(null);
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
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Endpoints */}
      <section>
        <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem" }}>Endpoints</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[
            { label: "Public (read-only, rate-limited)", url: publicEndpoint },
            { label: "Admin (authenticated, full access)", url: adminEndpoint },
          ].map(({ label, url }) => (
            <div key={url} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "0.15rem" }}>{label}</p>
                <code style={{ fontSize: "0.75rem", color: "var(--foreground)", wordBreak: "break-all" }}>{url}</code>
              </div>
              <CopyButton text={url} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.6rem" }}>
          Add the admin endpoint to Claude iOS under Settings → Claude for Work → MCP Servers, or in your Cursor <code style={{ fontSize: "0.7rem" }}>mcp.json</code>.
          Use a Bearer token from the API keys below.
        </p>
      </section>

      {/* API Keys */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600 }}>API Keys</h3>
          <button
            type="button"
            onClick={() => { setShowAddForm(true); setNewKey(generateKey()); }}
            style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              padding: "0.35rem 0.75rem", borderRadius: "6px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--foreground)", fontSize: "0.75rem", cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> New key
          </button>
        </div>

        {error && (
          <p style={{ fontSize: "0.8rem", color: "var(--destructive)", marginBottom: "0.5rem" }}>{error}</p>
        )}

        {config.keys.length === 0 && !showAddForm && (
          <div style={{ padding: "1.5rem", borderRadius: "8px", border: "1px dashed var(--border)", textAlign: "center" }}>
            <Key style={{ width: "1.5rem", height: "1.5rem", color: "var(--muted-foreground)", margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>No API keys configured yet. Create one to enable authenticated MCP access.</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {config.keys.map((k) => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>{k.label}</p>
                  <code style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{k.masked}</code>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                  {k.scopes.map((s) => (
                    <span key={s} style={{
                      fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px",
                      background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                      color: "var(--primary)", fontFamily: "monospace",
                    }}>{s}</span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(k.id)}
                disabled={removing === k.id}
                style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.35rem 0.6rem", borderRadius: "6px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer",
                  opacity: removing === k.id ? 0.5 : 1,
                }}
              >
                <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                {removing === k.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>

        {/* Add key form */}
        {showAddForm && (
          <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>New API key</p>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Claude iOS, Cursor, n8n"
                style={fieldStyle}
              />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Key</label>
                <button
                  type="button"
                  onClick={() => setNewKey(generateKey())}
                  style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
                >
                  <RefreshCw style={{ width: "0.65rem", height: "0.65rem" }} /> Regenerate
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Paste or generate a key"
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <CopyButton text={newKey} />
              </div>
              <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                Copy this now — it won&apos;t be shown again after saving.
              </p>
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>Scopes</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {ALL_SCOPES.map((scope) => (
                  <label key={scope} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={newScopes.includes(scope)}
                      onChange={(e) => {
                        setNewScopes((prev) =>
                          e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)
                        );
                      }}
                      style={{ marginTop: "0.1rem" }}
                    />
                    <span>
                      <span style={{ fontSize: "0.8rem", fontFamily: "monospace", fontWeight: 500 }}>{scope}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginLeft: "0.35rem" }}>— {SCOPE_DESCRIPTIONS[scope]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {addError && (
              <p style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{addError}</p>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.45rem 1rem", borderRadius: "7px", border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  fontSize: "0.85rem", fontWeight: 600, cursor: adding ? "wait" : "pointer",
                }}
              >
                <Check style={{ width: "0.85rem", height: "0.85rem" }} />
                {adding ? "Saving…" : "Save key"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddError(""); }}
                style={{
                  padding: "0.45rem 0.875rem", borderRadius: "7px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
        Keys are stored in <code style={{ fontSize: "0.7rem" }}>_data/mcp-config.json</code> in your project directory.
        Environment variables <code style={{ fontSize: "0.7rem" }}>MCP_API_KEY</code> / <code style={{ fontSize: "0.7rem" }}>MCP_API_KEY_1..5</code> are used as fallback.
      </p>
    </div>
  );
}
