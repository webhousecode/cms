"use client";

import { useState, useEffect, useCallback } from "react";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomDateTimeInput } from "@/components/ui/custom-datetime-input";
import { useT } from "@/lib/i18n-context";

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

/** Display labels for the PERMISSION_TREE keys (the keys themselves are state values). */
const PERMISSION_LABEL_KEYS: Record<string, string> = {
  "Site": "integrations.accessTokens.permSite",
  "Org": "integrations.accessTokens.permOrg",
  "Content": "integrations.accessTokens.permContent",
  "Media": "integrations.accessTokens.permMedia",
  "Deploy": "integrations.accessTokens.permDeploy",
  "Forms": "integrations.accessTokens.permForms",
  "Sites": "integrations.accessTokens.permSites",
  "Team": "integrations.accessTokens.permTeam",
  "Tokens": "integrations.accessTokens.permTokens",
  "Org Settings": "integrations.accessTokens.permOrgSettings",
  "Read": "integrations.accessTokens.permRead",
  "Write": "integrations.accessTokens.permWrite",
  "Publish": "integrations.accessTokens.permPublish",
  "Delete": "integrations.accessTokens.permDelete",
  "Trigger": "integrations.accessTokens.permTrigger",
  "Manage": "integrations.accessTokens.permManage",
};

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function permLabel(t: TFn, s: string): string {
  return PERMISSION_LABEL_KEYS[s] ? t(PERMISSION_LABEL_KEYS[s]) : s;
}

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
  const t = useT();
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
      setName(t("integrations.accessTokens.presetAdminName"));
      setPermRows([{ scope: "Site", category: "Content", action: "Read" }]); // placeholder, we'll submit "*"
      setResourceFilters([]);
    } else if (preset === "deploy-bot") {
      setName(t("integrations.accessTokens.presetDeployBot"));
      setPermRows([
        { scope: "Site", category: "Deploy", action: "Trigger" },
        { scope: "Site", category: "Deploy", action: "Read" },
      ]);
      setResourceFilters([{ scope: "site", effect: "include", targets: [] }]);
    } else if (preset === "reader") {
      setName(t("integrations.accessTokens.presetReader"));
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

  const preview = buildPreview(t, name, compilePermissions(null), resourceFilters, ipFilters, notBefore, notAfter, availableSites);

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
            {t("integrations.accessTokens.newTokenCreated")}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <code style={{
              flex: 1, fontSize: "0.72rem", fontFamily: "monospace", background: "var(--background)",
              border: "1px solid var(--border)", borderRadius: "4px", padding: "0.5rem 0.75rem",
              userSelect: "all", wordBreak: "break-all",
            }}>
              {newToken}
            </code>
            <button data-testid="token-copy-button" type="button"
              onClick={() => { navigator.clipboard.writeText(newToken); }}
              style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none" }}>
              {t("integrations.accessTokens.copy")}
            </button>
          </div>
          <button data-testid="token-dismiss-button" type="button" onClick={() => setNewToken(null)}
            style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>
            {t("integrations.accessTokens.dismiss")}
          </button>
        </div>
      )}

      {/* Create form toggle */}
      {!showForm ? (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button data-testid="token-create-custom-button" type="button" onClick={() => setShowForm(true)}
            style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none" }}>
            + {t("integrations.accessTokens.createCustom")}
          </button>
          <button data-testid="token-quick-admin-button" type="button" onClick={() => { resetForm(); setName(t("integrations.accessTokens.presetAdminName")); handleCreate("admin"); }}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {t("integrations.accessTokens.quickAdmin")}
          </button>
        </div>
      ) : (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "7px", padding: "1rem 1.1rem",
          display: "flex", flexDirection: "column", gap: "1rem", background: "var(--card)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>{t("integrations.accessTokens.createCustom")}</h3>
            <button data-testid="token-form-cancel-button" type="button" onClick={() => { setShowForm(false); resetForm(); }}
              style={{ background: "none", border: "none", color: "var(--muted-foreground)", cursor: "pointer", fontSize: "0.8rem" }}>
              ← {t("integrations.accessTokens.cancel")}
            </button>
          </div>

          {/* Presets */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", alignSelf: "center" }}>{t("integrations.accessTokens.presets")}</span>
            <button data-testid="token-preset-admin" type="button" onClick={() => applyPreset("admin")} style={presetBtn}>{t("integrations.accessTokens.presetAdmin")}</button>
            <button data-testid="token-preset-deploy-bot" type="button" onClick={() => applyPreset("deploy-bot")} style={presetBtn}>{t("integrations.accessTokens.presetDeployBot")}</button>
            <button data-testid="token-preset-reader" type="button" onClick={() => applyPreset("reader")} style={presetBtn}>{t("integrations.accessTokens.presetReader")}</button>
          </div>

          {/* Name + Description */}
          <div>
            <div style={labelStyle}>{t("integrations.accessTokens.tokenName")}</div>
            <input data-testid="token-name-input" type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t("integrations.accessTokens.tokenNamePlaceholder")}
              style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <div style={labelStyle}>{t("integrations.accessTokens.description")} <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>{t("integrations.accessTokens.descriptionHint")}</span></div>
            <input data-testid="token-description-input" type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t("integrations.accessTokens.descriptionPlaceholder")}
              style={{ ...inputStyle, width: "100%" }} />
          </div>

          {/* Permissions */}
          <div>
            <div style={sectionTitleStyle}>{t("integrations.accessTokens.permissions")}</div>
            <div style={helpTextStyle}>{t("integrations.accessTokens.permissionsHelp")}</div>
            {permRows.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <div style={{ minWidth: 110 }}>
                  <CustomSelect
                    value={row.scope}
                    options={Object.keys(PERMISSION_TREE).map((s) => ({ value: s, label: permLabel(t, s) }))}
                    onChange={(v) => {
                      const firstCat = Object.keys(PERMISSION_TREE[v] ?? {})[0] ?? "";
                      const firstAct = Object.keys(PERMISSION_TREE[v]?.[firstCat] ?? {})[0] ?? "";
                      setPermRows(permRows.map((r, idx) => idx === i ? { scope: v, category: firstCat, action: firstAct } : r));
                    }}
                  />
                </div>
                <div style={{ minWidth: 140 }}>
                  <CustomSelect
                    value={row.category}
                    options={Object.keys(PERMISSION_TREE[row.scope] ?? {}).map((c) => ({ value: c, label: permLabel(t, c) }))}
                    onChange={(v) => {
                      const firstAct = Object.keys(PERMISSION_TREE[row.scope]?.[v] ?? {})[0] ?? "";
                      setPermRows(permRows.map((r, idx) => idx === i ? { ...r, category: v, action: firstAct } : r));
                    }}
                  />
                </div>
                <div style={{ minWidth: 110 }}>
                  <CustomSelect
                    value={row.action}
                    options={Object.keys(PERMISSION_TREE[row.scope]?.[row.category] ?? {}).map((a) => ({ value: a, label: permLabel(t, a) }))}
                    onChange={(v) =>
                      setPermRows(permRows.map((r, idx) => idx === i ? { ...r, action: v } : r))
                    }
                  />
                </div>
                <button data-testid={`token-perm-remove-${i}`} type="button" onClick={() => setPermRows(permRows.filter((_, idx) => idx !== i))}
                  style={smallIconBtn} disabled={permRows.length === 1}>×</button>
              </div>
            ))}
            <button data-testid="token-perm-add-button" type="button" onClick={() => setPermRows([...permRows, { scope: "Site", category: "Content", action: "Read" }])}
              style={addBtn}>+ {t("integrations.accessTokens.addPermission")}</button>
          </div>

          {/* Resources */}
          <div>
            <div style={sectionTitleStyle}>{t("integrations.accessTokens.resources")}</div>
            <div style={helpTextStyle}>{t("integrations.accessTokens.resourcesHelp")}</div>
            {resourceFilters.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "flex-start" }}>
                <div style={{ minWidth: 95 }}>
                  <CustomSelect
                    value={f.effect}
                    options={[
                      { value: "include", label: t("integrations.accessTokens.include") },
                      { value: "exclude", label: t("integrations.accessTokens.exclude") },
                    ]}
                    onChange={(v) =>
                      setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, effect: v as ResourceEffect } : r))
                    }
                  />
                </div>
                <div style={{ minWidth: 140 }}>
                  <CustomSelect
                    value={f.scope}
                    options={[
                      { value: "site", label: t("integrations.accessTokens.specificSites") },
                      { value: "admin-area", label: t("integrations.accessTokens.adminAreas") },
                      { value: "org", label: t("integrations.accessTokens.orgLevel") },
                    ]}
                    onChange={(v) =>
                      setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, scope: v as ResourceScope, targets: [] } : r))
                    }
                  />
                </div>
                <div style={{ flex: 1, display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center", minHeight: 32 }}>
                  {f.scope === "site" && (
                    <SiteChipPicker
                      sites={availableSites}
                      selected={Array.isArray(f.targets) ? f.targets : []}
                      onChange={(targets) =>
                        setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, targets } : r))
                      }
                    />
                  )}
                  {f.scope === "admin-area" && (
                    <input data-testid={`token-adminarea-targets-${i}`} type="text" value={Array.isArray(f.targets) ? f.targets.join(", ") : ""}
                      placeholder={t("integrations.accessTokens.adminAreaPlaceholder")}
                      onChange={(e) => setResourceFilters(resourceFilters.map((r, idx) => idx === i ? { ...r, targets: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } : r))}
                      style={{ ...inputStyle, flex: 1 }} />
                  )}
                  {f.scope === "org" && (
                    <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", alignSelf: "center" }}>{t("integrations.accessTokens.matchesOrgSettings")}</span>
                  )}
                </div>
                <button data-testid={`token-resource-remove-${i}`} type="button" onClick={() => setResourceFilters(resourceFilters.filter((_, idx) => idx !== i))}
                  style={smallIconBtn}>×</button>
              </div>
            ))}
            <button data-testid="token-resource-add-button" type="button" onClick={() => setResourceFilters([...resourceFilters, { scope: "site", effect: "include", targets: [] }])}
              style={addBtn}>+ {t("integrations.accessTokens.addResourceFilter")}</button>
          </div>

          {/* IP filters */}
          <div>
            <div style={sectionTitleStyle}>{t("integrations.accessTokens.ipFiltering")} <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>{t("integrations.accessTokens.optional")}</span></div>
            <div style={helpTextStyle}>{t("integrations.accessTokens.ipHelp")}</div>
            {ipFilters.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <div style={{ minWidth: 110 }}>
                  <CustomSelect
                    value={f.op}
                    options={[
                      { value: "in", label: t("integrations.accessTokens.isIn") },
                      { value: "not_in", label: t("integrations.accessTokens.isNotIn") },
                    ]}
                    onChange={(v) =>
                      setIpFilters(ipFilters.map((x, idx) => idx === i ? { ...x, op: v as IpFilterOp } : x))
                    }
                  />
                </div>
                <input data-testid={`token-ip-cidrs-${i}`} type="text" value={f.cidrs.join(", ")} placeholder={t("integrations.accessTokens.ipPlaceholder")}
                  onChange={(e) => setIpFilters(ipFilters.map((x, idx) => idx === i ? { ...x, cidrs: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) } : x))}
                  style={{ ...inputStyle, flex: 1 }} />
                <button data-testid={`token-ip-remove-${i}`} type="button" onClick={() => setIpFilters(ipFilters.filter((_, idx) => idx !== i))}
                  style={smallIconBtn}>×</button>
              </div>
            ))}
            <button data-testid="token-ip-add-button" type="button" onClick={() => setIpFilters([...ipFilters, { op: "in", cidrs: [] }])}
              style={addBtn}>+ {t("integrations.accessTokens.addIpFilter")}</button>
          </div>

          {/* TTL */}
          <div>
            <div style={sectionTitleStyle}>{t("integrations.accessTokens.ttl")} <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>{t("integrations.accessTokens.optional")}</span></div>
            <div style={helpTextStyle}>{t("integrations.accessTokens.ttlHelp")}</div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <CustomDateTimeInput value={notBefore} onChange={setNotBefore} />
              </div>
              <span style={{ color: "var(--muted-foreground)" }}>→</span>
              <div style={{ flex: 1 }}>
                <CustomDateTimeInput value={notAfter} onChange={setNotAfter} />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: "0.75rem 0.9rem", borderRadius: "6px",
            background: "var(--background)", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", fontWeight: 600, marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("integrations.accessTokens.previewHeading")}</div>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.75rem", lineHeight: 1.6 }}>
              {preview.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button data-testid="token-form-cancel-submit" type="button" onClick={() => { setShowForm(false); resetForm(); }}
              style={{ ...inputStyle, cursor: "pointer" }}>{t("integrations.accessTokens.cancel")}</button>
            <button data-testid="token-create-submit" type="button" disabled={creating || !name.trim() || compilePermissions(null).length === 0}
              onClick={() => handleCreate(null)}
              style={{ ...inputStyle, background: "var(--primary)", color: "#0D0D0D", fontWeight: 600, cursor: "pointer", border: "none", opacity: creating ? 0.6 : 1 }}>
              {creating ? t("integrations.accessTokens.creating") : t("integrations.accessTokens.createToken")}
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
          <span>{t("integrations.accessTokens.colName")}</span>
          <span>{t("integrations.accessTokens.colPrefix")}</span>
          <span>{t("integrations.accessTokens.colScope")}</span>
          <span>{t("integrations.accessTokens.colLastUsed")}</span>
          <span></span>
        </div>

        {tokens.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", margin: 0 }}>{t("integrations.accessTokens.empty")}</p>
          </div>
        ) : tokens.map((tok) => {
          const perms = tok.permissions ?? [];
          const siteFilters = (tok.resources ?? []).filter((r) => r.scope === "site" && r.effect === "include");
          const siteList = siteFilters.flatMap((r) => Array.isArray(r.targets) ? r.targets : (r.targets === "*" ? [t("integrations.accessTokens.all")] : []));
          const scopeLabel = siteList.length > 0 ? siteList.join(", ") : (tok.resources?.length ? t("integrations.accessTokens.custom") : t("integrations.accessTokens.allSites"));
          return (
            <div key={tok.id} style={{
              display: "grid", gridTemplateColumns: "1.3fr 1.5fr 1fr auto auto",
              gap: "0.75rem", padding: "0.65rem 0.9rem", alignItems: "center",
              borderBottom: "1px solid var(--border)", fontSize: "0.78rem",
            }}>
              <div>
                <div style={{ fontWeight: 500 }}>{tok.name}</div>
                {tok.description && (
                  <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                    {tok.description}
                  </div>
                )}
              </div>
              <div>
                <code style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                  {tok.displayPrefix ?? "wh_…"}
                  {!tok.displayPrefix && (
                    <span title={t("integrations.accessTokens.legacyPrefix")}
                      style={{ color: "var(--muted-foreground)", marginLeft: "0.25rem" }}>ⓘ</span>
                  )}
                </code>
                <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                  {perms.includes("*") ? t("integrations.accessTokens.allPermissions") : perms.length > 3 ? t("integrations.accessTokens.nPermissions", { n: perms.length }) : perms.join(", ") || (tok.scopes?.join(", ") ?? "—")}
                </div>
              </div>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>{scopeLabel}</span>
              <span style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
                {tok.lastUsed ? new Date(tok.lastUsed).toLocaleDateString() : t("integrations.accessTokens.never")}
              </span>
              <div>
                {confirmDelete === tok.id ? (
                  <span style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>{t("integrations.accessTokens.revokeConfirm")}</span>
                    <button data-testid={`token-revoke-confirm-${tok.id}`} onClick={() => handleDelete(tok.id)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "none", background: "var(--destructive)", color: "#fff",
                        cursor: "pointer", lineHeight: 1 }}>{t("integrations.accessTokens.yes")}</button>
                    <button data-testid={`token-revoke-cancel-${tok.id}`} onClick={() => setConfirmDelete(null)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                        border: "1px solid var(--border)", background: "transparent",
                        color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>{t("integrations.accessTokens.no")}</button>
                  </span>
                ) : (
                  <button data-testid={`token-revoke-button-${tok.id}`} type="button" onClick={() => setConfirmDelete(tok.id)}
                    style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}>
                    {t("integrations.accessTokens.revoke")}
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

/**
 * Chip-based multi-site picker. One chip per available site; click toggles
 * membership. Avoids the native `<select multiple>` (which breaks our
 * design system and ignores CustomSelect convention).
 */
function SiteChipPicker({
  sites,
  selected,
  onChange,
}: {
  sites: Array<{ id: string; name: string; orgId: string }>;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const t = useT();
  if (sites.length === 0) {
    return <span style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", alignSelf: "center" }}>
      {t("integrations.accessTokens.noSites")}
    </span>;
  }
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
      {sites.map((s) => {
        const active = selected.includes(s.id);
        return (
          <button
            data-testid={`token-site-chip-${s.id}`}
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            style={{
              fontSize: "0.7rem",
              padding: "0.25rem 0.6rem",
              borderRadius: "999px",
              border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
              background: active ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--background)",
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              fontFamily: "monospace",
              cursor: "pointer",
            }}
          >
            {active ? "✓ " : ""}{s.id}
          </button>
        );
      })}
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
  t: TFn,
  name: string,
  permissions: Permission[],
  resources: ResourceFilter[],
  ipFilters: IpFilter[],
  notBefore: string,
  notAfter: string,
  sites: Array<{ id: string; name: string; orgId: string }>,
): string[] {
  if (!name.trim()) return [t("integrations.accessTokens.previewNeedName")];
  if (permissions.length === 0) return [t("integrations.accessTokens.previewNeedPermission")];

  const lines: string[] = [];
  const siteById = new Map(sites.map((s) => [s.id, s.name]));
  const includes = resources.filter((r) => r.effect === "include" && r.scope === "site");
  const excludes = resources.filter((r) => r.effect === "exclude");

  const scopeText = (() => {
    if (includes.length === 0 && excludes.length === 0) return t("integrations.accessTokens.scopeAny");
    const includedNames = includes.flatMap((r) =>
      r.targets === "*" ? [t("integrations.accessTokens.allSites")] : r.targets.map((id) => siteById.get(id) ?? id),
    );
    const excludedNames = excludes.flatMap((r) =>
      r.targets === "*" ? [t("integrations.accessTokens.all")] : (Array.isArray(r.targets) ? r.targets : []),
    );
    let text = includedNames.length > 0 ? t("integrations.accessTokens.scopeOn", { sites: includedNames.join(", ") }) : t("integrations.accessTokens.scopeAny");
    if (excludedNames.length > 0) text = t("integrations.accessTokens.scopeExcept", { scope: text, sites: excludedNames.join(", ") });
    return text;
  })();

  for (const p of permissions) {
    if (p === "*") { lines.push(t("integrations.accessTokens.doAnything", { scope: scopeText })); continue; }
    const [area, action] = p.split(":");
    lines.push(t("integrations.accessTokens.previewLine", { action: capitalize(action), area, scope: scopeText }));
  }

  if (ipFilters.length > 0) {
    const ins = ipFilters.filter((f) => f.op === "in").flatMap((f) => f.cidrs).filter(Boolean);
    const notIns = ipFilters.filter((f) => f.op === "not_in").flatMap((f) => f.cidrs).filter(Boolean);
    const bits: string[] = [];
    if (ins.length > 0) bits.push(t("integrations.accessTokens.fromIp", { ips: ins.join(", ") }));
    if (notIns.length > 0) bits.push(t("integrations.accessTokens.neverFrom", { ips: notIns.join(", ") }));
    if (bits.length) lines.push("…" + bits.join(" "));
  }
  if (notBefore || notAfter) {
    const range = [notBefore && t("integrations.accessTokens.fromDate", { date: new Date(notBefore).toLocaleDateString() }), notAfter && t("integrations.accessTokens.untilDate", { date: new Date(notAfter).toLocaleDateString() })].filter(Boolean).join(" ");
    if (range) lines.push(`…${range}`);
  }

  return lines;
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
