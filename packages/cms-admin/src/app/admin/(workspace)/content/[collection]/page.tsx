import { getAdminConfig } from "@/lib/cms";
import { notFound } from "next/navigation";
import { CollectionPageClient } from "./collection-page-client";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";

type Props = { params: Promise<{ collection: string }> };

/**
 * Server component — fetches lightweight config only (no content).
 * Documents are loaded client-side by CollectionPageClient.
 */
export default async function CollectionPage({ params }: Props) {
  const { collection } = await params;
  const [config, siteConfig, siteRole] = await Promise.all([getAdminConfig(), readSiteConfig(), getSiteRole()]);

  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) notFound();

  return (
    <CollectionPageClient
      collection={collection}
      collectionLabel={colConfig.label ?? collection}
      titleField={colConfig.fields[0]?.name ?? "title"}
      fields={colConfig.fields}
      readOnly={siteRole === "viewer"}
      urlPrefix={colConfig.urlPrefix}
      urlPattern={(colConfig as any).urlPattern}
      localeStrategy={siteConfig.localeStrategy ?? "prefix-other"}
      schemaEnabled={siteConfig.schemaEditEnabled}
      defaultLocale={siteConfig.defaultLocale || config.defaultLocale}
      siteLocales={siteConfig.locales?.length ? siteConfig.locales : config.locales}
    />
  );
}
