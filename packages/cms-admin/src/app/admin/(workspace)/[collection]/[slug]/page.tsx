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

  // Fetch sibling translations via translationGroup (bidirectional ID partners)
  const { documents: allDocs } = await cms.content.findMany(collection, {});
  const groupId = (doc as any).translationGroup as string | undefined;
  const translations = groupId
    ? (allDocs as any[])
        .filter(d => d.translationGroup === groupId && d.id !== doc.id && d.status !== "trashed")
        .map(d => ({ slug: d.slug, locale: d.locale ?? null, status: d.status, updatedAt: d.updatedAt }))
    : // Legacy fallback: use translationOf if no translationGroup yet
      (() => {
        const originalSlug = (doc as any).translationOf ?? doc.slug;
        return (allDocs as any[])
          .filter(d =>
            d.slug !== doc.slug &&
            d.status !== "trashed" &&
            (d.translationOf === originalSlug || d.slug === originalSlug)
          )
          .map(d => ({ slug: d.slug, locale: d.locale ?? null, status: d.status, updatedAt: d.updatedAt }));
      })();

  const docTitle = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

  return (
    <>
      <TabTitle value={docTitle} />
      <DocumentEditor
        key={doc.id}
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
          translationGroup: (doc as any).translationGroup,
          publishAt: (doc as any).publishAt,
          unpublishAt: (doc as any).unpublishAt,
          data: doc.data,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }}
        translations={translations}
        siblingData={translations.map(t => {
          const d = allDocs.find(x => x.slug === t.slug);
          return d ? { locale: t.locale ?? "", slug: t.slug, data: (d as any).data } : null;
        }).filter(Boolean) as Array<{ locale: string; slug: string; data: Record<string, unknown> }>}
        previewSiteUrl={siteConfig.previewSiteUrl}
        previewInIframe={siteConfig.previewInIframe}
        localeStrategy={siteConfig.localeStrategy ?? "prefix-other"}
        backHref={from === "curation" ? "/admin/curation" : undefined}
        readOnly={siteRole === "viewer"}
      />
    </>
  );
}
