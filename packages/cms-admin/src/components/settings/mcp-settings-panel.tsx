"use client";

import { useState, useEffect } from "react";
import { Check, Copy, Plus, Trash2, Key, RefreshCw, Server, Power, PowerOff, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/ui/section-heading";

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
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);

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
      toast.success("API key created");
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
      toast.success("API key removed");
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
        <SectionHeading>Endpoints</SectionHeading>
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
          <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>API Keys</h2>
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
              {confirmRemoveKey === k.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <button type="button" onClick={() => setConfirmRemoveKey(null)}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => { handleRemove(k.id); setConfirmRemoveKey(null); }} disabled={removing === k.id}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.7rem", cursor: "pointer", opacity: removing === k.id ? 0.5 : 1 }}>
                    {removing === k.id ? "Removing…" : "Confirm"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveKey(k.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    padding: "0.35rem 0.6rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer",
                  }}
                  title="Remove API key"
                >
                  <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                  Remove
                </button>
              )}
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

      {/* External MCP Servers */}
      <ExternalMcpServers />
    </div>
  );
}

/* ─── External MCP Servers for AI Agents ──────────────────────── */

interface McpServerDef {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

const PRESETS = [
  { name: "Agent Memory", command: "npx", args: ["-y", "@anthropic/mcp-memory"], description: "Persistent memory between agent runs" },
  { name: "Brave Search", command: "npx", args: ["-y", "@anthropic/mcp-brave-search"], description: "Web search (requires BRAVE_API_KEY)", envHint: "BRAVE_API_KEY" },
  { name: "GitHub", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], description: "Access repos, issues, PRs", envHint: "GITHUB_PERSONAL_ACCESS_TOKEN" },
  { name: "Filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/agent-workspace"], description: "Read/write files in a workspace" },
];

