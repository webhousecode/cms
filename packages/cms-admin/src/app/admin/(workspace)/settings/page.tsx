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
import { SectionHeading } from "@/components/ui/section-heading";
import { readSiteConfig } from "@/lib/site-config";
import { readBrandVoice } from "@/lib/brand-voice";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Only admins can access Settings
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (session) {
    const members = await getTeamMembers();
    const membership = members.find((m) => m.userId === session.sub);
    if (!membership || membership.role !== "admin") {
      redirect("/admin");
    }
  }

  const [config, siteConfig, brandVoice] = await Promise.all([
    getAdminConfig(),
    readSiteConfig(),
    readBrandVoice(),
  ]);
  const { tab = "general" } = await searchParams;

  const globals = config.collections.filter((c) => c.name === "global");

  const tabs = [
    { id: "general",     label: "General" },
    { id: "team",        label: "Team" },
    { id: "email",       label: "Email" },
    { id: "ai",          label: "AI" },
    { id: "brand-voice", label: "Brand Voice" },
    { id: "tools",       label: "Automation" },
    { id: "mcp",         label: "MCP" },
    ...(globals.length > 0 ? [{ id: "globals", label: "Globals" }] : []),
    ...(siteConfig.schemaEditEnabled ? [{ id: "schema", label: "Schema" }] : []),
    { id: "prompts", label: "AI Prompts" },
  ];

  return (
    <>
      <ActionBar actions={<SettingsSaveButton />}>
        <ActionBarBreadcrumb items={["Site Settings"]} />
      </ActionBar>
      <div className="p-8 max-w-4xl">

        {/* Tab strip */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/admin/settings?tab=${t.id}`}
              className={`px-4 py-2 text-sm font-medium -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* General tab — site-specific settings */}
        {tab === "general" && (
          <div className="max-w-lg">
            <SiteGeneralSettingsPanel />
          </div>
        )}

        {/* Team tab */}
        {tab === "team" && (
          <div className="max-w-2xl">
            <TeamPanel />
          </div>
        )}

        {/* Email tab */}
        {tab === "email" && (
          <div className="max-w-lg">
            <SectionHeading>Email</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
              Configure transactional email for invitations and notifications.
            </p>
            <EmailSettingsPanel />
          </div>
        )}

        {/* Schema tab */}
        {tab === "schema" && siteConfig.schemaEditEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <SectionHeading>Collections</SectionHeading>
                <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem" }}>
                  Edit collection names, labels, and field definitions.
                </p>
              </div>
              <Link href="/admin/settings/new">
                <Button size="sm" className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  New collection
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
                      {col.name} · {col.fields.length} fields
                    </p>
                  </div>
                </div>
                <Link href={`/admin/settings/${col.name}?from=settings`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit schema
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Brand Voice tab */}
        {tab === "brand-voice" && (
          <div className="max-w-2xl">
            {brandVoice ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>{brandVoice.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{brandVoice.industry} · {brandVoice.language}</p>
                  </div>
                  <Link href="/admin/settings/brand-voice">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> Edit / Re-interview
                    </Button>
                  </Link>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground mb-3 font-medium">Brand persona</p>
                  <p className="text-sm leading-relaxed">{brandVoice.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {brandVoice.brandPersonality.map((p) => (
                      <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Tone", value: brandVoice.primaryTone },
                    { label: "Target audience", value: brandVoice.targetAudience },
                    { label: "Content pillars", value: brandVoice.contentPillars.join(", ") },
                    { label: "SEO keywords", value: brandVoice.seoKeywords.join(", ") },
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
                  <p className="font-semibold text-foreground">No brand voice defined yet</p>
                  <p className="text-sm text-muted-foreground mt-1">A short AI interview will define your site persona, tone and content goals — used by every agent.</p>
                </div>
                <Link href="/admin/settings/brand-voice">
                  <Button className="gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5" /> Start interview
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Globals tab */}
        {tab === "globals" && globals.length > 0 && (
          <div className="space-y-3 max-w-2xl">
            <p className="text-sm text-muted-foreground">
              Global collections contain site-wide settings and data shared across all pages.
            </p>
            {globals.map((col) => (
              <div key={col.name} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{col.label ?? col.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{col.name} · {col.fields.length} fields</p>
                  </div>
                </div>
                <Link href={`/admin/${col.name}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* AI tab */}
        {tab === "ai" && (
          <div className="max-w-lg">
            <SectionHeading>AI Providers</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
              Configure API keys for AI-powered content generation and rewriting.
              Keys are stored per project — not shared across sites.
            </p>
            <AISettingsPanel />

            <div style={{ borderTop: "1px solid var(--border)", marginTop: "2rem", paddingTop: "2rem" }}>
              <SectionHeading>AI Model Defaults</SectionHeading>
              <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
                Choose default models and token limits for different AI features.
              </p>
              <AIDefaultsPanel />
            </div>
          </div>
        )}

        {/* Tools tab — backup & link checker scheduling */}
        {tab === "tools" && (
          <div className="max-w-lg">
            <ToolsSettingsPanel />
          </div>
        )}

        {/* MCP tab */}
        {tab === "mcp" && (
          <div className="max-w-lg">
            <SectionHeading>Model Context Protocol</SectionHeading>
            <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.25rem" }}>
              Connect Claude iOS, Cursor, or any MCP-compatible AI client to read and manage content on this site.
            </p>
            <MCPSettingsPanel />
          </div>
        )}

        {/* AI Prompts tab */}
        {tab === "prompts" && (
          <div className="max-w-3xl">
            <AIPromptsPanel />
          </div>
        )}
      </div>
    </>
  );
}
