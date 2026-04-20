"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types (mirror lib/access-tokens.ts) ────────────────────────────

type Permission =
  | "content:read" | "content:write" | "content:publish"
  | "media:read" | "media:write" | "media:delete"
  | "deploy:trigger" | "deploy:read"
  | "forms:read" | "forms:write"
  | "team:manage" | "tokens:manage" | "sites:read" | "sites:write"
  | "org:settings:read" | "org:settings:write"
  | "*";

type ResourceScope = "org" | "site" | "admin-area";
type ResourceEffect = "include" | "exclude";

interface ResourceFilter {
  scope: ResourceScope;
  effect: ResourceEffect;
  targets: "*" | string[];
}

type IpFilterOp = "in" | "not_in";
interface IpFilter {
  op: IpFilterOp;
  cidrs: string[];
}

interface TokenEntry {
  id: string;
  name: string;
  description?: string;
  displayPrefix?: string | null;
  permissions?: Permission[];
  resources?: ResourceFilter[];
  ipFilters?: IpFilter[];
  notBefore?: string;
  notAfter?: string;
  scopes?: string[]; // legacy
  createdAt: string;
  lastUsed?: string;
}

// ─── Permission cascade vocabulary ─────────────────────────────────

/** Cloudflare-style three-dropdown cascade. First dropdown is scope,
 *  second is category within scope, third is action. Each leaf is one
 *  flat `Permission` string. */
const PERMISSION_TREE: Record<string, Record<string, Record<string, Permission>>> = {
  "Site": {
    "Content":  { "Read": "content:read", "Write": "content:write", "Publish": "content:publish" },
    "Media":    { "Read": "media:read", "Write": "media:write", "Delete": "media:delete" },
    "Deploy":   { "Trigger": "deploy:trigger", "Read": "deploy:read" },
    "Forms":    { "Read": "forms:read", "Write": "forms:write" },
  },
  "Org": {
    "Sites":       { "Read": "sites:read", "Write": "sites:write" },
    "Team":        { "Manage": "team:manage" },
    "Tokens":      { "Manage": "tokens:manage" },
    "Org Settings":{ "Read": "org:settings:read", "Write": "org:settings:write" },
  },
};

interface PermissionRow {
  scope: string;    // "Site" | "Org"
  category: string; // "Content" | "Deploy" | ...
  action: string;   // "Read" | "Write" | ...
}

function rowToPermission(r: PermissionRow): Permission | null {
  const cat = PERMISSION_TREE[r.scope]?.[r.category];
  if (!cat) return null;
  return cat[r.action] ?? null;
}

// ─── Component ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  padding: "0.4rem 0.6rem",
  borderRadius: "5px",
  border: "1px solid var(--border)",
  background: "var(--background)",
  color: "var(--foreground)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--foreground)",
  marginBottom: "0.35rem",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "var(--foreground)",
  marginBottom: "0.25rem",
};

const helpTextStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--muted-foreground)",
  marginBottom: "0.6rem",
};

