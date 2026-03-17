export const dynamic = "force-dynamic";

import { getAdminConfig } from "@/lib/cms";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CollectionSchemaEditor } from "@/components/schema/collection-schema-editor";
import { PageHeader } from "@/components/page-header";

type Props = { params: Promise<{ collection: string }>; searchParams: Promise<{ from?: string }> };

export default async function EditCollectionPage({ params, searchParams }: Props) {
  const { collection } = await params;
  const { from } = await searchParams;

  const { readSiteConfig } = await import("@/lib/site-config");
  const { schemaEditEnabled } = await readSiteConfig();
  if (!schemaEditEnabled) {
    redirect("/admin/settings");
  }
  const config = await getAdminConfig();

  if (collection === "new") {
    return (
      <>
        <PageHeader>
          <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <span className="text-sm text-muted-foreground font-mono">settings / new collection</span>
        </PageHeader>
        <div className="p-8 max-w-3xl">
          <CollectionSchemaEditor isNew />
        </div>
      </>
    );
  }

  const col = config.collections.find((c) => c.name === collection);
  if (!col) notFound();

  return (
    <>
      <PageHeader>
        <Link href={from === "settings" ? "/admin/settings?tab=schema" : `/admin/${col.name}`} className="text-muted-foreground hover:text-foreground transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm text-muted-foreground font-mono">{from === "settings" ? `settings / schema / ${col.name}` : `${col.label ?? col.name} / schema`}</span>
      </PageHeader>
      <div className="p-8 max-w-3xl">
        <CollectionSchemaEditor
          collection={{
            name: col.name,
            label: col.label,
            urlPrefix: (col as { urlPrefix?: string }).urlPrefix,
            fields: col.fields,
          }}
        />
      </div>
    </>
  );
}
