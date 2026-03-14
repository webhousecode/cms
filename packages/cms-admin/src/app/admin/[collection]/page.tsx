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

type Props = { params: Promise<{ collection: string }> };

export default async function CollectionPage({ params }: Props) {
  const { collection } = await params;
  const [cms, config, siteConfig] = await Promise.all([getAdminCms(), getAdminConfig(), readSiteConfig()]);
  const schemaEnabled = siteConfig.schemaEditEnabled;

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
          {schemaEnabled && (
            <Link href={`/admin/settings/${collection}`}>
              <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
                <Edit2 className="w-3.5 h-3.5" />
                Edit schema
              </Button>
            </Link>
          )}
          <GenerateDocumentButton collection={collection} collectionLabel={colConfig.label ?? collection} />
          <NewDocumentButton collection={collection} titleField={colConfig.fields[0]?.name ?? "title"} defaultLocale={config.defaultLocale} />
        </div>
      </div>

      <CollectionList
        collection={collection}
        titleField={colConfig.fields[0]?.name ?? "title"}
        initialDocs={sorted}
      />
    </div>
    </>
  );
}
