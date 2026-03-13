"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

/* ─── Helpers ─────────────────────────────────────────────────── */

function SaveButton({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        display: "inline-flex", alignItems: "center", gap: "0.375rem",
        padding: "0.45rem 1rem", borderRadius: "7px", border: "none",
        background: saved ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "var(--primary)",
        color: saved ? "var(--primary)" : "var(--primary-foreground)",
        fontSize: "0.8rem", fontWeight: 600, cursor: saving ? "wait" : "pointer",
        transition: "all 200ms",
      }}
    >
      {saved ? <><Check style={{ width: "0.8rem", height: "0.8rem" }} /> Saved</> : saving ? "Saving…" : "Save changes"}
    </button>
  );
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", cursor: "pointer" }}>
      <div>
        <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>{description}</p>}
      </div>
      <div
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: "36px", height: "20px", borderRadius: "10px",
          background: checked ? "var(--primary)" : "var(--border)",
          position: "relative", transition: "background 200ms", cursor: "pointer",
        }}
      >
        <div style={{
          position: "absolute", top: "3px",
          left: checked ? "19px" : "3px",
          width: "14px", height: "14px", borderRadius: "50%",
          background: "#fff", transition: "left 200ms",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
    </label>
  );
}

function InputRow({ label, description, ...inputProps }: {
  label: string; description?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{label}</label>
      {description && <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0 }}>{description}</p>}
      <input
        {...inputProps}
        style={{
          padding: "0.45rem 0.75rem", borderRadius: "7px",
          border: "1px solid var(--border)", background: "var(--background)",
          color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
          width: "100%", boxSizing: "border-box",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)", margin: "0 0 0.875rem" }}>
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      {children}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return msg ? <p style={{ fontSize: "0.75rem", color: "var(--destructive)", margin: 0 }}>{msg}</p> : null;
}

const ZOOM_OPTIONS = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150];

