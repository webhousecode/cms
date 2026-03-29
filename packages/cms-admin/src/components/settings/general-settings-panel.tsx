"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, AlertTriangle, Copy, RefreshCw, Zap, Send } from "lucide-react";
import { switchSite } from "@/lib/switch-context";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { Checkbox } from "@/components/ui/checkbox-styled";

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

function InputRow({ label, description, copiable, ...inputProps }: {
	label: string; description?: string; copiable?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
	const [copied, setCopied] = useState(false);
	function handleCopy() {
		const v = String(inputProps.value ?? "");
		if (!v) return;
		navigator.clipboard.writeText(v).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
			<label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{label}</label>
			{description && <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0 }}>{description}</p>}
			<div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
				<input
					{...inputProps}
					style={{
						flex: 1, padding: "0.45rem 0.75rem", borderRadius: "7px",
						border: "1px solid var(--border)", background: "var(--background)",
						color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
						width: "100%", boxSizing: "border-box",
					}}
					onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
					onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
				/>
				{copiable && inputProps.value && (
					<button type="button" onClick={handleCopy} title="Copy to clipboard"
						style={{
							width: "32px", height: "32px", borderRadius: "6px",
							border: "1px solid var(--border)", background: "transparent",
							cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
							color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)", flexShrink: 0,
						}}>
						{copied ? <Check style={{ width: "0.85rem", height: "0.85rem" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
					</button>
				)}
			</div>
		</div>
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

/* ─── F79: Validate Site button ─────────────────────────────────── */
function ValidateSiteButton({ configPath, contentDir }: { configPath: string; contentDir: string }) {
	const [validating, setValidating] = useState(false);
	const [result, setResult] = useState<{ valid: boolean; errors: Array<{ level: string; path: string; message: string; suggestion?: string }>; warnings: Array<{ level: string; path: string; message: string; suggestion?: string }> } | null>(null);

	async function validate() {
		if (!configPath) return;
		setValidating(true);
		setResult(null);
		try {
			const res = await fetch("/api/cms/registry/validate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ configPath, contentDir: contentDir || undefined }),
			});
			setResult(await res.json());
		} catch {
			setResult({ valid: false, errors: [{ level: "error", path: "", message: "Validation request failed" }], warnings: [] });
		}
		setValidating(false);
	}

	return (
		<div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
				<button type="button" onClick={validate} disabled={validating || !configPath}
					style={{
						display: "inline-flex", alignItems: "center", gap: "0.3rem",
						padding: "0.35rem 0.75rem", borderRadius: "6px", border: "none",
						background: configPath ? "#F7BB2E" : "var(--border)",
						color: configPath ? "#0D0D0D" : "var(--muted-foreground)",
						cursor: configPath ? "pointer" : "default",
						fontSize: "0.75rem", fontWeight: 600,
					}}>
					{validating ? "Validating..." : "Validate site"}
				</button>
				{result && (
					<span style={{
						fontSize: "0.72rem", fontWeight: 600,
						color: result.valid && result.warnings.length === 0 ? "#4ade80"
							: result.valid ? "#F7BB2E" : "#f87171",
					}}>
						{result.valid && result.warnings.length === 0 ? "✓ All good"
							: result.valid ? `✓ Valid (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`
							: `✗ ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`}
					</span>
				)}
			</div>
			{result && (result.errors.length > 0 || result.warnings.length > 0) && (
				<div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
					{result.errors.map((e, i) => (
						<div key={`e-${i}`} style={{ fontSize: "0.72rem", color: "#f87171", padding: "0.375rem 0.5rem", background: "rgba(248,113,113,0.08)", borderRadius: "4px" }}>
							<span style={{ fontWeight: 600 }}>Error:</span> {e.message}
							{e.suggestion && <span style={{ color: "var(--muted-foreground)", display: "block", marginTop: "0.15rem" }}>💡 {e.suggestion}</span>}
						</div>
					))}
					{result.warnings.map((w, i) => (
						<div key={`w-${i}`} style={{ fontSize: "0.72rem", color: "#F7BB2E", padding: "0.375rem 0.5rem", background: "rgba(247,187,46,0.08)", borderRadius: "4px" }}>
							<span style={{ fontWeight: 600 }}>Warning:</span> {w.message}
							{w.suggestion && <span style={{ color: "var(--muted-foreground)", display: "block", marginTop: "0.15rem" }}>💡 {w.suggestion}</span>}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/* ─── Profile section ─────────────────────────────────────────── */
function ProfileSection() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

	const [showLogoIcon, setShowLogoIcon] = useState(false); // default: wordmark
	useEffect(() => {
		fetch("/api/admin/profile")
			.then((r) => r.ok ? r.json() : null)
			.then((profile: { showLogoIcon?: boolean } | null) => {
				if (profile && typeof profile.showLogoIcon === "boolean") {
					setShowLogoIcon(profile.showLogoIcon);
				}
			})
			.catch(() => {});
	}, []);

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
			.then((d: { user?: { name: string; email: string } | null }) => {
				if (d.user) { setName(d.user.name); setEmail(d.user.email); }
			});
	}, []);

	async function saveProfile(e: FormEvent) {
		e.preventDefault();
		setSaving(true); setError(""); setSaved(false);
		try {
			const res = await fetch("/api/admin/profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email }),
			});
			const d = (await res.json()) as { error?: string };
			if (!res.ok) { setError(d.error ?? "Save failed"); }
			else { setSaved(true); toast.success("Profile saved"); setTimeout(() => setSaved(false), 2500); }
		} catch (err) {
			console.error("[saveProfile] error:", err);
			setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div>
			<SectionHeading>Profile</SectionHeading>
			<Card>
				<form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
					<InputRow label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
					<InputRow label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required copiable />
					<div>
						<label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.25rem" }}>Sidebar logo</label>
						<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>Choose which logo to display in the sidebar.</p>
						<div style={{ display: "flex", gap: "0.5rem" }}>
							{([
								{ value: true, label: "Icon (eye)" },
								{ value: false, label: "Wordmark" },
							] as const).map(({ value, label }) => (
								<button
									key={String(value)}
									type="button"
									onClick={() => {
										setShowLogoIcon(value);
										window.dispatchEvent(new CustomEvent("cms:logo-icon-changed", { detail: value }));
										fetch("/api/admin/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showLogoIcon: value }) }).catch(() => {});
									}}
									style={{
										flex: 1, padding: "0.5rem 0.75rem", borderRadius: "6px", cursor: "pointer",
										border: showLogoIcon === value ? "2px solid var(--primary)" : "1px solid var(--border)",
										background: showLogoIcon === value ? "var(--accent)" : "transparent",
										color: showLogoIcon === value ? "var(--foreground)" : "var(--muted-foreground)",
										fontSize: "0.8rem", fontWeight: 500, textAlign: "center",
									}}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					<ErrorMsg msg={error} />
					<div><SaveButton saving={saving} saved={saved} /></div>
				</form>
			</Card>
		</div>
	);
}

/* ─── Site section ────────────────────────────────────────────── */
function SiteSection() {
	const router = useRouter();
	const [siteName, setSiteName] = useState("");
	const [siteNameOriginal, setSiteNameOriginal] = useState("");
	const [cfg, setCfg] = useState({
		previewSiteUrl: "",
		previewInIframe: false,
		trashRetentionDays: 30,
		curationRetentionDays: 30,
		schemaEditEnabled: false,
		devInspector: false,
		showCloseAllTabs: false,
		defaultLocale: "en",
		locales: [] as string[],
		localeStrategy: "prefix-other",
		autoRetranslateOnUpdate: false,
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const [configPath, setConfigPath] = useState("");
	const [contentDir, setContentDir] = useState("");

	useEffect(() => {
		let resolvedDir = "";
		// Fetch site-config first (has resolved paths), then registry (has names)
		Promise.all([
			fetch("/api/admin/site-config", { cache: "no-store" }).then((r) => r.json()),
			fetch("/api/cms/registry", { cache: "no-store" }).then((r) => r.json()),
		]).then(([cfg, reg]: [any, { registry?: { orgs: Array<{ id: string; sites: Array<{ id: string; name: string; configPath?: string; contentDir?: string; github?: { contentDir?: string } }> }> } }]) => {
			setCfg(cfg);
			resolvedDir = cfg.resolvedContentDir ?? "";

			if (reg.registry) {
				const orgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1];
				const siteId = document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1];
				if (orgId && siteId) {
					const org = reg.registry.orgs.find((o) => o.id === decodeURIComponent(orgId));
					const site = org?.sites.find((s) => s.id === decodeURIComponent(siteId));
					if (site) {
						setSiteName(site.name);
						setSiteNameOriginal(site.name);
						setConfigPath(site.configPath ?? "");
					}
				}
			}
			// Prefer resolved full path, fall back to registry value
			setContentDir(resolvedDir || "");
		});
	}, []);

	async function handleSave(e: FormEvent) {
		e.preventDefault();
		setSaving(true); setError(""); setSaved(false);
		try {
			const res = await fetch("/api/admin/site-config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(cfg),
			});
			const d = await res.json();
			if (!res.ok) { setError((d as { error?: string }).error ?? "Save failed"); }
			else {
				setCfg(d);
				// Update site name in registry if changed
				if (siteName.trim() && siteName !== siteNameOriginal) {
					const orgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1];
					const siteId = document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1];
					if (orgId && siteId) {
						await fetch("/api/cms/registry/rename", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ orgId: decodeURIComponent(orgId), siteId: decodeURIComponent(siteId), name: siteName.trim() }),
						});
						setSiteNameOriginal(siteName.trim());
						window.dispatchEvent(new CustomEvent("cms-registry-change"));
					}
				}
				setSaved(true);
				toast.success("Site settings saved");
				setTimeout(() => setSaved(false), 2500);
				window.dispatchEvent(new CustomEvent("cms:site-config-updated", { detail: d }));
				router.refresh();
			}
		} catch {
			setError("Network error — could not save");
		} finally {
			setSaving(false);
			window.dispatchEvent(new CustomEvent("cms:settings-saved"));
		}
	}

	// Listen for ActionBar save event
	const formRef = useRef<HTMLFormElement>(null);
	useEffect(() => {
		function onSave() { formRef.current?.requestSubmit(); }
		window.addEventListener("cms:settings-save", onSave);
		return () => window.removeEventListener("cms:settings-save", onSave);
	}, []);

	return (
		<form ref={formRef} onSubmit={handleSave} onChange={() => window.dispatchEvent(new CustomEvent("cms:settings-dirty"))} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
			<div>
				<SectionHeading first>Site</SectionHeading>
				<Card>
					<InputRow
						label="Site name"
						description="Display name shown in the site switcher and Sites Dashboard."
						value={siteName}
						onChange={(e) => setSiteName(e.target.value)}
						placeholder="My Site"
					/>
					<InputRow
						label="Config path"
						description="Absolute path to cms.config.ts on the filesystem."
						value={configPath}
						onChange={(e) => setConfigPath(e.target.value)}
						placeholder="/Users/.../cms.config.ts"
						style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
						copiable
					/>
					<InputRow
						label="Content directory"
						description="Absolute path to the content folder. Defaults to content/ next to config."
						value={contentDir}
						onChange={(e) => setContentDir(e.target.value)}
						placeholder="/Users/.../content"
						style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
						copiable
					/>
					<ValidateSiteButton configPath={configPath} contentDir={contentDir} />
				</Card>
			</div>

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
						copiable
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
					<div style={{ height: "1px", background: "var(--border)" }} />
					<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
						<div style={{ flex: 1 }}>
							<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Curation queue retention</p>
							<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>Days before approved/published items are removed from the curation queue.</p>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
							<input
								type="number"
								min={1}
								max={365}
								value={cfg.curationRetentionDays}
								onChange={(e) => setCfg((c) => ({ ...c, curationRetentionDays: parseInt(e.target.value) || 30 }))}
								style={{ width: "72px", padding: "0.4rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.875rem", textAlign: "center", outline: "none" }}
								onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
								onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
							/>
							<span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>days</span>
						</div>
					</div>
				</Card>
			</div>

			<LanguageSection cfg={cfg} setCfg={setCfg} />

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
		</form>
	);
}

/* ─── Language section (F48 i18n) ──────────────────────────────── */

import { LOCALE_LABELS, LOCALE_FLAGS } from "@/lib/locale";

const AVAILABLE_LOCALES = Object.keys(LOCALE_LABELS);

function LanguageSection({ cfg, setCfg: _setCfg }: {
	cfg: { defaultLocale: string; locales: string[]; localeStrategy: string; autoRetranslateOnUpdate: boolean };
	setCfg: (fn: (c: any) => any) => void;
}) {
	// Wrap setCfg to always dispatch dirty (buttons don't trigger form onChange)
	const setCfg: typeof _setCfg = (fn) => { _setCfg(fn); window.dispatchEvent(new CustomEvent("cms:settings-dirty")); };
	const [adding, setAdding] = useState(false);

	function addLocale(locale: string) {
		setCfg((c: any) => {
			const next = [...(c.locales || [])];
			if (!next.includes(locale)) next.push(locale);
			// Ensure defaultLocale is always in locales when there are multiple
			if (!next.includes(c.defaultLocale) && next.length > 0) next.unshift(c.defaultLocale);
			return { ...c, locales: next };
		});
		setAdding(false);
	}

	function removeLocale(locale: string) {
		setCfg((c: any) => {
			const next = (c.locales || []).filter((l: string) => l !== locale);
			// If removing all extra locales, clear the array
			if (next.length <= 1) return { ...c, locales: [] };
			return { ...c, locales: next };
		});
	}

	const currentLocales = cfg.locales?.length ? cfg.locales : [];
	const availableToAdd = AVAILABLE_LOCALES.filter((l) => !currentLocales.includes(l) && l !== cfg.defaultLocale);

	return (
		<div>
			<SectionHeading>Language</SectionHeading>
			<Card>
				<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
					<div>
						<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Default language</p>
						<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
							The primary language for content on this site.
						</p>
					</div>
					<CustomSelect
						value={cfg.defaultLocale || "en"}
						onChange={(v) => setCfg((c: any) => {
							const next = { ...c, defaultLocale: v };
							// If locales array exists, update it to include new default
							if (next.locales?.length > 0 && !next.locales.includes(v)) {
								next.locales = [v, ...next.locales.filter((l: string) => l !== c.defaultLocale)];
							}
							return next;
						})}
						options={AVAILABLE_LOCALES.map((l) => ({
							value: l,
							label: `${LOCALE_FLAGS[l] || ""} ${LOCALE_LABELS[l] || l} (${l})`,
						}))}
						placeholder="Select language"
					/>
				</div>

				<div style={{ height: "1px", background: "var(--border)" }} />

				<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
					<div>
						<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Supported languages</p>
						<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
							Additional languages this site supports. Content can be translated to these languages.
						</p>
					</div>

					{currentLocales.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
							{currentLocales.map((l) => (
								<span
									key={l}
									style={{
										display: "inline-flex", alignItems: "center", gap: "0.35rem",
										padding: "0.25rem 0.6rem", borderRadius: "6px",
										background: l === cfg.defaultLocale
											? "color-mix(in srgb, var(--primary) 15%, transparent)"
											: "var(--accent)",
										fontSize: "0.8rem", fontWeight: 500,
										color: l === cfg.defaultLocale ? "var(--primary)" : "var(--foreground)",
									}}
								>
									{LOCALE_FLAGS[l] || ""} {LOCALE_LABELS[l] || l}
									{l === cfg.defaultLocale && (
										<span style={{ fontSize: "0.65rem", opacity: 0.7 }}>default</span>
									)}
									{l !== cfg.defaultLocale && (
										<button
											type="button"
											onClick={() => removeLocale(l)}
											style={{
												background: "none", border: "none", cursor: "pointer",
												color: "var(--muted-foreground)", fontSize: "0.75rem",
												padding: "0 0.1rem", lineHeight: 1,
											}}
											title={`Remove ${LOCALE_LABELS[l] || l}`}
										>
											&times;
										</button>
									)}
								</span>
							))}
						</div>
					)}

					{adding ? (
						<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
							<CustomSelect
								value=""
								onChange={(v) => { if (v) addLocale(v); }}
								options={availableToAdd.map((l) => ({
									value: l,
									label: `${LOCALE_FLAGS[l] || ""} ${LOCALE_LABELS[l] || l} (${l})`,
								}))}
								placeholder="Select language to add"
							/>
							<button
								type="button"
								onClick={() => setAdding(false)}
								style={{
									padding: "0.4rem 0.75rem", borderRadius: "6px",
									border: "1px solid var(--border)", background: "transparent",
									color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer",
								}}
							>
								Cancel
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setAdding(true)}
							style={{
								alignSelf: "flex-start",
								padding: "0.4rem 0.75rem", borderRadius: "6px",
								border: "1px solid var(--border)", background: "transparent",
								color: "var(--foreground)", fontSize: "0.8rem", cursor: "pointer",
							}}
						>
							+ Add language
						</button>
					)}
				</div>

				{cfg.locales?.length > 1 && (
					<>
						<div style={{ height: "1px", background: "var(--border)" }} />
						<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
							<div>
								<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>URL strategy</p>
								<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
									How locale prefixes appear in URLs.
								</p>
							</div>
							<CustomSelect
								value={cfg.localeStrategy || "prefix-other"}
								onChange={(v) => setCfg((c: any) => ({ ...c, localeStrategy: v }))}
								options={[
									{ value: "prefix-other", label: "Prefix non-default — /posts/slug/ + /en/posts/slug/" },
									{ value: "prefix-all", label: "Prefix all — /da/posts/slug/ + /en/posts/slug/" },
									{ value: "none", label: "No prefix — /posts/slug/ (all locales)" },
								]}
							/>
						</div>
						{/* Auto-retranslate on update */}
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderTop: "1px solid var(--border)" }}>
							<div>
								<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Auto-retranslate on update</p>
								<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
									Automatically re-translate stale translations when the source document is updated.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setCfg((c: any) => ({ ...c, autoRetranslateOnUpdate: !c.autoRetranslateOnUpdate }))}
								style={{
									width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
									background: cfg.autoRetranslateOnUpdate ? "#F7BB2E" : "var(--muted)",
									position: "relative", transition: "background 0.2s", flexShrink: 0,
								}}
							>
								<span style={{
									position: "absolute", top: 2, left: cfg.autoRetranslateOnUpdate ? 20 : 2,
									width: 18, height: 18, borderRadius: "50%", background: "#fff",
									transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
								}} />
							</button>
						</div>

					</>
				)}
			</Card>
		</div>
	);
}

