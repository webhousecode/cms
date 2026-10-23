"use client";

import { Fragment, useState, useEffect } from "react";
import { Check, Copy, Plus, Trash2, Key, RefreshCw, Server, Power, PowerOff, X, Pencil, Braces } from "lucide-react";
import { toast } from "sonner";
import { SectionHeading } from "@/components/ui/section-heading";
import { Checkbox } from "@/components/ui/checkbox-styled";
import { useT } from "@/lib/i18n-context";

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
  read:    "integrations.mcp.scopeRead",
  write:   "integrations.mcp.scopeWrite",
  publish: "integrations.mcp.scopePublish",
  deploy:  "integrations.mcp.scopeDeploy",
  ai:      "integrations.mcp.scopeAi",
};

/** Renders a translated sentence whose {placeholders} are React nodes (e.g. <code>). */
function fillNodes(template: string, nodes: Record<string, React.ReactNode>): React.ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
}

function generateKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      data-testid="mcp-copy-btn"
      type="button"
      title={t("integrations.mcp.copyToClipboard")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        width: "32px", height: "32px", borderRadius: "6px",
        border: "1px solid var(--border)", background: "transparent",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)", flexShrink: 0,
      }}
    >
      {copied ? <Check style={{ width: "0.85rem", height: "0.85rem" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
    </button>
  );
}

export function MCPSettingsPanel() {
  const t = useT();
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
  const publicEndpoint = `${origin}/api/mcp`; // i18n-ignore: URL
  const adminEndpoint  = `${origin}/api/mcp/admin`; // i18n-ignore: URL

  useEffect(() => {
    fetch("/api/admin/mcp-config")
      .then((r) => r.json())
      .then((d: McpConfigMasked) => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!newLabel.trim()) { setAddError(t("integrations.mcp.labelRequired")); return; }
    if (!newKey.trim())   { setAddError(t("integrations.mcp.keyRequired")); return; }
    if (newScopes.length === 0) { setAddError(t("integrations.mcp.scopeRequired")); return; }

    setAdding(true);
    setAddError("");
    const res = await fetch("/api/admin/mcp-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", key: newKey, label: newLabel, scopes: newScopes }),
    });
    const data = (await res.json()) as McpConfigMasked & { error?: string };
    if (!res.ok) {
      setAddError(data.error ?? t("integrations.mcp.addFailed"));
    } else {
      setConfig(data);
      setShowAddForm(false);
      setNewLabel("");
      setNewKey("");
      setNewScopes([...ALL_SCOPES]);
      toast.success(t("integrations.mcp.keyCreated"));
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
      setError(data.error ?? t("integrations.mcp.removeFailed"));
    } else {
      setConfig(data);
      toast.success(t("integrations.mcp.keyRemoved"));
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
    return <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{t("integrations.mcp.loading")}</p>;
  }

  return (
    <div data-testid="panel-mcp" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Endpoints */}
      <section>
        <SectionHeading>{t("integrations.mcp.endpoints")}</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[
            { label: t("integrations.mcp.publicEndpoint"), url: publicEndpoint },
            { label: t("integrations.mcp.adminEndpoint"), url: adminEndpoint },
          ].map(({ label, url }) => (
            <div data-testid="mcp-endpoint-item" key={url} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "0.15rem" }}>{label}</p>
                <code style={{ fontSize: "0.75rem", color: "var(--foreground)", wordBreak: "break-all" }}>{url}</code>
              </div>
              <CopyButton text={url} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.6rem" }}>
          {fillNodes(t("integrations.mcp.endpointsHelp"), { file: <code style={{ fontSize: "0.7rem" }}>mcp.json</code> })}
        </p>
      </section>

      {/* API Keys */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>{t("integrations.mcp.apiKeys")}</h2>
          <button
            data-testid="mcp-new-key-button"
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
            <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> {t("integrations.mcp.newKey")}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: "0.8rem", color: "var(--destructive)", marginBottom: "0.5rem" }}>{error}</p>
        )}

        {config.keys.length === 0 && !showAddForm && (
          <div style={{ padding: "1.5rem", borderRadius: "8px", border: "1px dashed var(--border)", textAlign: "center" }}>
            <Key style={{ width: "1.5rem", height: "1.5rem", color: "var(--muted-foreground)", margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{t("integrations.mcp.noKeys")}</p>
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
                  <button data-testid="mcp-key-remove-cancel" type="button" onClick={() => setConfirmRemoveKey(null)}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
                    {t("integrations.mcp.cancel")}
                  </button>
                  <button data-testid="mcp-key-remove-confirm" type="button" onClick={() => { handleRemove(k.id); setConfirmRemoveKey(null); }} disabled={removing === k.id}
                    style={{ padding: "0.3rem 0.5rem", borderRadius: "5px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.7rem", cursor: "pointer", opacity: removing === k.id ? 0.5 : 1 }}>
                    {removing === k.id ? t("integrations.mcp.removing") : t("integrations.mcp.confirm")}
                  </button>
                </div>
              ) : (
                <button
                  data-testid="mcp-key-remove-trigger"
                  type="button"
                  onClick={() => setConfirmRemoveKey(k.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    padding: "0.35rem 0.6rem", borderRadius: "6px",
                    border: "1px solid var(--border)", background: "transparent",
                    color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer",
                  }}
                  title={t("integrations.mcp.removeKey")}
                >
                  <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                  {t("integrations.mcp.remove")}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add key form */}
        {showAddForm && (
          <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{t("integrations.mcp.newApiKey")}</p>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>{t("integrations.mcp.label")}</label>
              <input
                data-testid="mcp-add-label-input"
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t("integrations.mcp.labelPlaceholder")}
                style={fieldStyle}
              />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{t("integrations.mcp.key")}</label>
                <button
                  data-testid="mcp-add-key-regenerate"
                  type="button"
                  onClick={() => setNewKey(generateKey())}
                  style={{ display: "flex", alignItems: "center", gap: "0.2rem", fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
                >
                  <RefreshCw style={{ width: "0.65rem", height: "0.65rem" }} /> {t("integrations.mcp.regenerate")}
                </button>
              </div>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                <input
                  data-testid="mcp-add-key-input"
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder={t("integrations.mcp.keyPlaceholder")}
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <CopyButton text={newKey} />
              </div>
              <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
                {t("integrations.mcp.copyNow")}
              </p>
            </div>

            <div>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, display: "block", marginBottom: "0.35rem" }}>{t("integrations.mcp.scopes")}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {ALL_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    checked={newScopes.includes(scope)}
                    onChange={(v) => {
                      setNewScopes((prev) =>
                        v ? [...prev, scope] : prev.filter((s) => s !== scope)
                      );
                    }}
                    label={scope}
                    description={t(SCOPE_DESCRIPTIONS[scope])}
                  />
                ))}
              </div>
            </div>

            {addError && (
              <p style={{ fontSize: "0.8rem", color: "var(--destructive)" }}>{addError}</p>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                data-testid="mcp-add-key-save"
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
                {adding ? t("integrations.mcp.saving") : t("integrations.mcp.saveKey")}
              </button>
              <button
                data-testid="mcp-add-key-cancel"
                type="button"
                onClick={() => { setShowAddForm(false); setAddError(""); }}
                style={{
                  padding: "0.45rem 0.875rem", borderRadius: "7px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--muted-foreground)", fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                {t("integrations.mcp.cancel")}
              </button>
            </div>
          </div>
        )}
      </section>

      <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>
        {fillNodes(t("integrations.mcp.storageNote"), {
          file: <code style={{ fontSize: "0.7rem" }}>_data/mcp-config.json</code>,
          env1: <code style={{ fontSize: "0.7rem" }}>MCP_API_KEY</code>,
          env2: <code style={{ fontSize: "0.7rem" }}>MCP_API_KEY_1..5</code>,
        })}
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
  { name: "Agent Memory", command: "npx", args: ["-y", "@anthropic/mcp-memory"], description: "integrations.mcp.presetMemory" },
  { name: "Brave Search", command: "npx", args: ["-y", "@anthropic/mcp-brave-search"], description: "integrations.mcp.presetBrave", envHint: "BRAVE_API_KEY" },
  { name: "GitHub", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], description: "integrations.mcp.presetGithub", envHint: "GITHUB_PERSONAL_ACCESS_TOKEN" },
  { name: "Filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/agent-workspace"], description: "integrations.mcp.presetFilesystem" },
];

function ExternalMcpServers() {
  const t = useT();
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
      setEditError(t("integrations.mcp.invalidJson"));
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
      setEditError(t("integrations.mcp.saveFailed"));
    }
  }

  if (loading) return null;

  return (
    <section style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <div>
          <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>{t("integrations.mcp.externalServers")}</h2>
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.2rem" }}>
            {t("integrations.mcp.externalIntro")}
          </p>
        </div>
        <button
          data-testid="mcp-server-add-button"
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            display: "flex", alignItems: "center", gap: "0.35rem",
            padding: "0.35rem 0.75rem", borderRadius: "6px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--foreground)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500,
          }}
        >
          <Plus style={{ width: "0.75rem", height: "0.75rem" }} /> {t("integrations.mcp.addServer")}
        </button>
      </div>

      {/* Server list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        {servers.map((s) => (
          <div key={s.id} style={{ borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", opacity: s.enabled ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", minHeight: "3.5rem" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.enabled ? "#22c55e" : "#6b7280", flexShrink: 0 }} />
              <Server style={{ width: "1rem", height: "1rem", color: s.enabled ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "0.85rem", fontWeight: 500 }}>{s.name}</p>
                {s.env && Object.keys(s.env).length > 0 && (
                  <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                    {Object.entries(s.env).map(([k, v]) => (
                      <span key={k} style={{
                        fontSize: "0.6rem", fontFamily: "monospace",
                        padding: "0.1rem 0.35rem", borderRadius: "3px",
                        background: v ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "color-mix(in srgb, var(--destructive) 10%, transparent)",
                        color: v ? "var(--primary)" : "var(--destructive)",
                      }}>
                        {k}{v ? " ✓" : ` ${t("integrations.mcp.notSet")}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {confirmDeleteId === s.id ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0, minWidth: "12rem", justifyContent: "flex-end" }}>
                  <button data-testid="mcp-server-delete-cancel" type="button" onClick={() => setConfirmDeleteId(null)}
                    style={{ padding: "0.3rem 0.6rem", borderRadius: "6px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
                    {t("integrations.mcp.cancel")}
                  </button>
                  <button data-testid="mcp-server-delete-confirm" type="button" onClick={() => { removeServer(s.id); setConfirmDeleteId(null); }}
                    style={{ padding: "0.3rem 0.6rem", borderRadius: "6px",
                      border: "none", background: "var(--destructive)", color: "#fff",
                      fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    {t("integrations.mcp.confirm")}
                  </button>
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexShrink: 0, minWidth: "12rem", justifyContent: "flex-end" }}>
                  <button data-testid="mcp-server-edit-json" type="button" onClick={() => startEdit(s)} title={t("integrations.mcp.editJson")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}>
                    <Pencil style={{ width: "0.8rem", height: "0.8rem" }} />
                  </button>
                  <button data-testid="mcp-server-toggle-json" type="button" onClick={() => {
                      if (editingId === s.id) { setEditingId(null); } else { startEdit(s); }
                    }} title={t("integrations.mcp.toggleJson")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.2rem",
                      padding: "0.15rem 0.4rem", borderRadius: "9999px",
                      border: "1px solid var(--border)",
                      background: editingId === s.id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                      color: editingId === s.id ? "var(--primary)" : "var(--muted-foreground)",
                      fontSize: "0.6rem", fontWeight: 500, cursor: "pointer",
                    }}>
                    <Braces style={{ width: "0.65rem", height: "0.65rem" }} />
                    {/* i18n-ignore: format name */}
                    JSON
                  </button>
                  <button data-testid="mcp-server-toggle-enabled" type="button" onClick={() => toggleEnabled(s.id, !s.enabled)} title={s.enabled ? t("integrations.mcp.disableServer") : t("integrations.mcp.enableServer")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: s.enabled ? "var(--primary)" : "var(--muted-foreground)", padding: "0.25rem" }}>
                    {s.enabled ? <Power style={{ width: "0.9rem", height: "0.9rem" }} /> : <PowerOff style={{ width: "0.9rem", height: "0.9rem" }} />}
                  </button>
                  <button data-testid="mcp-server-delete-trigger" type="button" onClick={() => setConfirmDeleteId(s.id)} title={t("integrations.mcp.removeServer")}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.3rem",
                      padding: "0.35rem 0.6rem", borderRadius: "6px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--destructive)", fontSize: "0.75rem", cursor: "pointer",
                    }}>
                    <Trash2 style={{ width: "0.75rem", height: "0.75rem" }} />
                    {t("integrations.mcp.remove")}
                  </button>
                </span>
              )}
            </div>

            {/* Inline JSON editor */}
            {editingId === s.id && (
              <div style={{ padding: "0 0.75rem 0.75rem", borderTop: "1px solid var(--border)", marginTop: "0" }}>
                <textarea
                  data-testid="mcp-server-json-editor"
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
                  <button data-testid="mcp-server-json-save" type="button" onClick={saveEdit}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", border: "none", background: "var(--primary)", color: "var(--primary-foreground)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    {t("integrations.mcp.save")}
                  </button>
                  <CopyButton text={editJson} />
                  <button data-testid="mcp-server-json-cancel" type="button" onClick={() => setEditingId(null)}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>
                    {t("integrations.mcp.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {servers.length === 0 && !showAdd && (
          <div style={{ padding: "1.25rem", borderRadius: "8px", border: "1px dashed var(--border)", textAlign: "center" }}>
            <Server style={{ width: "1.5rem", height: "1.5rem", color: "var(--muted-foreground)", margin: "0 auto 0.5rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{t("integrations.mcp.noServers")}</p>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>{t("integrations.mcp.noServersHint")}</p>
          </div>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ marginTop: "0.75rem", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{t("integrations.mcp.addMcpServer")}</p>
            <button data-testid="mcp-add-server-close" type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}>
              <X style={{ width: "0.8rem", height: "0.8rem" }} />
            </button>
          </div>

          {/* Quick presets */}
          <div>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>{t("integrations.mcp.quickAdd")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {PRESETS.filter((p) => !servers.some((s) => s.name === p.name)).map((preset) => (
                <button
                  data-testid={`mcp-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
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
                  title={t(preset.description)}
                >
                  <Plus style={{ width: "0.6rem", height: "0.6rem" }} /> {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border)" }} />

          {/* Custom server form */}
          <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>{t("integrations.mcp.customServer")}</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>{t("integrations.mcp.name")}</label>
              <input data-testid="mcp-custom-server-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("integrations.mcp.namePlaceholder")}
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ width: "80px" }}>
              <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>{t("integrations.mcp.command")}</label>
              <input data-testid="mcp-custom-server-command" type="text" value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="npx" // i18n-ignore: example command
                style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>{t("integrations.mcp.arguments")}</label>
            <input data-testid="mcp-custom-server-args" type="text" value={newArgs} onChange={(e) => setNewArgs(e.target.value)} placeholder="-y @anthropic/mcp-memory" // i18n-ignore: example command arguments
              style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.8rem", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Env vars */}
          <div>
            <label style={{ fontSize: "0.7rem", fontWeight: 500, display: "block", marginBottom: "0.2rem" }}>{t("integrations.mcp.envVars")}</label>
            {Object.entries(newEnvPairs).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: "0.375rem", marginBottom: "0.25rem" }}>
                <code style={{ fontSize: "0.75rem", padding: "0.3rem 0.5rem", background: "var(--secondary)", borderRadius: "4px", minWidth: "120px" }}>{k}</code>
                <input data-testid={`mcp-env-value-${k}`} type="text" value={v} onChange={(e) => setNewEnvPairs((p) => ({ ...p, [k]: e.target.value }))} placeholder={t("integrations.mcp.value")}
                  style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
                <button data-testid={`mcp-env-remove-${k}`} type="button" onClick={() => setNewEnvPairs((p) => { const n = { ...p }; delete n[k]; return n; })}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--destructive)", padding: "0.2rem" }}>
                  <X style={{ width: "0.7rem", height: "0.7rem" }} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <input data-testid="mcp-env-key-input" type="text" value={newEnvKey} onChange={(e) => setNewEnvKey(e.target.value)} placeholder="KEY_NAME" // i18n-ignore: example env-var name
                style={{ width: "120px", padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
              <input data-testid="mcp-env-val-input" type="text" value={newEnvVal} onChange={(e) => setNewEnvVal(e.target.value)} placeholder={t("integrations.mcp.value")}
                style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace", outline: "none" }} />
              <button data-testid="mcp-env-add-button" type="button" onClick={() => { if (newEnvKey.trim()) { setNewEnvPairs((p) => ({ ...p, [newEnvKey]: newEnvVal })); setNewEnvKey(""); setNewEnvVal(""); } }}
                style={{ padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", fontSize: "0.7rem", cursor: "pointer" }}>
                {t("integrations.mcp.add")}
              </button>
            </div>
          </div>

          <button
            data-testid="mcp-custom-server-add"
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
            {saving ? t("integrations.mcp.adding") : t("integrations.mcp.addServer")}
          </button>
        </div>
      )}
    </section>
  );
}
