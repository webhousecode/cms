"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, AlertTriangle, Copy, RefreshCw, Zap, Send } from "lucide-react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";

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

	const [showLogoIcon, setShowLogoIcon] = useState(true);
	useEffect(() => {
		setShowLogoIcon(localStorage.getItem("cms-show-logo-icon") !== "false");
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
		try {
			const res = await fetch("/api/admin/profile", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, zoom }),
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

					<div style={{ height: "1px", background: "var(--border)" }} />
					<Toggle
						label="Show logo icon"
						description="Show the webhouse.app icon above the wordmark in the sidebar."
						checked={showLogoIcon}
						onChange={(v) => {
							setShowLogoIcon(v);
							localStorage.setItem("cms-show-logo-icon", String(v));
							window.dispatchEvent(new CustomEvent("cms:logo-icon-changed", { detail: v }));
							fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showLogoIcon: v }) }).catch(() => {});
						}}
					/>

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
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		fetch("/api/admin/site-config")
			.then((r) => r.json())
			.then((d) => setCfg(d));
		// Load site name from registry
		fetch("/api/cms/registry")
			.then((r) => r.json())
			.then((d: { registry?: { orgs: Array<{ id: string; sites: Array<{ id: string; name: string }> }> } }) => {
				if (!d.registry) return;
				const orgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1];
				const siteId = document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1];
				if (!orgId || !siteId) return;
				const org = d.registry.orgs.find((o) => o.id === decodeURIComponent(orgId));
				const site = org?.sites.find((s) => s.id === decodeURIComponent(siteId));
				if (site) { setSiteName(site.name); setSiteNameOriginal(site.name); }
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
		}
	}

	return (
		<form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
			<div>
				<SectionHeading>Site</SectionHeading>
				<Card>
					<InputRow
						label="Site name"
						description="Display name shown in the site switcher and Sites Dashboard."
						value={siteName}
						onChange={(e) => setSiteName(e.target.value)}
						placeholder="My Site"
					/>
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
			<form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
							<SaveButton saving={saving} saved={saved} />
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

				<label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
					<input
						type="checkbox"
						checked={enabled}
						onChange={(e) => setEnabled(e.target.checked)}
					/>
					Enable scheduler notifications
				</label>

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
		<div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
			<SiteSection />
			<RevalidationSection />
			<div style={{ height: "1px", background: "var(--border)" }} />
			<SchedulerNotificationsSection />
			<div style={{ height: "1px", background: "var(--border)" }} />
			<DangerZone />
		</div>
	);
}
