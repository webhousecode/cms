import { getAdminConfig } from "@/lib/cms";
import Link from "next/link";
import { Database, Plus, Edit2, Fingerprint, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { SettingsSaveButton } from "@/components/settings/settings-save-button";
import { AISettingsPanel } from "@/components/settings/ai-settings-panel";
import { SiteGeneralSettingsPanel } from "@/components/settings/general-settings-panel";
import { MCPSettingsPanel } from "@/components/settings/mcp-settings-panel";
import { AIPromptsPanel } from "@/components/settings/ai-prompts-panel";
import { AIDefaultsPanel } from "@/components/settings/ai-defaults-panel";
import { TeamPanel } from "@/components/settings/team-panel";
import { EmailSettingsPanel } from "@/components/settings/email-settings-panel";
import { ToolsSettingsPanel } from "@/components/settings/tools-settings-panel";
import { CapabilitiesSettingsPanel } from "@/components/settings/capabilities-settings-panel";
import { DeploySettingsPanel } from "@/components/settings/deploy-settings-panel";
import { SiteDomainsPanel } from "@/components/settings/site-domains-panel";
import { BuildSettingsPanel } from "@/components/settings/build-settings-panel";
import { GeoSettingsPanel } from "@/components/settings/geo-settings-panel";
import { BackupSettingsPanel } from "@/components/settings/backup-settings-panel";
import { BeamSettingsPanel } from "@/components/settings/beam-settings-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { HelpCard } from "@/components/ui/help-card";
import { readSiteConfig } from "@/lib/site-config";
import { readBrandVoice } from "@/lib/brand-voice";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { redirect } from "next/navigation";
import { SettingsAnchorScroll } from "@/components/settings/settings-anchor";
import { resolveMembershipRole } from "@/lib/require-role";
import { getServerT } from "@/i18n/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Only admins can access Settings
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) redirect("/admin/login");
  const members = await getTeamMembers();
  const role = resolveMembershipRole(session, members);
  if (role !== "admin") {
    redirect("/admin");
  }

  const [config, siteConfig, brandVoice] = await Promise.all([
    getAdminConfig(),
    readSiteConfig(),
    readBrandVoice(),
  ]);
  const { tab = "general" } = await searchParams;
  const activeOrgId = cookieStore.get("cms-active-org")?.value ?? "default";

  const globals = config.collections.filter((c) => c.kind === "global");
  const t = await getServerT();

  const tabs = [
    { id: "general",     label: t("pages.settings.tabs.general") },
    { id: "capabilities", label: t("pages.settings.tabs.features") },
    { id: "team",        label: t("pages.settings.tabs.team") },
    { id: "email",       label: t("pages.settings.tabs.email") },
    { id: "ai",          label: t("pages.settings.tabs.ai") },
    { id: "brand-voice", label: t("pages.settings.tabs.brandVoice") },
    { id: "deploy",      label: t("pages.settings.tabs.deploy") },
    { id: "build",       label: t("pages.settings.tabs.build") },
    { id: "backup",      label: t("pages.settings.tabs.backup") },
    { id: "tools",       label: t("pages.settings.tabs.automation") },
    { id: "geo",         label: t("pages.settings.tabs.geo") },
    { id: "mcp",         label: t("pages.settings.tabs.mcp") },
    { id: "beam",        label: t("pages.settings.tabs.beam") },
    ...(globals.length > 0 ? [{ id: "globals", label: t("pages.settings.tabs.globals") }] : []),
    { id: "schema", label: t("pages.settings.tabs.schema") },
    { id: "prompts", label: t("pages.settings.tabs.aiPrompts") },
  ];

  return (
    <div data-testid="settings-root">
      <SettingsAnchorScroll />
      <ActionBar
        actions={<SettingsSaveButton />}
        favorite={{ type: "page", label: "Site Settings", path: "/admin/settings", icon: "Settings2" }}
      >
        <ActionBarBreadcrumb items={[t("pages.settings.siteSettings")]} />
      </ActionBar>
      <div className="p-8">

        {/* Tab strip */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((tb) => (
            <Link
              key={tb.id}
              href={`/admin/settings?tab=${tb.id}`}
              data-testid={`settings-tab-${tb.id}`}
              className={`px-4 py-2 text-sm font-medium -mb-px transition-colors whitespace-nowrap ${
                tab === tb.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb.label}
            </Link>
          ))}
        </div>

        <div className="max-w-4xl">

        {/* General tab — site-specific settings */}
        {tab === "general" && (
          <div className="max-w-lg" data-testid="settings-panel-general">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-general" variant="compact" /></div>
            <SiteGeneralSettingsPanel />
          </div>
        )}

        {/* Team tab */}
        {tab === "team" && (
          <div className="max-w-2xl" data-testid="settings-panel-team">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-team" variant="compact" /></div>
            <TeamPanel />
          </div>
        )}

        {/* Email tab */}
        {tab === "email" && (
          <div className="max-w-lg" data-testid="settings-panel-email">
            <SectionHeading>{t("pages.settings.email.heading")}</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
              {t("pages.settings.email.description")}
            </p>
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-email" variant="compact" /></div>
            <EmailSettingsPanel />
          </div>
        )}

        {/* Schema tab */}
        {tab === "schema" && (
          <div className="space-y-2">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-schema" variant="compact" /></div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <SectionHeading>{t("pages.settings.schema.heading")}</SectionHeading>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem" }}>
                  {t("pages.settings.schema.description")}
                </p>
              </div>
              <Link href="/admin/settings/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  {t("pages.settings.schema.newCollection")}
                </Button>
              </Link>
            </div>
            {config.collections.map((col) => (
              <div
                key={col.name}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-3">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{col.label ?? col.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {t("pages.settings.fieldCount", { name: col.name, count: col.fields.length })}
                    </p>
                  </div>
                </div>
                <Link href={`/admin/settings/${col.name}?from=settings`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" />
                    {t("pages.settings.schema.editSchema")}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Brand Voice tab */}
        {tab === "brand-voice" && (
          <div className="max-w-2xl">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-brand-voice" variant="compact" /></div>
            {brandVoice ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>{brandVoice.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{brandVoice.industry} · {brandVoice.language}</p>
                  </div>
                  <Link href="/admin/settings/brand-voice">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> {t("pages.settings.brandVoice.editReinterview")}
                    </Button>
                  </Link>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground mb-3 font-medium">{t("pages.settings.brandVoice.persona")}</p>
                  <p className="text-sm leading-relaxed">{brandVoice.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {brandVoice.brandPersonality.map((p) => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: t("pages.settings.brandVoice.tone"), value: brandVoice.primaryTone },
                    { label: t("pages.settings.brandVoice.targetAudience"), value: brandVoice.targetAudience },
                    { label: t("pages.settings.brandVoice.contentPillars"), value: brandVoice.contentPillars.join(", ") },
                    { label: t("pages.settings.brandVoice.seoKeywords"), value: brandVoice.seoKeywords.join(", ") },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                      <p className="text-sm">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-6 flex flex-col items-start gap-4">
                <Fingerprint className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">{t("pages.settings.brandVoice.emptyTitle")}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t("pages.settings.brandVoice.emptyBody")}</p>
                </div>
                <Link href="/admin/settings/brand-voice">
                  <Button className="gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5" /> {t("pages.settings.brandVoice.startInterview")}
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Globals tab */}
        {tab === "globals" && globals.length > 0 && (
          <div className="space-y-3 max-w-2xl">
            <HelpCard articleId="settings-globals" variant="compact" />
            <p className="text-sm text-muted-foreground">
              {t("pages.settings.globals.description")}
            </p>
            {globals.map((col) => (
              <div key={col.name} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{col.label ?? col.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("pages.settings.fieldCount", { name: col.name, count: col.fields.length })}</p>
                  </div>
                </div>
                <Link href={`/admin/content/${col.name}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" /> {t("pages.settings.globals.edit")}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* AI tab */}
        {tab === "ai" && (
          <div className="max-w-lg" data-testid="settings-panel-ai">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-ai" variant="compact" /></div>
            <SectionHeading>{t("pages.settings.ai.providersHeading")}</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
              {t("pages.settings.ai.providersDescription")}
            </p>
            <AISettingsPanel />

            <div style={{ borderTop: "1px solid var(--border)", marginTop: "2rem", paddingTop: "2rem" }}>
              <SectionHeading>{t("pages.settings.ai.defaultsHeading")}</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
                {t("pages.settings.ai.defaultsDescription")}
              </p>
              <AIDefaultsPanel />
            </div>
          </div>
        )}

        {/* Deploy tab */}
        {tab === "deploy" && (
          <div className="max-w-lg" data-testid="settings-panel-deploy">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-deploy" variant="compact" /></div>
            <DeploySettingsPanel />
            {/* Which addresses the site is trusted on. Lives beside the deploy
                settings because that is where a person looks for "what are this
                site's addresses" — even though the list governs live editing and
                form submissions, not deploys. */}
            <div style={{ marginTop: "1.5rem" }}><SiteDomainsPanel /></div>
          </div>
        )}

        {/* Build tab — output browser + SSR build history. Full max-w-4xl
            (no max-w-lg) so the preview iframe gets the workspace width. */}
        {tab === "build" && (
          <div data-testid="settings-panel-build">
            <BuildSettingsPanel />
          </div>
        )}

        {/* Backup tab — schedule, retention, cloud provider */}
        {tab === "backup" && (
          <div className="max-w-lg" data-testid="settings-panel-backup">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="backup-schedule" variant="compact" /></div>
            <BackupSettingsPanel />
          </div>
        )}

        {/* Tools tab — link checker, webhooks, media */}
        {tab === "tools" && (
          <div className="max-w-lg" data-testid="settings-panel-tools">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-tools" variant="compact" /></div>
            <ToolsSettingsPanel />
          </div>
        )}

        {/* Features tab — F153 per-tenant capability toggles */}
        {tab === "capabilities" && (
          <div className="max-w-lg" data-testid="settings-panel-capabilities">
            <CapabilitiesSettingsPanel />
          </div>
        )}

        {/* GEO tab — AI visibility settings */}
        {tab === "geo" && (
          <div className="max-w-lg" data-testid="settings-panel-geo">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-geo" variant="compact" /></div>
            <GeoSettingsPanel />
          </div>
        )}

        {/* MCP tab */}
        {tab === "mcp" && (
          <div className="max-w-lg" data-testid="settings-panel-mcp">
            <SectionHeading>{t("pages.settings.mcp.heading")}</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
              {t("pages.settings.mcp.description")}
            </p>
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-mcp" variant="compact" /></div>
            <MCPSettingsPanel />
          </div>
        )}

        {/* Beam tab — site teleportation */}
        {tab === "beam" && (
          <div className="max-w-lg" data-testid="settings-panel-beam">
            <SectionHeading>{t("pages.settings.beam.heading")}</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1rem" }}>
              {t("pages.settings.beam.description")}
            </p>
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-beam" variant="compact" /></div>
            <BeamSettingsPanel orgId={activeOrgId} />
          </div>
        )}

        {/* AI Prompts tab */}
        {tab === "prompts" && (
          <div className="max-w-3xl">
            <div style={{ marginBottom: "1rem" }}><HelpCard articleId="settings-prompts" variant="compact" /></div>
            <AIPromptsPanel />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
