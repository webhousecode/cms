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
    <div style={{ padding: "2rem", maxWidth: "88rem" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">{collection}</p>
          <h1 className="text-2xl font-bold text-foreground">{colConfig.label ?? collection}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && schemaEnabled && (
            <Link href={`/admin/settings/${collection}`}>
              <button className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border hover:border-primary/40 hover:bg-secondary transition-all text-muted-foreground">
                <Edit2 className="w-3.5 h-3.5" />
                Edit schema
              </button>
            </Link>
          )}
          {canWrite && <GenerateDocumentButton collection={collection} collectionLabel={colConfig.label ?? collection} />}
          {canWrite && <NewDocumentButton collection={collection} titleField={colConfig.fields[0]?.name ?? "title"} defaultLocale={config.defaultLocale} />}
        </div>
      </div>

      <CollectionList
        collection={collection}
        titleField={colConfig.fields[0]?.name ?? "title"}
        fields={colConfig.fields}
        initialDocs={sorted}
      />
    </div>
    </>
  );
}
