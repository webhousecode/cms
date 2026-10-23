import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { builtinBlocks } from "@webhouse/cms";
import { notFound } from "next/navigation";
import { DocumentEditor } from "@/components/editor/document-editor";
import { TabTitle } from "@/lib/tabs-context";
import { readSiteConfig } from "@/lib/site-config";
import { getSiteRole } from "@/lib/require-role";
import { getActiveSiteEntry } from "@/lib/site-paths";
import { hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions-shared";
import { getServerT } from "@/i18n/server";
import { localizeBuiltinBlocks } from "@/lib/localize-builtin-blocks";

type Props = {
  params: Promise<{ collection: string; slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export default async function DocumentPage({ params, searchParams }: Props) {
  const { collection, slug } = await params;
  const { from } = await searchParams;
  const [cms, config, siteConfig, siteRole, siteEntry, t] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig(), getSiteRole(), getActiveSiteEntry(), getServerT()]);

  const colConfig = config.collections.find((c) => c.name === collection);
  if (!colConfig) notFound();

  const doc = await cms.content.findBySlug(collection, slug);
  if (!doc) notFound();

  const docTitle = String(doc.data?.title ?? doc.data?.name ?? doc.data?.label ?? doc.slug);

  // Translations are loaded async client-side by DocumentEditor
  // via /api/cms/collections/[name]/[slug]/translations

  return (
    <>
      <TabTitle value={docTitle} />
      <DocumentEditor
        key={doc.id}
        collection={collection}
        colConfig={colConfig}
        blocksConfig={[...localizeBuiltinBlocks(builtinBlocks, t), ...(config.blocks ?? [])]}
        locales={siteConfig.locales?.length ? siteConfig.locales : (config.locales ?? [])}
        defaultLocale={siteConfig.defaultLocale || config.defaultLocale || "en"}
        initialDoc={{
          id: doc.id,
          slug: doc.slug,
          status: doc.status,
          locale: doc.locale,
          translationOf: doc.translationOf,
          translationGroup: doc.translationGroup,
          publishAt: doc.publishAt,
          unpublishAt: doc.unpublishAt,
          data: doc.data,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        }}
        translations={[]}
        siblingData={[]}
        previewSiteUrl={siteConfig.previewSiteUrl}
        previewInIframe={siteConfig.previewInIframe}
        siteId={siteEntry?.id}
        inlineEditEnabled={siteConfig.inlineEditEnabled}
        canEditContent={siteRole ? hasPermission(ROLE_PERMISSIONS[siteRole] ?? [], "content.edit") : false}
        localeStrategy={siteConfig.localeStrategy ?? "prefix-other"}
        backHref={from === "curation" ? "/admin/curation" : undefined}
        readOnly={siteRole === "viewer"}
      />
    </>
  );
}
