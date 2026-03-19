export const dynamic = "force-dynamic";

import { getAdminCms, getAdminConfig } from "@/lib/cms";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewDocumentButton } from "@/components/new-document-button";
import { GenerateDocumentButton } from "@/components/generate-document-button";
import { CollectionList } from "@/components/collection-list";
import { TabTitle } from "@/lib/tabs-context";
import { Button } from "@/components/ui/button";
import { Edit2 } from "lucide-react";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";

type Props = { params: Promise<{ collection: string }> };

export default async function CollectionPage({ params }: Props) {
  const { collection } = await params;
  const [cms, config, siteConfig, siteRole] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig(), getSiteRole()]);
  const schemaEnabled = siteConfig.schemaEditEnabled;
  const canWrite = siteRole !== "viewer";

  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) notFound();

  const { documents } = await cms.content.findMany(collection, {});

  const sorted = [...documents].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <>
      <TabTitle value={colConfig.label ?? collection} />
      <ActionBar
        actions={canWrite ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {schemaEnabled && (
              <Link href={`/admin/settings/${collection}`}>
                <button type="button" style={{
                  height: "28px", display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0 0.65rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500,
                  background: "transparent", color: "var(--foreground)", border: "1px solid var(--border)",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                  <Edit2 style={{ width: 14, height: 14 }} />
                  Edit schema
                </button>
              </Link>
            )}
            <GenerateDocumentButton collection={collection} collectionLabel={colConfig.label ?? collection} />
            <NewDocumentButton collection={collection} titleField={colConfig.fields[0]?.name ?? "title"} defaultLocale={config.defaultLocale} />
          </div>
        ) : undefined}
      >
        <ActionBarBreadcrumb items={[colConfig.label ?? collection]} />
      </ActionBar>
    <div style={{ padding: "2rem", maxWidth: "88rem" }}>

      <CollectionList
        collection={collection}
        titleField={colConfig.fields[0]?.name ?? "title"}
        fields={colConfig.fields}
        initialDocs={sorted}
        readOnly={!canWrite}
      />
    </div>
    </>
  );
}