/* ─── Profile section ─────────────────────────────────────────── */
function ProfileSection() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [zoom, setZoom] = useState(100);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: { name: string; email: string; zoom?: number } | null }) => {
        if (d.user) { setName(d.user.name); setEmail(d.user.email); setZoom(d.user.zoom ?? 100); }
      });
  }, []);

  function applyZoomPreview(value: number) {
    document.body.style.zoom = value === 100 ? "" : `${value}%`;
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    const res = await fetch("/api/admin/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, zoom }),
    });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) { setError(d.error ?? "Save failed"); }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwSaving(true); setPwError(""); setPwSaved(false);
    const res = await fetch("/api/admin/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
    });
    const d = (await res.json()) as { error?: string };
    if (!res.ok) { setPwError(d.error ?? "Failed"); }
    else { setPwSaved(true); setCurPw(""); setNewPw(""); setTimeout(() => setPwSaved(false), 2500); }
    setPwSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <SectionHeading>Profile</SectionHeading>
        <Card>
          <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <InputRow label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <InputRow label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

            {/* Zoom select */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500, flexShrink: 0 }}>UI zoom</label>
              <CustomSelect
                options={ZOOM_OPTIONS.map((z) => ({ value: String(z), label: z === 100 ? "100% (default)" : `${z}%` }))}
                value={String(zoom)}
                onChange={(v) => { const n = parseInt(v); setZoom(n); applyZoomPreview(n); }}
                style={{ width: "190px" }}
              />
              {zoom !== 100 && (
                <button
                  type="button"
                  onClick={() => { setZoom(100); applyZoomPreview(100); }}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.35rem 0.65rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
              )}
            </div>

            <ErrorMsg msg={error} />
            <div><SaveButton saving={saving} saved={saved} /></div>
          </form>
        </Card>
      </div>

      <div>
        <SectionHeading>Change password</SectionHeading>
        <Card>
          <form onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Current password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showCur ? "text" : "password"}
                  value={curPw}
                  onChange={(e) => setCurPw(e.target.value)}
                  required
                  style={{ padding: "0.45rem 2.25rem 0.45rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                />
                <button type="button" onClick={() => setShowCur((v) => !v)} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.1rem" }}>
                  {showCur ? <EyeOff style={{ width: "0.9rem", height: "0.9rem" }} /> : <Eye style={{ width: "0.9rem", height: "0.9rem" }} />}
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>New password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  style={{ padding: "0.45rem 2.25rem 0.45rem 0.75rem", borderRadius: "7px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", outline: "none", width: "100%", boxSizing: "border-box" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                />
                <button type="button" onClick={() => setShowNew((v) => !v)} style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.1rem" }}>
                  {showNew ? <EyeOff style={{ width: "0.9rem", height: "0.9rem" }} /> : <Eye style={{ width: "0.9rem", height: "0.9rem" }} />}
                </button>
              </div>
            </div>
            <ErrorMsg msg={pwError} />
            <div><SaveButton saving={pwSaving} saved={pwSaved} /></div>
          </form>
        </Card>
      </div>
    </div>
  );
}

/* ─── Site section ────────────────────────────────────────────── */
function SiteSection() {
  const router = useRouter();
  const [cfg, setCfg] = useState({
    previewSiteUrl: "",
    previewInIframe: false,
    trashRetentionDays: 30,
    schemaEditEnabled: false,
    devInspector: false,
    showCloseAllTabs: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.json())
      .then((d) => setCfg(d));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(""); setSaved(false);
    const res = await fetch("/api/admin/site-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    const d = await res.json();
    if (!res.ok) { setError((d as { error?: string }).error ?? "Save failed"); }
    else {
      setCfg(d);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      window.dispatchEvent(new CustomEvent("cms:site-config-updated", { detail: d }));
      router.refresh();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div>
        <SectionHeading>Preview</SectionHeading>
        <Card>
          <InputRow
            label="Preview site URL"
            description="Base URL of the frontend — used for the Preview button on documents."
            type="url"
            value={cfg.previewSiteUrl}
            onChange={(e) => setCfg((c) => ({ ...c, previewSiteUrl: e.target.value }))}
            placeholder="http://localhost:3009"
          />
          <Toggle
            label="Preview in iframe"
            description="Open preview inside the admin panel instead of a new browser tab."
            checked={cfg.previewInIframe}
            onChange={(v) => setCfg((c) => ({ ...c, previewInIframe: v }))}
          />
        </Card>
      </div>

      <div>
        <SectionHeading>Content</SectionHeading>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Trash retention</p>
              <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>Days before trashed documents are permanently deleted.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <input
                type="number"
                min={1}
                max={365}
                value={cfg.trashRetentionDays}
                onChange={(e) => setCfg((c) => ({ ...c, trashRetentionDays: parseInt(e.target.value) || 30 }))}
                style={{ width: "72px", padding: "0.4rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", textAlign: "center", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
              <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>days</span>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <SectionHeading>Interface</SectionHeading>
        <Card>
          <Toggle
            label="Show Close All in tab bar"
            description="Adds a 'Close all' pill next to the new-tab button."
            checked={cfg.showCloseAllTabs}
            onChange={(v) => setCfg((c) => ({ ...c, showCloseAllTabs: v }))}
          />
        </Card>
      </div>

      <div>
        <SectionHeading>Developer</SectionHeading>
        <Card>
          <Toggle
            label="Schema editing"
            description="Allow editing collection schemas from the Settings → Schema tab."
            checked={cfg.schemaEditEnabled}
            onChange={(v) => setCfg((c) => ({ ...c, schemaEditEnabled: v }))}
          />
          <div style={{ height: "1px", background: "var(--border)" }} />
          <Toggle
            label="Dev inspector"
            description="Show the developer overlay with component and query info."
            checked={cfg.devInspector}
            onChange={(v) => setCfg((c) => ({ ...c, devInspector: v }))}
          />
        </Card>
      </div>

      <ErrorMsg msg={error} />
      <div><SaveButton saving={saving} saved={saved} /></div>
    </form>
  );
}

/* ─── Danger zone ─────────────────────────────────────────────── */
function DangerZone() {
  const [confirm, setConfirm] = useState(false);
  const [purging, setPurging] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  async function purgeTrash() {
    setPurging(true);
    const res = await fetch("/api/cms/trash?purge=true", { method: "DELETE" });
    const d = (await res.json()) as { deleted?: number };
    setCount(d.deleted ?? 0);
    setDone(true);
    setConfirm(false);
    setPurging(false);
  }

  return (
    <div>
      <SectionHeading>Danger zone</SectionHeading>
      <div style={{ background: "color-mix(in srgb, var(--destructive) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--destructive) 25%, transparent)", borderRadius: "10px", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Purge trash</p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
              Permanently delete all trashed documents right now, regardless of retention period.
            </p>
          </div>
          {!confirm && !done && (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              style={{ flexShrink: 0, padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid color-mix(in srgb, var(--destructive) 40%, transparent)", background: "transparent", color: "var(--destructive)", fontSize: "0.8rem", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Purge trash
            </button>
          )}
          {done && (
            <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", flexShrink: 0 }}>
              {count === 0 ? "Trash was already empty" : `${count} document${count !== 1 ? "s" : ""} deleted`}
            </span>
          )}
        </div>

        {confirm && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.75rem", background: "var(--card)", borderRadius: "7px", border: "1px solid var(--border)" }}>
            <AlertTriangle style={{ width: "0.9rem", height: "0.9rem", color: "var(--destructive)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.8rem", flex: 1 }}>This cannot be undone. Are you sure?</span>
            <button type="button" onClick={() => setConfirm(false)} style={{ padding: "0.3rem 0.625rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={purgeTrash} disabled={purging} style={{ padding: "0.3rem 0.625rem", borderRadius: "5px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.75rem", cursor: purging ? "wait" : "pointer" }}>
              {purging ? "Purging…" : "Yes, purge"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Export ──────────────────────────────────────────────────── */
export function GeneralSettingsPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <ProfileSection />
      <div style={{ height: "1px", background: "var(--border)" }} />
      <SiteSection />
      <div style={{ height: "1px", background: "var(--border)" }} />
      <DangerZone />
    </div>
  );
}
