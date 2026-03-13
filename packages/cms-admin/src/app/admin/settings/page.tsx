import { getAdminConfig } from "@/lib/cms";
import Link from "next/link";
import { Database, Plus, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { AISettingsPanel } from "@/components/settings/ai-settings-panel";
import { GeneralSettingsPanel } from "@/components/settings/general-settings-panel";
import { readSiteConfig } from "@/lib/site-config";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [config, siteConfig] = await Promise.all([getAdminConfig(), readSiteConfig()]);
  const { tab = "general" } = await searchParams;

  const tabs = [
    { id: "general", label: "General" },
    { id: "ai",      label: "AI" },
    ...(siteConfig.schemaEditEnabled ? [{ id: "schema", label: "Schema" }] : []),
  ];

  return (
    <>
      <PageHeader>
        <span className="text-sm text-muted-foreground font-mono">Settings</span>
      </PageHeader>
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Settings</p>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 mb-8 border-b border-border">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/admin/settings?tab=${t.id}`}
              className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
                tab === t.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        {/* General tab */}
        {tab === "general" && (
          <div className="max-w-lg">
            <GeneralSettingsPanel />
          </div>
        )}

        {/* Schema tab */}
        {tab === "schema" && siteConfig.schemaEditEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-foreground">Collections</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
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
                <Link href={`/admin/settings/${col.name}`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit schema
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* AI tab */}
        {tab === "ai" && (
          <div className="max-w-lg">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-foreground">AI Providers</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configure API keys for AI-powered content generation and rewriting.
                Keys are stored per project — not shared across sites.
              </p>
            </div>
            <AISettingsPanel />
          </div>
        )}
      </div>
    </>
  );
}
