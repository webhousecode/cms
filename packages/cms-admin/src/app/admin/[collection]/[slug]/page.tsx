import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/editor/document-editor";
import { TabTitle } from "@/lib/tabs-context";
import { readSiteConfig } from "@/lib/site-config";

type Props = { params: Promise<{ collection: string; slug: string }> };

export default async function DocumentPage({ params }: Props) {
  const { collection, slug } = await params;
  const [cms, config, siteConfig] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig()]);

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
    .map(d => ({ slug: d.slug, locale: d.locale ?? null, status: d.status, translationOf: d.translationOf ?? null }));

  const docTitle = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

  return (
    <>
      <TabTitle value={docTitle} />
      <DocumentEditor
        collection={collection}
        colConfig={colConfig}
        blocksConfig={config.blocks ?? []}
        locales={config.locales ?? []}
        defaultLocale={config.defaultLocale ?? "en"}
        initialDoc={{
          id: doc.id,
          slug: doc.slug,
          status: doc.status,
          locale: (doc as any).locale,
          translationOf: (doc as any).translationOf,
          data: doc.data,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }}
        translations={translations}
        previewSiteUrl={siteConfig.previewSiteUrl}
        previewInIframe={siteConfig.previewInIframe}
      />
    </>
  );
}
