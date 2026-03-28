import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { builtinBlocks } from "@webhouse/cms";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/editor/document-editor";
import { TabTitle } from "@/lib/tabs-context";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";

type Props = {
  params: Promise<{ collection: string; slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function DocumentPage({ params, searchParams }: Props) {
  const { collection, slug } = await params;
  const { from } = await searchParams;
  const [cms, config, siteConfig, siteRole] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig(), getSiteRole()]);

  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) notFound();

  const doc = await cms.content.findBySlug(collection, slug);
  if (!doc) notFound();

  // Fetch sibling translations
  const originalSlug = (doc as any).translationOf ?? doc.slug;
  const { documents: allDocs } = await cms.content.findMany(collection, {});
  const translations = (allDocs as any[])
    .filter(d =>
      d.slug !== doc.slug &&
      d.status !== "trashed" &&
      (d.translationOf === originalSlug || d.slug === originalSlug)
    )
    .map(d => ({ slug: d.slug, locale: d.locale ?? null, status: d.status, translationOf: d.translationOf ?? null, updatedAt: d.updatedAt }));

  // If this doc is a translation, find the source document's updatedAt
  const sourceDoc = (doc as any).translationOf
    ? allDocs.find(d => d.slug === (doc as any).translationOf)
    : null;

  const docTitle = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

  return (
    <>
      <TabTitle value={docTitle} />
      <DocumentEditor
        collection={collection}
        colConfig={colConfig}
        blocksConfig={[...builtinBlocks, ...(config.blocks ?? [])]}
        locales={siteConfig.locales?.length ? siteConfig.locales : (config.locales ?? [])}
        defaultLocale={siteConfig.defaultLocale || config.defaultLocale || "en"}
        initialDoc={{
          id: doc.id,
          slug: doc.slug,
          status: doc.status,
          locale: (doc as any).locale,
          translationOf: (doc as any).translationOf,
          publishAt: (doc as any).publishAt,
          unpublishAt: (doc as any).unpublishAt,
          data: doc.data,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }}
        translations={translations}
        sourceUpdatedAt={sourceDoc?.updatedAt}
        sourceData={sourceDoc?.data}
        previewSiteUrl={siteConfig.previewSiteUrl}
        previewInIframe={siteConfig.previewInIframe}
        backHref={from === "curation" ? "/admin/curation" : undefined}
        readOnly={siteRole === "viewer"}
      />
    </>
  );
}
