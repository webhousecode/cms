export const dynamic = "force-dynamic";

import { getAdminCms, getAdminConfig } from "@/lib/cms";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewDocumentButton } from "@/components/new-document-button";
import { GenerateDocumentButton } from "@/components/generate-document-button";
import { CollectionListPage } from "@/components/collection-list-page";
import { TabTitle } from "@/lib/tabs-context";
import { Edit2 } from "lucide-react";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { SchemaDriftBanner } from "@/components/schema-drift-banner";

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

  // F102: Schema drift detection — compare content keys vs schema fields
  const SYSTEM_KEYS = new Set(["_fieldMeta", "_lastEditedBy", "_trashedAt", "_trashedBy", "_lockedFields"]);
  const schemaKeys = new Set(colConfig.fields.map((f) => f.name));
  const contentKeys = new Set<string>();
  const sample = sorted.filter((d) => (d.status as string) !== "trashed").slice(0, 5);
  for (const doc of sample) {
    const data = (doc as { data?: Record<string, unknown> }).data;
    if (!data) continue;
    for (const key of Object.keys(data)) {
      if (!SYSTEM_KEYS.has(key) && !key.startsWith("_")) {
        contentKeys.add(key);
      }
    }
  }
  const driftFields = [...contentKeys].filter((k) => !schemaKeys.has(k)).sort();

  return (
    <>
      <TabTitle value={colConfig.label ?? collection} />
      {driftFields.length > 0 && (
        <SchemaDriftBanner
          collection={colConfig.label ?? collection}
          collectionName={collection}
          fields={driftFields}
        />
      )}
      <CollectionListPage
        collection={collection}
        collectionLabel={colConfig.label ?? collection}
        titleField={colConfig.fields[0]?.name ?? "title"}
        fields={colConfig.fields}
        initialDocs={sorted}
        readOnly={!canWrite}
        urlPrefix={colConfig.urlPrefix}
        urlPattern={(colConfig as any).urlPattern}
        localeStrategy={siteConfig.localeStrategy ?? "prefix-other"}
        schemaEnabled={schemaEnabled}
        defaultLocale={siteConfig.defaultLocale || config.defaultLocale}
        siteLocales={siteConfig.locales?.length ? siteConfig.locales : config.locales}
      />
    </>
  );
}
