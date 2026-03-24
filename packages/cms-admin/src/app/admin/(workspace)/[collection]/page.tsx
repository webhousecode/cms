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
      <CollectionListPage
        collection={collection}
        collectionLabel={colConfig.label ?? collection}
        titleField={colConfig.fields[0]?.name ?? "title"}
        fields={colConfig.fields}
        initialDocs={sorted}
        readOnly={!canWrite}
        urlPrefix={colConfig.urlPrefix}
        schemaEnabled={schemaEnabled}
        defaultLocale={config.defaultLocale}
      />
    </>
  );
}