/* ─── Revalidation section ─────────────────────────────────────── */
function RevalidationSection() {
	const [adapter, setAdapter] = useState<string | null>(null); // null = loading
	const [url, setUrl] = useState("");
	const [secret, setSecret] = useState("");
	const [showSecret, setShowSecret] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");
	const [pinging, setPinging] = useState(false);
	const [pingResult, setPingResult] = useState<{ ok: boolean; status?: number; error?: string } | null>(null);
	const [copied, setCopied] = useState<"url" | "secret" | null>(null);
	const [log, setLog] = useState<Array<{ timestamp: string; paths: string[]; ok: boolean; status: number | null; durationMs: number }>>([]);
	const [previewUrl, setPreviewUrl] = useState("");
	const [logOpen, setLogOpen] = useState(false);

	const revalFormRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		fetch("/api/cms/revalidation")
			.then((r) => r.json())
			.then((d) => {
				setAdapter(d.adapter ?? "filesystem");
				setUrl(d.revalidateUrl ?? "");
				setSecret(d.revalidateSecret ?? "");
				setLog(d.log ?? []);
			})
			.catch(() => { setAdapter("filesystem"); });
		// Load preview URL for auto-generate
		fetch("/api/admin/site-config")
			.then((r) => r.json())
			.then((d: { previewSiteUrl?: string }) => {
				setPreviewUrl(d.previewSiteUrl ?? "");
			})
			.catch(() => { });
	}, []);

	useEffect(() => {
		function onSave() { revalFormRef.current?.requestSubmit(); }
		window.addEventListener("cms:settings-save", onSave);
		return () => window.removeEventListener("cms:settings-save", onSave);
	}, []);

	// Only show for GitHub-backed sites
	if (adapter === null) return null; // Loading
	if (adapter === "filesystem") return null;

	// Wrapped in fragment with leading HR so it doesn't leave orphan dividers
	const SectionWrapper = ({ children }: { children: React.ReactNode }) => (
		<>
			<div style={{ height: "1px", background: "var(--border)" }} />
			{children}
		</>
	);

	function autoGenerateUrl() {
		if (!previewUrl) return;
		const base = previewUrl.replace(/\/+$/, "");
		setUrl(`${base}/api/revalidate`);
	}

	async function handleSave(e: FormEvent) {
		e.preventDefault();
		setSaving(true); setError(""); setSaved(false);
		try {
			const res = await fetch("/api/cms/revalidation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "save", revalidateUrl: url, revalidateSecret: secret }),
			});
			if (!res.ok) {
				const d = await res.json();
				setError(d.error ?? "Save failed");
			} else {
				setSaved(true);
				setTimeout(() => setSaved(false), 2500);
			}
		} catch {
			setError("Network error — could not save");
		} finally {
			setSaving(false);
			window.dispatchEvent(new CustomEvent("cms:settings-saved"));
		}
	}

	function generateSecret() {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		setSecret(Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
	}

	async function copyToClipboard(text: string, which: "url" | "secret") {
		await navigator.clipboard.writeText(text);
		setCopied(which);
		setTimeout(() => setCopied(null), 2000);
	}

	async function sendPing() {
		setPinging(true); setPingResult(null);
		try {
			const res = await fetch("/api/cms/revalidation", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "test-ping" }),
			});
			const d = await res.json();
			setPingResult(d);
			// Refresh log
			const logRes = await fetch("/api/cms/revalidation");
			const logData = await logRes.json();
			setLog(logData.log ?? []);
		} catch (err) {
			setPingResult({ ok: false, error: String(err) });
		}
		setPinging(false);
	}

	return (
		<SectionWrapper><div>
			<SectionHeading>Revalidation</SectionHeading>
			<form ref={revalFormRef} onSubmit={handleSave} onChange={() => window.dispatchEvent(new CustomEvent("cms:settings-dirty"))} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
				<Card>
					<div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
						<Zap style={{ width: "1rem", height: "1rem", color: "var(--primary)", flexShrink: 0, marginTop: "0.15rem" }} />
						<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>
							When content changes, <span style={{ color: "var(--foreground)", fontWeight: 600 }}>webhouse</span><span style={{ color: "#F7BB2E", fontWeight: 600 }}>.app</span> sends a signed webhook to your site&apos;s revalidation endpoint,
							triggering on-demand path revalidation. Only needed for production deployments.
						</p>
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
						<label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Revalidation URL</label>
						<div style={{ display: "flex", gap: "0.375rem" }}>
							<input
								type="url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://example.com/api/revalidate"
								style={{
									flex: 1, padding: "0.45rem 0.75rem", borderRadius: "7px",
									border: "1px solid var(--border)", background: "var(--background)",
									color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
								}}
								onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
								onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
							/>
							{!url && previewUrl && (
								<button
									type="button"
									onClick={autoGenerateUrl}
									style={{ padding: "0.4rem 0.65rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
									title="Auto-generate from Preview Site URL"
								>
									<Zap style={{ width: "0.75rem", height: "0.75rem" }} />
									Auto
								</button>
							)}
							{url && (
								<button
									type="button"
									onClick={() => copyToClipboard(url, "url")}
									style={{ padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}
									title="Copy URL"
								>
									{copied === "url" ? <Check style={{ width: "0.85rem", height: "0.85rem", color: "#4ade80" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
								</button>
							)}
						</div>
						{!url && previewUrl && (
							<p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "0.1rem 0 0" }}>
								Click Auto to generate from your Preview URL: <code style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--muted)" }}>{previewUrl.replace(/\/+$/, "")}/api/revalidate</code>
							</p>
						)}
					</div>

					<div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
						<label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Webhook Secret</label>
						<div style={{ display: "flex", gap: "0.375rem" }}>
							<div style={{ position: "relative", flex: 1 }}>
								<input
									type={showSecret ? "text" : "password"}
									value={secret}
									onChange={(e) => setSecret(e.target.value)}
									placeholder="HMAC-SHA256 signing secret"
									style={{
										width: "100%", boxSizing: "border-box",
										padding: "0.45rem 2.25rem 0.45rem 0.75rem", borderRadius: "7px",
										border: "1px solid var(--border)", background: "var(--background)",
										color: "var(--foreground)", fontSize: "0.875rem", outline: "none",
										fontFamily: showSecret ? "monospace" : "inherit",
									}}
									onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
									onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
								/>
								<button
									type="button"
									onClick={() => setShowSecret((v) => !v)}
									style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.1rem" }}
								>
									{showSecret ? <EyeOff style={{ width: "0.9rem", height: "0.9rem" }} /> : <Eye style={{ width: "0.9rem", height: "0.9rem" }} />}
								</button>
							</div>
							<button
								type="button"
								onClick={generateSecret}
								style={{ padding: "0.4rem 0.65rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.75rem", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.3rem" }}
								title="Generate a random secret"
							>
								<RefreshCw style={{ width: "0.75rem", height: "0.75rem" }} />
								Generate
							</button>
							{secret && (
								<button
									type="button"
									onClick={() => copyToClipboard(secret, "secret")}
									style={{ padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}
									title="Copy secret"
								>
									{copied === "secret" ? <Check style={{ width: "0.85rem", height: "0.85rem", color: "#4ade80" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
								</button>
							)}
						</div>
						<p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
							Add this secret to your site&apos;s <code style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--muted)" }}>.env</code> as <code style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--muted)" }}>REVALIDATE_SECRET</code>
						</p>
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
						<ErrorMsg msg={error} />
						<div style={{ display: "flex", gap: "0.5rem" }}>
							{url && (
								<button
									type="button"
									onClick={sendPing}
									disabled={pinging}
									style={{
										display: "inline-flex", alignItems: "center", gap: "0.375rem",
										padding: "0.45rem 0.875rem", borderRadius: "7px",
										border: "1px solid var(--border)", background: "transparent",
										color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 500,
										cursor: pinging ? "wait" : "pointer",
									}}
								>
									<Send style={{ width: "0.75rem", height: "0.75rem" }} />
									{pinging ? "Pinging…" : "Send test ping"}
								</button>
							)}
						</div>
					</div>

					{pingResult && (
						<div style={{
							padding: "0.625rem 0.875rem", borderRadius: "7px",
							border: `1px solid ${pingResult.ok ? "color-mix(in srgb, green 30%, transparent)" : "color-mix(in srgb, var(--destructive) 30%, transparent)"}`,
							background: pingResult.ok ? "color-mix(in srgb, green 8%, transparent)" : "color-mix(in srgb, var(--destructive) 8%, transparent)",
							fontSize: "0.8rem",
						}}>
							{pingResult.ok
								? `Ping successful (HTTP ${pingResult.status})`
								: `Ping failed${pingResult.status ? ` (HTTP ${pingResult.status})` : ""}: ${pingResult.error ?? "Unknown error"}`
							}
						</div>
					)}
				</Card>

				{/* Recent delivery log */}
				{log.length > 0 && (
					<div style={{ marginTop: "0.25rem" }}>
						<button
							type="button"
							onClick={() => setLogOpen((v) => !v)}
							style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: logOpen ? "0.5rem" : 0, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}
						>
							<span style={{ display: "inline-block", transform: logOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms", fontSize: "0.6rem" }}>&#9654;</span>
							Recent deliveries ({log.length})
						</button>
						{logOpen && <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
							{log.slice(0, 10).map((entry, i) => (
								<div
									key={i}
									style={{
										display: "flex", alignItems: "center", gap: "0.625rem",
										padding: "0.5rem 0.75rem", fontSize: "0.75rem",
										borderBottom: i < Math.min(log.length, 10) - 1 ? "1px solid var(--border)" : undefined,
										background: i % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--muted) 30%, transparent)",
									}}
								>
									<span style={{
										width: "0.5rem", height: "0.5rem", borderRadius: "50%", flexShrink: 0,
										background: entry.ok ? "#22c55e" : "var(--destructive)",
									}} />
									<span style={{ color: "var(--muted-foreground)", fontFamily: "monospace", fontSize: "0.65rem", minWidth: "3.5rem" }}>
										{entry.status ?? "err"}
									</span>
									<span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
										{entry.paths.join(", ")}
									</span>
									<span style={{ color: "var(--muted-foreground)", fontSize: "0.65rem", flexShrink: 0 }}>
										{entry.durationMs}ms
									</span>
									<span style={{ color: "var(--muted-foreground)", fontSize: "0.65rem", flexShrink: 0 }}>
										{new Date(entry.timestamp).toLocaleTimeString()}
									</span>
								</div>
							))}
						</div>}
					</div>
				)}
			</form>
		</div></SectionWrapper>
	);
}

/* ─── Danger zone ─────────────────────────────────────────────── */
function DangerZone() {
	const [confirm, setConfirm] = useState(false);
	const [purging, setPurging] = useState(false);
	const [done, setDone] = useState(false);
	const [count, setCount] = useState<number | null>(null);
	// F84: Move site to other org
	const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
	const [activeOrgId, setActiveOrgId] = useState("");
	const [activeSiteId, setActiveSiteId] = useState("");
	const [activeSiteName, setActiveSiteName] = useState("");
	const [targetOrgId, setTargetOrgId] = useState("");
	const [moveConfirm, setMoveConfirm] = useState(false);
	const [moving, setMoving] = useState(false);
	const [moveDone, setMoveDone] = useState(false);

	useEffect(() => {
		fetch("/api/cms/registry")
			.then((r) => r.ok ? r.json() : {})
			.then((d: { registry?: { orgs: { id: string; name: string; sites: { id: string; name: string }[] }[]; defaultOrgId: string } }) => {
				if (!d.registry) return;
				const orgCookie = document.cookie.match(/cms-active-org=([^;]*)/)?.[1] ?? d.registry.defaultOrgId;
				const siteCookie = document.cookie.match(/cms-active-site=([^;]*)/)?.[1] ?? "";
				setActiveOrgId(orgCookie);
				setActiveSiteId(siteCookie);
				// Find site name
				const org = d.registry.orgs.find((o) => o.id === orgCookie);
				const site = org?.sites.find((s) => s.id === siteCookie);
				if (site) setActiveSiteName(site.name);
				// Other orgs (exclude current)
				setOrgs(d.registry.orgs.filter((o) => o.id !== orgCookie).map((o) => ({ id: o.id, name: o.name })));
			})
			.catch(() => {});
	}, []);

	async function purgeTrash() {
		setPurging(true);
		const res = await fetch("/api/cms/trash?purge=true", { method: "DELETE" });
		const d = (await res.json()) as { deleted?: number };
		setCount(d.deleted ?? 0);
		setDone(true);
		setConfirm(false);
		setPurging(false);
	}

	async function handleMove() {
		setMoving(true);
		try {
			const res = await fetch("/api/cms/registry/move-site", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteId: activeSiteId, fromOrgId: activeOrgId, toOrgId: targetOrgId }),
			});
			if (res.ok) {
				setMoveDone(true);
				switchSite(activeSiteId, targetOrgId, "/admin/sites");
				return;
			}
		} finally {
			setMoving(false);
		}
	}

	const targetOrgName = orgs.find((o) => o.id === targetOrgId)?.name ?? "";

	return (
		<div>
			<SectionHeading>Danger zone</SectionHeading>
			<div style={{ background: "color-mix(in srgb, var(--destructive) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--destructive) 25%, transparent)", borderRadius: "10px", padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
				{/* Purge trash */}
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

				{/* F84: Move site to other org */}
				{orgs.length > 0 && (
					<>
						<div style={{ borderTop: "1px solid color-mix(in srgb, var(--destructive) 15%, transparent)", paddingTop: "0.875rem" }}>
							<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
								<div>
									<p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>Move site to another organization</p>
									<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: "0.15rem 0 0" }}>
										Transfer this site and all its settings to a different organization.
									</p>
								</div>
								{!moveConfirm && !moveDone && (
									<div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
										<div style={{ minWidth: "200px" }}>
											<CustomSelect
												value={targetOrgId}
												onChange={(v) => setTargetOrgId(v)}
												options={[{ value: "", label: "Select org..." }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]}
											/>
										</div>
										<button
											type="button"
											disabled={!targetOrgId}
											onClick={() => setMoveConfirm(true)}
											style={{ padding: "0.4rem 0.875rem", borderRadius: "6px", border: "1px solid color-mix(in srgb, var(--destructive) 40%, transparent)", background: "transparent", color: targetOrgId ? "var(--destructive)" : "var(--muted-foreground)", fontSize: "0.8rem", cursor: targetOrgId ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
										>
											Move site
										</button>
									</div>
								)}
								{moveDone && (
									<span style={{ fontSize: "0.8rem", color: "rgb(74 222 128)", flexShrink: 0 }}>
										Moved to {targetOrgName} — redirecting...
									</span>
								)}
							</div>
						</div>

						{moveConfirm && (
							<div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.75rem", background: "var(--card)", borderRadius: "7px", border: "1px solid var(--border)" }}>
								<AlertTriangle style={{ width: "0.9rem", height: "0.9rem", color: "var(--destructive)", flexShrink: 0 }} />
								<span style={{ fontSize: "0.8rem", flex: 1 }}>
									Move <strong>{activeSiteName || activeSiteId}</strong> to <strong>{targetOrgName}</strong>? Settings and content will be preserved.
								</span>
								<button type="button" onClick={() => setMoveConfirm(false)} style={{ padding: "0.3rem 0.625rem", borderRadius: "5px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted-foreground)", fontSize: "0.75rem", cursor: "pointer" }}>No</button>
								<button type="button" onClick={handleMove} disabled={moving} style={{ padding: "0.3rem 0.625rem", borderRadius: "5px", border: "none", background: "var(--destructive)", color: "#fff", fontSize: "0.75rem", cursor: moving ? "wait" : "pointer" }}>
									{moving ? "Moving…" : "Yes"}
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

/* ─── Exports ─────────────────────────────────────────────────── */

/** Account Preferences → General tab — profile, zoom */
export function GeneralSettingsPanel() {
	return (
		<div className="space-y-8">
			<ProfileSection />
			<div style={{ height: "1px", background: "var(--border)" }} />
			<UserPreferencesSection />
		</div>
	);
}

function UserPreferencesSection() {
	const [calendarView, setCalendarView] = useState("week");
	const [agentsView, setAgentsView] = useState("grid");
	const [mediaView, setMediaView] = useState("grid");
	const [intsView, setIntsView] = useState("grid");
	const [showCloseAll, setShowCloseAll] = useState(false);

	useEffect(() => {
		fetch("/api/admin/user-state").then((r) => r.ok ? r.json() : null).then((state) => {
			if (state?.calendarView) setCalendarView(state.calendarView);
			if (state?.agentsView) setAgentsView(state.agentsView);
			if (state?.mediaView) setMediaView(state.mediaView);
			if (state?.intsView) setIntsView(state.intsView);
			if (state?.showCloseAllTabs !== undefined) setShowCloseAll(state.showCloseAllTabs);
		}).catch(() => {});
	}, []);

	function savePref(patch: Record<string, unknown>) {
		fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
			.then(() => window.dispatchEvent(new CustomEvent("cms:user-state-updated", { detail: patch })))
			.catch(() => {});
	}

	const fieldLabel: React.CSSProperties = { fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" };
	const gridList = [{ value: "grid", label: "Grid" }, { value: "list", label: "List" }];

	return (
		<>
			<div>
				<SectionHeading>Default Views</SectionHeading>
				<Card>
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
						<div>
							<label style={fieldLabel}>Calendar</label>
							<CustomSelect
								options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }]}
								value={calendarView}
								onChange={(v) => { setCalendarView(v); savePref({ calendarView: v }); }}
							/>
						</div>
						<div>
							<label style={fieldLabel}>Agents</label>
							<CustomSelect options={gridList} value={agentsView} onChange={(v) => { setAgentsView(v); savePref({ agentsView: v }); }} />
						</div>
						<div>
							<label style={fieldLabel}>Media</label>
							<CustomSelect options={gridList} value={mediaView} onChange={(v) => { setMediaView(v); savePref({ mediaView: v }); }} />
						</div>
						<div>
							<label style={fieldLabel}>Interactives</label>
							<CustomSelect options={gridList} value={intsView} onChange={(v) => { setIntsView(v); savePref({ intsView: v }); }} />
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
						checked={showCloseAll}
						onChange={(v) => { setShowCloseAll(v); savePref({ showCloseAllTabs: v }); }}
					/>
				</Card>
			</div>
		</>
	);
}

/** Account Preferences → Security tab — change password */
export function PasswordChangePanel() {
	const [curPw, setCurPw] = useState("");
	const [newPw, setNewPw] = useState("");
	const [showCur, setShowCur] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [pwSaving, setPwSaving] = useState(false);
	const [pwSaved, setPwSaved] = useState(false);
	const [pwError, setPwError] = useState("");

	async function savePassword(e: FormEvent) {
		e.preventDefault();
		setPwSaving(true); setPwError(""); setPwSaved(false);
		try {
			const res = await fetch("/api/admin/profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
			});
			const d = (await res.json()) as { error?: string };
			if (!res.ok) { setPwError(d.error ?? "Failed"); toast.error("Failed to change password"); }
			else { setPwSaved(true); setCurPw(""); setNewPw(""); toast.success("Password changed"); setTimeout(() => setPwSaved(false), 2500); }
		} catch {
			setPwError("Network error — could not save");
		} finally {
			setPwSaving(false);
		}
	}

	return (
		<div>
			<SectionHeading>Change password</SectionHeading>
			<Card>
				<form onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
					<div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
						<label style={{ fontSize: "0.75rem", fontWeight: 500 }}>Current password</label>
						<div style={{ position: "relative" }}>
							<input
								type={showCur ? "text" : "password"} value={curPw} onChange={(e) => setCurPw(e.target.value)} required
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
								type={showNew ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} placeholder="Min 8 characters"
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
	);
}

/** Site Settings → General tab — site-specific (preview, retention, dev) */
function SchedulerNotificationsSection() {
	const [webhookUrl, setWebhookUrl] = useState("");
	const [enabled, setEnabled] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/admin/site-config")
			.then((r) => r.json())
			.then((config) => {
				setWebhookUrl(config.schedulerWebhookUrl ?? "");
				setEnabled(config.schedulerNotifications ?? false);
			})
			.catch(() => {});
	}, []);

	async function save() {
		setSaving(true);
		await fetch("/api/admin/site-config", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ schedulerWebhookUrl: webhookUrl, schedulerNotifications: enabled }),
		});
		setSaving(false);
		setSaved(true);
		toast.success("Notification settings saved");
		setTimeout(() => setSaved(false), 2000);
	}

	async function testWebhook() {
		if (!webhookUrl) return;
		setTesting(true);
		setTestResult(null);
		try {
			const isDiscord = webhookUrl.includes("discord.com/api/webhooks");
			const isSlack = webhookUrl.includes("hooks.slack.com");
			const body = isDiscord
				? { content: "Test notification from CMS Scheduler", embeds: [{ title: "Test Event", description: "This is a test notification.", color: 0xF7BB2E, footer: { text: "CMS Scheduler" } }] }
				: isSlack
					? { text: "*CMS Scheduler Test* — This is a test notification." }
					: { event: "scheduler.test", timestamp: new Date().toISOString() };

			const res = await fetch(webhookUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (res.ok) {
				setTestResult("sent");
				toast.success("Test notification sent");
			} else {
				setTestResult(`failed (${res.status})`);
				toast.error("Webhook test failed");
			}
		} catch (err) {
			setTestResult(`error: ${err}`);
			toast.error("Webhook test failed");
		}
		setTesting(false);
	}

	const inputStyle: React.CSSProperties = {
		width: "100%",
		padding: "0.5rem 0.75rem",
		borderRadius: "7px",
		border: "1px solid var(--border)",
		background: "var(--background)",
		color: "var(--foreground)",
		fontSize: "0.85rem",
		outline: "none",
		boxSizing: "border-box",
	};

	return (
		<div>
			<SectionHeading>Scheduler Notifications</SectionHeading>
			<Card>
				<p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
					Get notified when the scheduler auto-publishes or unpublishes content. Works with Discord, Slack, or any webhook.
				</p>

				<Checkbox
					checked={enabled}
					onChange={(v) => setEnabled(v)}
					label="Enable scheduler notifications"
				/>

				{enabled && (
					<>
						<div>
							<label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
								Webhook URL
							</label>
							<input
								type="url"
								value={webhookUrl}
								onChange={(e) => setWebhookUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
								style={inputStyle}
							/>
							<p style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "0.25rem" }}>
								Discord, Slack, or any URL that accepts JSON POST
							</p>
						</div>

						<div style={{ display: "flex", gap: "0.5rem" }}>
							<button
								type="button"
								onClick={save}
								disabled={saving}
								style={{
									padding: "0.4rem 1rem", borderRadius: "6px",
									background: "var(--primary)", color: "var(--primary-foreground)",
									border: "none", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
								}}
							>
								{saving ? "Saving..." : saved ? "Saved" : "Save"}
							</button>
							{webhookUrl && (
								<button
									type="button"
									onClick={testWebhook}
									disabled={testing}
									style={{
										padding: "0.4rem 1rem", borderRadius: "6px",
										background: "transparent", color: "var(--foreground)",
										border: "1px solid var(--border)", fontSize: "0.8rem", cursor: "pointer",
									}}
								>
									{testing ? "Sending..." : "Send test"}
								</button>
							)}
							{testResult && (
								<span style={{ fontSize: "0.75rem", color: testResult === "sent" ? "rgb(74 222 128)" : "var(--destructive)", alignSelf: "center" }}>
									{testResult === "sent" ? "Test sent" : testResult}
								</span>
							)}
						</div>
					</>
				)}
			</Card>
		</div>
	);
}

export function SiteGeneralSettingsPanel() {
	return (
		<div>
			<SiteSection />
			<RevalidationSection />
			<DangerZone />
		</div>
	);
}