export function AccessTokensPanel() {
  const [tokens, setTokens] = useState<TokenEntry[]>([]);
  const [availableSites, setAvailableSites] = useState<Array<{ id: string; name: string; orgId: string }>>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permRows, setPermRows] = useState<PermissionRow[]>([
    { scope: "Site", category: "Content", action: "Read" },
  ]);
  const [resourceFilters, setResourceFilters] = useState<ResourceFilter[]>([]);
  const [ipFilters, setIpFilters] = useState<IpFilter[]>([]);
  const [notBefore, setNotBefore] = useState("");
  const [notAfter, setNotAfter] = useState("");

  const loadTokens = useCallback(async () => {
    const res = await fetch("/api/admin/access-tokens");
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens ?? []);
    }
  }, []);

  const loadSites = useCallback(async () => {
    try {
      const res = await fetch("/api/cms/registry");
      if (!res.ok) return;
      const data = await res.json() as { registry?: { orgs: Array<{ id: string; sites: Array<{ id: string; name: string }> }> } };
      const sites: Array<{ id: string; name: string; orgId: string }> = [];
      for (const org of data.registry?.orgs ?? []) {
        for (const s of org.sites) sites.push({ id: s.id, name: s.name, orgId: org.id });
      }
      setAvailableSites(sites);
    } catch { /* registry unavailable — single-site */ }
  }, []);

  useEffect(() => { void loadTokens(); void loadSites(); }, [loadTokens, loadSites]);

  function resetForm() {
    setName(""); setDescription("");
    setPermRows([{ scope: "Site", category: "Content", action: "Read" }]);
    setResourceFilters([]); setIpFilters([]);
    setNotBefore(""); setNotAfter("");
  }

  function applyPreset(preset: "admin" | "deploy-bot" | "reader") {
    resetForm();
    if (preset === "admin") {
      setName("Admin token");
      setPermRows([{ scope: "Site", category: "Content", action: "Read" }]); // placeholder, we'll submit "*"
      setResourceFilters([]);
    } else if (preset === "deploy-bot") {
      setName("Site deploy bot");
      setPermRows([
        { scope: "Site", category: "Deploy", action: "Trigger" },
        { scope: "Site", category: "Deploy", action: "Read" },
      ]);
      setResourceFilters([{ scope: "site", effect: "include", targets: [] }]);
    } else if (preset === "reader") {
      setName("Read everything");
      setPermRows([
        { scope: "Site", category: "Content", action: "Read" },
        { scope: "Site", category: "Media", action: "Read" },
        { scope: "Site", category: "Deploy", action: "Read" },
        { scope: "Site", category: "Forms", action: "Read" },
      ]);
    }
  }

  function compilePermissions(preset: "admin" | null): Permission[] {
    if (preset === "admin") return ["*"];
    const set = new Set<Permission>();
    for (const r of permRows) {
      const p = rowToPermission(r);
      if (p) set.add(p);
    }
    return Array.from(set);
  }

  async function handleCreate(preset: "admin" | null = null) {
    if (!name.trim()) return;
    setCreating(true);

    const permissions = compilePermissions(preset);
    if (permissions.length === 0) {
      setCreating(false);
      return;
    }

    const body: Record<string, unknown> = { name: name.trim(), permissions };
    if (description.trim()) body.description = description.trim();
    if (resourceFilters.length > 0) body.resources = resourceFilters.filter(
      (r) => r.targets === "*" || (Array.isArray(r.targets) && r.targets.length > 0),
    );
    if (ipFilters.length > 0) body.ipFilters = ipFilters.filter(
      (f) => f.cidrs.filter(Boolean).length > 0,
    );
    if (notBefore) body.notBefore = new Date(notBefore).toISOString();
    if (notAfter) body.notAfter = new Date(notAfter).toISOString();

    const res = await fetch("/api/admin/access-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken(data.token);
      resetForm();
      setShowForm(false);
      await loadTokens();
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/access-tokens?id=${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    await loadTokens();
  }

  const preview = buildPreview(name, compilePermissions(null), resourceFilters, ipFilters, notBefore, notAfter, availableSites);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "48rem" }}>
      {/* New token reveal */}
      {newToken && (
        <div style={{
          borderRadius: "7px", border: "1px solid color-mix(in srgb, var(--primary) 50%, transparent)",
          background: "color-mix(in srgb, var(--primary) 6%, transparent)",
          padding: "0.9rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem",
        }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>
            New token created — copy it now, it won&apos;t be shown again:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{
              flex: 1, fontSize: "0.72rem", fontFamily: "monospace", background: "var(--background)",
              border: "1px solid var(--border)", borderRadius: "4px", padding: "0.5rem 0.75rem",
              userSelect: "all", wordBreak: "break-all",
            }}>
              {newToken}
            </code>
            <button type="button"
              onClick={() => { navigator.clipboard.writeText(newToken); }}
              style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none" }}>
              Copy
            </button>
          </div>
          <button type="button" onClick={() => setNewToken(null)}
            style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Create form toggle */}
      {!showForm ? (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => setShowForm(true)}
            style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none" }}>
            + Create custom token
          </button>
          <button type="button" onClick={() => { resetForm(); setName("Admin token"); handleCreate("admin"); }}
            style={{ ...inputStyle, cursor: "pointer" }}>
            Quick: admin token
          </button>
        </div>
      ) : (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "7px", padding: "1rem 1.1rem",
          display: "flex", flexDirection: "column", gap: "1rem", background: "var(--card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Create custom token</h3>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
              style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "0.8rem" }}>
              ← Cancel
            </button>
          </div>

          {/* Presets */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", alignSelf: "center" }}>Presets:</span>
            <button type="button" onClick={() => applyPreset("admin")} style={presetBtn}>Admin (full)</button>
            <button type="button" onClick={() => applyPreset("deploy-bot")} style={presetBtn}>Site deploy bot</button>
            <button type="button" onClick={() => applyPreset("reader")} style={presetBtn}>Read everything</button>
          </div>

          {/* Name + Description */}
          <div>
            <div style={labelStyle}>Token name</div>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fysiodk Deploy Bot"
              style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <div style={labelStyle}>Description <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>(optional — helps locate this token later)</span></div>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. CI job running from fysiodk-ci.example.com, owned by ops@"
              style={{ ...inputStyle, width: "100%" }} />
          </div>

          {/* Permissions */}
          <div>
            <div style={sectionTitleStyle}>Permissions</div>
            <div style={helpTextStyle}>Select edit or read permissions to apply. Each row is one permission.</div>
            {permRows.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <select value={row.scope} onChange={(e) => {
                    const firstCat = Object.keys(PERMISSION_TREE[e.target.value] ?? {})[0] ?? "";
                    const firstAct = Object.keys(PERMISSION_TREE[e.target.value]?.[firstCat] ?? {})[0] ?? "";
                    setPermRows(permRows.map((r, idx) => idx === i ? { scope: e.target.value, category: firstCat, action: firstAct } : r));
                  }} style={{ ...inputStyle, minWidth: 110 }}>
                  {Object.keys(PERMISSION_TREE).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={row.category} onChange={(e) => {
                    const firstAct = Object.keys(PERMISSION_TREE[row.scope]?.[e.target.value] ?? {})[0] ?? "";
                    setPermRows(permRows.map((r, idx) => idx === i ? { ...r, category: e.target.value, action: firstAct } : r));
                  }} style={{ ...inputStyle, minWidth: 140 }}>
                  {Object.keys(PERMISSION_TREE[row.scope] ?? {}).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={row.action} onChange={(e) =>
                    setPermRows(permRows.map((r, idx) => idx === i ? { ...r, action: e.target.value } : r))
                  } style={{ ...inputStyle, minWidth: 110 }}>
                  {Object.keys(PERMISSION_TREE[row.scope]?.[row.category] ?? {}).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button type="button" onClick={() => setPermRows(permRows.filter((_, idx) => idx !== i))}
                  style={smallIconBtn} disabled={permRows.length === 1}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setPermRows([...permRows, { scope: "Site", category: "Content", action: "Read" }])}
              style={addBtn}>+ Add permission</button>
          </div>

          {/* Resources */}
          <div>
            <div style={sectionTitleStyle}>Resources</div>
            <div style={helpTextStyle}>Restrict the token to specific sites or admin areas. Leave empty = all resources (Cloudflare default).</div>
            {resourceFilters.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <select value={f.effect} onChange={(e) =>
                    setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, effect: e.target.value as ResourceEffect } : r))
                  } style={{ ...inputStyle, minWidth: 95 }}>
                  <option value="include">Include</option>
                  <option value="exclude">Exclude</option>
                </select>
                <select value={f.scope} onChange={(e) =>
                    setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, scope: e.target.value as ResourceScope, targets: [] } : r))
                  } style={{ ...inputStyle, minWidth: 120 }}>
                  <option value="site">Specific sites</option>
                  <option value="admin-area">Admin areas</option>
                  <option value="org">Org level</option>
                </select>
                <div style={{ flex: 1, display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
                  {f.scope === "site" && (
                    <select multiple value={Array.isArray(f.targets) ? f.targets : []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                        setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, targets: selected } : r));
                      }}
                      style={{ ...inputStyle, minHeight: 72, minWidth: 180, flex: 1 }}>
                      {availableSites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                    </select>
                  )}
                  {f.scope === "admin-area" && (
                    <input type="text" value={Array.isArray(f.targets) ? f.targets.join(", ") : ""}
                      placeholder="e.g. deploy, tokens, team"
                      onChange={(e) => setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, targets: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : r))}
                      style={{ ...inputStyle, flex: 1 }} />
                  )}
                  {f.scope === "org" && (
                    <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)" }}>(matches org:settings)</span>
                  )}
                </div>
                <button type="button" onClick={() => setResourceFilters(resourceFilters.filter((_, idx) => idx !== i))}
                  style={smallIconBtn}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setResourceFilters([...resourceFilters, { scope: "site", effect: "include", targets: [] }])}
              style={addBtn}>+ Add resource filter</button>
          </div>

          {/* IP filters */}
          <div>
            <div style={sectionTitleStyle}>Client IP filtering <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>(optional)</span></div>
            <div style={helpTextStyle}>CIDR notation (e.g. 203.0.113.0/24) or single IPs. Empty = no IP restriction.</div>
            {ipFilters.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <select value={f.op} onChange={(e) =>
                    setIpFilters(ipFilters.map((x, idx) => idx === i ? { ...x, op: e.target.value as IpFilterOp } : x))
                  } style={{ ...inputStyle, minWidth: 95 }}>
                  <option value="in">Is in</option>
                  <option value="not_in">Is not in</option>
                </select>
                <input type="text" value={f.cidrs.join(", ")} placeholder="e.g. 203.0.113.4/32"
                  onChange={(e) => setIpFilters(ipFilters.map((x, idx) => idx === i ? { ...x, cidrs: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) } : x))}
                  style={{ ...inputStyle, flex: 1 }} />
                <button type="button" onClick={() => setIpFilters(ipFilters.filter((_, idx) => idx !== i))}
                  style={smallIconBtn}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setIpFilters([...ipFilters, { op: "in", cidrs: [] }])}
              style={addBtn}>+ Add IP filter</button>
          </div>

          {/* TTL */}
          <div>
            <div style={sectionTitleStyle}>TTL <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>(optional)</span></div>
            <div style={helpTextStyle}>Optional start and end dates. Leave blank to never expire.</div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input type="datetime-local" value={notBefore} onChange={(e) => setNotBefore(e.target.value)}
                style={{ ...inputStyle, flex: 1 }} />
              <span style={{ alignSelf: "center", color: "var(--muted-foreground)" }}>→</span>
              <input type="datetime-local" value={notAfter} onChange={(e) => setNotAfter(e.target.value)}
                style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: "0.75rem 0.9rem", borderRadius: "6px",
            background: "var(--background)", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontWeight: 600, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Preview — this token can:</div>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", lineHeight: 1.6 }}>
              {preview.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
              style={{ ...inputStyle, cursor: "pointer" }}>Cancel</button>
            <button type="button" disabled={creating || !name.trim() || compilePermissions(null).length === 0}
              onClick={() => handleCreate(null)}
              style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none", opacity: creating ? 0.6 : 1 }}>
              {creating ? "Creating…" : "Create token"}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "7px", background: "var(--card)", overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1.3fr 1.5fr 1fr auto auto",
          gap: "0.75rem", padding: "0.6rem 0.9rem",
          fontSize: "0.65rem", fontFamily: "monospace", textTransform: "uppercase",
          letterSpacing: "0.06em", color: "var(--muted-foreground)",
          borderBottom: "1px solid var(--border)",
        }}>
          <span>Name</span>
          <span>Prefix · permissions</span>
          <span>Scope</span>
          <span>Last used</span>
          <span></span>
        </div>

        {tokens.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>No access tokens yet.</p>
          </div>
        ) : tokens.map((t) => {
          const perms = t.permissions ?? [];
          const siteFilters = (t.resources ?? []).filter((r) => r.scope === "site" && r.effect === "include");
          const siteList = siteFilters.flatMap((r) => Array.isArray(r.targets) ? r.targets : (r.targets === "*" ? ["all"] : []));
          const scopeLabel = siteList.length > 0 ? siteList.join(", ") : (t.resources?.length ? "custom" : "all sites");
          return (
            <div key={t.id} style={{
              display: "grid", gridTemplateColumns: "1.3fr 1.5fr 1fr auto auto",
              gap: "0.75rem", padding: "0.65rem 0.9rem", alignItems: "center",
              borderBottom: "1px solid var(--border)", fontSize: "0.78rem",
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>{t.name}</div>
                {t.description && (
                  <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                    {t.description}
                  </div>
                )}
              </div>
              <div>
                <code style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                  {t.displayPrefix ?? "wh_…"}
                  {!t.displayPrefix && (
                    <span title="Pre-F134 token — re-mint for a grep-friendly prefix"
                      style={{ color: "var(--muted-foreground)", marginLeft: "0.25rem" }}>ⓘ</span>
                  )}
                </code>
                <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                  {perms.includes("*") ? "all permissions" : perms.length > 3 ? `${perms.length} permissions` : perms.join(", ") || (t.scopes?.join(", ") ?? "—")}
                </div>
              </div>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>{scopeLabel}</span>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
                {t.lastUsed ? new Date(t.lastUsed).toLocaleDateString() : "Never"}
              </span>
              <div>
                {confirmDelete === t.id ? (
                  <span style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Revoke?</span>
                    <button onClick={() => handleDelete(t.id)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "none", background: "var(--destructive)", color: "#fff",
                        cursor: "pointer", lineHeight: 1 }}>Yes</button>
                    <button onClick={() => setConfirmDelete(null)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(t.id)}
                    style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const presetBtn: React.CSSProperties = {
  fontSize: "0.7rem", padding: "0.25rem 0.55rem",
  borderRadius: "4px", border: "1px solid var(--border)",
  background: "transparent", color: "var(--foreground)", cursor: "pointer",
};
const smallIconBtn: React.CSSProperties = {
  fontSize: "0.9rem", padding: "0.2rem 0.5rem",
  borderRadius: "4px", border: "1px solid var(--border)",
  background: "transparent", color: "var(--muted-foreground)", cursor: "pointer",
};
const addBtn: React.CSSProperties = {
  fontSize: "0.7rem", padding: "0.3rem 0.6rem",
  borderRadius: "4px", border: "1px dashed var(--border)",
  background: "transparent", color: "var(--muted-foreground)", cursor: "pointer",
  marginTop: "0.2rem",
};

function buildPreview(
  name: string,
  permissions: Permission[],
  resources: ResourceFilter[],
  ipFilters: IpFilter[],
  notBefore: string,
  notAfter: string,
  sites: Array<{ id: string; name: string; orgId: string }>,
): string[] {
  if (!name.trim()) return ["(Give the token a name to preview.)"];
  if (permissions.length === 0) return ["(Pick at least one permission.)"];

  const lines: string[] = [];
  const siteById = new Map(sites.map((s) => [s.id, s.name]));
  const includes = resources.filter((r) => r.effect === "include" && r.scope === "site");
  const excludes = resources.filter((r) => r.effect === "exclude");

  const scopeText = (() => {
    if (includes.length === 0 && excludes.length === 0) return "on any site";
    const includedNames = includes.flatMap((r) =>
      r.targets === "*" ? ["all sites"] : r.targets.map((t) => siteById.get(t) ?? t),
    );
    const excludedNames = excludes.flatMap((r) =>
      r.targets === "*" ? ["all"] : (Array.isArray(r.targets) ? r.targets : []),
    );
    let text = includedNames.length > 0 ? `on ${includedNames.join(", ")}` : "on any site";
    if (excludedNames.length > 0) text += `, except ${excludedNames.join(", ")}`;
    return text;
  })();

  for (const p of permissions) {
    if (p === "*") { lines.push(`Do anything ${scopeText}`); continue; }
    const [area, action] = p.split(":");
    lines.push(`${capitalize(action)} ${area} ${scopeText}`);
  }

  if (ipFilters.length > 0) {
    const ins = ipFilters.filter((f) => f.op === "in").flatMap((f) => f.cidrs).filter(Boolean);
    const notIns = ipFilters.filter((f) => f.op === "not_in").flatMap((f) => f.cidrs).filter(Boolean);
    const bits: string[] = [];
    if (ins.length > 0) bits.push(`from IP ${ins.join(", ")}`);
    if (notIns.length > 0) bits.push(`never from ${notIns.join(", ")}`);
    if (bits.length) lines.push("…" + bits.join(" "));
  }
  if (notBefore || notAfter) {
    const range = [notBefore && `from ${new Date(notBefore).toLocaleDateString()}`, notAfter && `until ${new Date(notAfter).toLocaleDateString()}`].filter(Boolean).join(" ");
    if (range) lines.push(`…${range}`);
  }

  return lines;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