function ExternalMcpServers() {
  const [servers, setServers] = useState<McpServerDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommand, setNewCommand] = useState("npx");
  const [newArgs, setNewArgs] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvVal, setNewEnvVal] = useState("");
  const [newEnvPairs, setNewEnvPairs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editError, setEditError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cms/mcp-servers")
      .then((r) => r.json())
      .then((d: { servers: McpServerDef[] }) => { setServers(d.servers ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleEnabled(id: string, enabled: boolean) {
    const res = await fetch("/api/cms/mcp-servers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    if (res.ok) {
      setServers((prev) => prev.map((s) => s.id === id ? { ...s, enabled } : s));
    }
  }

  async function removeServer(id: string) {
    await fetch("/api/cms/mcp-servers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setServers((prev) => prev.filter((s) => s.id !== id));
  }

  async function addServer(name: string, command: string, args: string[], env: Record<string, string>) {
    setSaving(true);
    const res = await fetch("/api/cms/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, command, args, env, enabled: true }),
    });
    if (res.ok) {
      const server = await res.json();
      setServers((prev) => [...prev, server]);
    }
    setSaving(false);
    setShowAdd(false);
    setNewName("");
    setNewCommand("npx");
    setNewArgs("");
    setNewEnvPairs({});
  }

  function addPreset(preset: typeof PRESETS[0]) {
    const env: Record<string, string> = {};
    if (preset.envHint) env[preset.envHint] = "";
    addServer(preset.name, preset.command, preset.args, env);
  }

  function startEdit(server: McpServerDef) {
    setEditingId(server.id);
    setEditJson(JSON.stringify(server, null, 2));
    setEditError("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditError("");
    let parsed: McpServerDef;
    try {
      parsed = JSON.parse(editJson) as McpServerDef;
    } catch {
      setEditError("Invalid JSON");
      return;
    }
    const res = await fetch("/api/cms/mcp-servers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsed, id: editingId }),
    });
    if (res.ok) {
      const updated = await res.json() as McpServerDef;
      setServers((prev) => prev.map((s) => s.id === editingId ? updated : s));
      setEditingId(null);
    } else {
      setEditError("Save failed");
    }
  }

  if (loading) return null;

  return (
    <section style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div>
          <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>External MCP Servers</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>
            Connect external tools that AI agents can use during content generation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            padding: "0.35rem 0.75rem", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--foreground)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500,
          }}
        >
          <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> Add server
        </button>
      </div>

      {/* Server list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {servers.map((s) => (
          <div key={s.id} style={{ borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", opacity: s.enabled ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.enabled ? "#22c55e" : "#6b7280", flexShrink: 0 }} />
              <Server style={{ width: "1rem", height: "1rem", color: s.enabled ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>{s.name}</p>
                <code style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", wordBreak: "break-all" }}>
                  {s.command} {s.args.join(" ")}
                </code>
                {s.env && Object.keys(s.env).length > 0 && (
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                    {Object.entries(s.env).map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: "0.6rem", fontFamily: "monospace",
                        padding: "0.1rem 0.35rem", borderRadius: "3px",
                        background: v ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "color-mix(in srgb, var(--destructive) 10%, transparent)",
                        color: v ? "var(--primary)" : "var(--destructive)",
                      }}>
                        {k}{v ? " ✓" : " (not set)"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => startEdit(s)} title="Edit JSON config"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                <Pencil style={{ width: "0.8rem", height: "0.8rem" }} />
              </button>
              <button type="button" onClick={() => toggleEnabled(s.id, !s.enabled)} title={s.enabled ? "Disable server" : "Enable server"}
                style={{ background: "none", border: "none", cursor: "pointer", color: s.enabled ? "var(--primary)" : "var(--muted-foreground)", padding: "0.25rem" }}>
                {s.enabled ? <Power style={{ width: "0.9rem", height: "0.9rem" }} /> : <PowerOff style={{ width: "0.9rem", height: "0.9rem" }} />}
              </button>
              {confirmDeleteId === s.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <button type="button" onClick={() => setConfirmDeleteId(null)}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => { removeServer(s.id); setConfirmDeleteId(null); }}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.7rem", cursor: "pointer" }}>
                    Confirm
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(s.id)} title="Remove server"
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    padding: "0.35rem 0.6rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer",
                  }}>
                  <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                  Remove
                </button>
              )}
            </div>

            {/* Inline JSON editor */}
            {editingId === s.id && (
              <div style={{ padding: "0 0.75rem 0.75rem", borderTop: "1px solid var(--border)", marginTop: "0" }}>
                <textarea
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                  rows={Math.max(6, editJson.split("\n").length + 1)}
                  style={{
                    width: "100%", marginTop: "0.75rem",
                    padding: "0.625rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.72rem",
                    fontFamily: "monospace", lineHeight: 1.5,
                    outline: "none", resize: "vertical", boxSizing: "border-box",
                  }}
                />
                {editError && <p style={{ fontSize: "0.72rem", color: "var(--destructive)", marginTop: "0.25rem" }}>{editError}</p>}
                <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
                  <button type="button" onClick={saveEdit}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {servers.length === 0 && !showAdd && (
          <div style={{ padding: "1.25rem", borderRadius: "8px", border: "1px dashed var(--border)", textAlign: "center" }}>
            <Server style={{ width: "1.5rem", height: "1.5rem", color: "var(--muted-foreground)", margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>No external MCP servers configured.</p>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>Add one from the presets below or configure a custom server.</p>
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>Add MCP Server</p>
            <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}>
              <X style={{ width: "0.8rem", height: "0.8rem" }} />
            </button>
          </div>

          {/* Quick presets */}
          <div>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>Quick add:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {PRESETS.filter((p) => !servers.some((s) => s.name === p.name)).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => addPreset(preset)}
                  disabled={saving}
                  style={{
                    padding: "0.35rem 0.625rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--foreground)", fontSize: "0.72rem", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "0.3rem",
                  }}
                  title={preset.description}
                >
                  <Plus style={{ width: "0.6rem", height: "0.6rem" }} /> {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border)" }} />

          {/* Custom server form */}
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>Or add a custom server:</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Server"
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ width: "80px" }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>Command</label>
              <input type="text" value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="npx"
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>Arguments (space-separated)</label>
            <input type="text" value={newArgs} onChange={(e) => setNewArgs(e.target.value)} placeholder="-y @anthropic/mcp-memory"
              style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Env vars */}
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>Environment variables</label>
            {Object.entries(newEnvPairs).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: "0.375rem", marginBottom: "0.25rem" }}>
                <code style={{ fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "var(--secondary)", borderRadius: "4px", minWidth: "120px" }}>{k}</code>
                <input type="text" value={v} onChange={(e) => setNewEnvPairs((p) => ({ ...p, [k]: e.target.value }))} placeholder="value"
                  style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
                <button type="button" onClick={() => setNewEnvPairs((p) => { const n = { ...p }; delete n[k]; return n; })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--destructive)", padding: "0.2rem" }}>
                  <X style={{ width: "0.7rem", height: "0.7rem" }} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <input type="text" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} placeholder="KEY_NAME"
                style={{ width: "120px", padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
              <input type="text" value={newEnvVal} onChange={(e) => setNewEnvVal(e.target.value)} placeholder="value"
                style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
              <button type="button" onClick={() => { if (newEnvKey.trim()) { setNewEnvPairs((p) => ({ ...p, [newEnvKey]: newEnvVal })); setNewEnvKey(""); setNewEnvVal(""); } }}
                style={{ padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
                Add
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={saving || !newName.trim() || !newArgs.trim()}
            onClick={() => addServer(newName, newCommand, newArgs.split(/\s+/).filter(Boolean), newEnvPairs)}
            style={{
              padding: "0.45rem 1rem", borderRadius: "7px", border: "none",
              background: "var(--primary)", color: "var(--primary-foreground)",
              fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
              opacity: saving || !newName.trim() || !newArgs.trim() ? 0.6 : 1,
            }}
          >
            {saving ? "Adding…" : "Add server"}
          </button>
        </div>
      )}
    </section>
  );
}
